import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry } from '@/lib/prisma';
import { listingTimeFieldsForApi, parseDbDate } from '@/utils/parseDbDate';
import { resolveStoredListingImages } from '@/lib/listings/imageStorage';

function normalizeCondition(condition: string | null): 'new' | 'used' | null {
  if (!condition) return null;
  if (condition === 'new') return 'new';
  return 'used';
}

function normalizeFavoritesCount(value: number | bigint | string | undefined): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

function parseJsonStringArray(value: unknown): string[] {
  if (value == null || value === '') return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

/** Пакетне завантаження оголошень за списком id (обране) — формат як у feed. */
export async function GET(request: NextRequest) {
  try {
    const idsParam = request.nextUrl.searchParams.get('ids');
    if (!idsParam) {
      return NextResponse.json({ error: 'ids is required' }, { status: 400 });
    }

    const ids = idsParam
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0)
      .slice(0, 100);

    if (ids.length === 0) {
      return NextResponse.json({ listings: [] });
    }

    const placeholders = ids.map(() => '?').join(',');
    const rows = (await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `
        SELECT
          l.id, l.userId, l.title, l.description, l.price,
          l.previousPrice, l.priceChangedAt,
          COALESCE(l.currency, 'EUR') as currency,
          l.category, l.subcategory, l.location, l.images,
          l.optimizedImages, l.isFree, l.condition, l.status,
          l.createdAt, l.publishedAt, l.views, l.favoritesCount,
          l.expiresAt, l.promotionType, l.promotionEnds,
          u.username as sellerUsername,
          u.firstName as sellerFirstName,
          u.lastName as sellerLastName,
          u.avatar as sellerAvatar,
          CAST(u.telegramId AS TEXT) as sellerTelegramId
        FROM Listing l
        LEFT JOIN User u ON l.userId = u.id
        WHERE l.id IN (${placeholders})
          AND l.status = 'active'
        `,
        ...ids
      )
    )) as Record<string, unknown>[];

    const byId = new Map(rows.map((r) => [Number(r.id), r]));

    const listings = ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((listing) => {
        try {
          const row = listing as Record<string, unknown>;
          const originalImages = parseJsonStringArray(row.images);
          const optimizedImages = parseJsonStringArray(row.optimizedImages);
          const source = optimizedImages.length > 0 ? optimizedImages : originalImages;
          const images = resolveStoredListingImages(source);
          const timeFields = listingTimeFieldsForApi(row as any);
          const sellerName = row.sellerFirstName
            ? `${row.sellerFirstName} ${row.sellerLastName || ''}`.trim()
            : (row.sellerUsername as string) || 'Користувач';
          const isFree = row.isFree === 1 || row.isFree === true;

          return {
            id: Number(row.id),
            title: row.title,
            price: isFree ? 'Free' : row.price,
            previousPrice: row.previousPrice || null,
            priceChangedAt: row.priceChangedAt
              ? parseDbDate(String(row.priceChangedAt))?.toISOString() ?? row.priceChangedAt
              : null,
            currency: (row.currency as string) || undefined,
            image: images[0] || '',
            images,
            seller: {
              name: sellerName,
              avatar: (row.sellerAvatar as string) || '👤',
              phone: '',
              telegramId: String(row.sellerTelegramId || ''),
              username: (row.sellerUsername as string) || null,
            },
            category: row.category,
            subcategory: row.subcategory,
            description: row.description || '',
            location: row.location,
            views: Number(row.views || 0),
            posted: timeFields.posted,
            publishedAt: timeFields.publishedAt,
            createdAt: timeFields.createdAt,
            condition: normalizeCondition((row.condition as string) || null),
            tags: [],
            isFree,
            status: (row.status as string) ?? 'active',
            promotionType: (row.promotionType as string) || null,
            promotionEnds: (row.promotionEnds as string) || null,
            favoritesCount: normalizeFavoritesCount(row.favoritesCount as number),
          };
        } catch (rowError) {
          console.error('[Favorites listings batch] skip row', rowError);
          return null;
        }
      })
      .filter(Boolean);

    return NextResponse.json({ listings });
  } catch (error) {
    console.error('[Favorites listings batch]', error);
    return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 });
  }
}
