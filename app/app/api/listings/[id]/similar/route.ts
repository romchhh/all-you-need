import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureCurrencyColumn, ensureFavoriteTable } from '@/lib/prisma';
import { LISTING_FAVORITES_COUNT_SQL } from '@/lib/listingFavoritesCountSql';
import { resolveStoredListingImages } from '@/lib/listings/imageStorage';
import { getListingDisplayDate, parseDbDate } from '@/utils/parseDbDate';
import { formatPostedTimeUk } from '@/utils/formatPostedTimeUk';
import {
  sqlListingAutoRenewSelect,
  sqlSellerTelegramIdSelect,
  sqlNow,
  sqlLikeOp,
} from '@/lib/dbSql';
import {
  rankSimilarListings,
  similarSearchNeedles,
  type SimilarCandidate,
} from '@/lib/listings/similarListings';
import { logApiError } from '@/lib/server/logApiError';

function normalizeCondition(condition: string | null): 'new' | 'used' | null {
  if (!condition) return null;
  return condition === 'new' ? 'new' : 'used';
}

function formatRow(listing: Record<string, unknown>) {
  let rawImages: string[] = [];
  try {
    rawImages =
      typeof listing.images === 'string'
        ? (JSON.parse(listing.images) as string[])
        : ((listing.images as string[]) || []);
  } catch {
    rawImages = [];
  }
  const images = resolveStoredListingImages(rawImages);
  const display = getListingDisplayDate({
    publishedAt: listing.publishedAt as string | null | undefined,
    createdAt: listing.createdAt as string,
  });
  const sellerName = listing.sellerFirstName
    ? `${listing.sellerFirstName} ${listing.sellerLastName || ''}`.trim()
    : (listing.sellerUsername as string) || 'Користувач';

  return {
    id: Number(listing.id),
    title: String(listing.title),
    price: listing.isFree === 1 || listing.isFree === true ? 'Free' : String(listing.price ?? ''),
    previousPrice: (listing.previousPrice as string) || null,
    priceChangedAt: listing.priceChangedAt
      ? parseDbDate(listing.priceChangedAt as string)?.toISOString() ?? String(listing.priceChangedAt)
      : null,
    currency: (listing.currency as 'UAH' | 'EUR' | 'USD' | undefined) || undefined,
    image: images[0] || '',
    images: images.slice(0, 3),
    seller: {
      name: sellerName,
      avatar: (listing.sellerAvatar as string) || '👤',
      phone: (listing.sellerPhone as string) || '',
      telegramId: listing.sellerTelegramId?.toString() || '',
      username: (listing.sellerUsername as string) || null,
    },
    category: String(listing.category || ''),
    subcategory: (listing.subcategory as string) || undefined,
    description: String(listing.description || '').slice(0, 280),
    location: String(listing.location || ''),
    views: Number(listing.views) || 0,
    posted: display ? formatPostedTimeUk(display) : '',
    publishedAt: display?.toISOString?.() ?? null,
    createdAt: listing.createdAt ? String(listing.createdAt) : undefined,
    condition: normalizeCondition((listing.condition as string) || null),
    isFree: listing.isFree === 1 || listing.isFree === true,
    status: 'active' as const,
    promotionType: (listing.promotionType as string) || null,
    favoritesCount: Number(listing.favoritesCount ?? 0),
    profileType:
      String(listing.profileType || 'personal') === 'business' ? ('business' as const) : ('personal' as const),
    autoRenew: listing.autoRenew === true || Number(listing.autoRenew) === 1,
  };
}

const SELECT_COLS = (currency: boolean) => `
  l.id,
  l.title,
  l.description,
  l.price,
  l.previousPrice,
  l.priceChangedAt,
  ${currency ? 'l.currency,' : 'NULL as currency,'}
  l.isFree,
  l.category,
  l.subcategory,
  l.condition,
  l.location,
  l.views,
  l.status,
  l.promotionType,
  l.images,
  l.createdAt,
  l.publishedAt,
  COALESCE(l.profileType, 'personal') as profileType,
  ${sqlListingAutoRenewSelect('l')},
  ${sqlSellerTelegramIdSelect('u')},
  u.username as sellerUsername,
  u.firstName as sellerFirstName,
  u.lastName as sellerLastName,
  u.avatar as sellerAvatar,
  u.phone as sellerPhone,
  ${LISTING_FAVORITES_COUNT_SQL} as favoritesCount
`;

async function fetchCandidates(params: {
  excludeId: number;
  category: string;
  subcategory: string;
  needles: string[];
}): Promise<SimilarCandidate[]> {
  const { excludeId, category, subcategory, needles } = params;
  const currency = await ensureCurrencyColumn();
  await ensureFavoriteTable();
  const cols = SELECT_COLS(currency);
  const byId = new Map<number, SimilarCandidate & Record<string, unknown>>();

  const merge = (rows: Array<Record<string, unknown>>) => {
    for (const row of rows) {
      const id = Number(row.id);
      if (!id || id === excludeId) continue;
      if (!byId.has(id)) byId.set(id, row as SimilarCandidate & Record<string, unknown>);
    }
  };

  const activeClause = `l.status = 'active' AND (l.expiresAt IS NULL OR l.expiresAt > ${sqlNow()})`;

  if (subcategory) {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT ${cols}
       FROM Listing l
       JOIN User u ON l.userId = u.id
       WHERE ${activeClause}
         AND l.id <> ?
         AND l.category = ?
         AND l.subcategory = ?
       ORDER BY l.id DESC
       LIMIT 180`,
      excludeId,
      category,
      subcategory
    )) as Array<Record<string, unknown>>;
    merge(rows);
  }

  if (category) {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT ${cols}
       FROM Listing l
       JOIN User u ON l.userId = u.id
       WHERE ${activeClause}
         AND l.id <> ?
         AND l.category = ?
       ORDER BY l.id DESC
       LIMIT 180`,
      excludeId,
      category
    )) as Array<Record<string, unknown>>;
    merge(rows);
  }

  // Додатково тягнемо за брендом/моделлю з title
  const likeOp = sqlLikeOp();
  for (const needle of needles.slice(0, 4)) {
    const like = `%${needle}%`;
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT ${cols}
       FROM Listing l
       JOIN User u ON l.userId = u.id
       WHERE ${activeClause}
         AND l.id <> ?
         AND (l.title ${likeOp} ? OR COALESCE(l.description,'') ${likeOp} ?)
       ORDER BY l.id DESC
       LIMIT 80`,
      excludeId,
      like,
      like
    )) as Array<Record<string, unknown>>;
    merge(rows);
  }

  return [...byId.values()];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idRaw } = await params;
    const listingId = parseInt(idRaw, 10);
    if (!Number.isFinite(listingId) || listingId <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const limit = Math.min(40, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '24', 10) || 24));
    const offset = Math.max(0, parseInt(request.nextUrl.searchParams.get('offset') || '0', 10) || 0);

    const currency = await ensureCurrencyColumn();
    await ensureFavoriteTable();
    const cols = SELECT_COLS(currency);

    const sourceRows = (await prisma.$queryRawUnsafe(
      `SELECT ${cols}
       FROM Listing l
       JOIN User u ON l.userId = u.id
       WHERE l.id = ?
       LIMIT 1`,
      listingId
    )) as Array<Record<string, unknown>>;

    const source = sourceRows[0];
    if (!source) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const sourceListing = {
      id: Number(source.id),
      title: String(source.title || ''),
      description: String(source.description || ''),
      category: String(source.category || ''),
      subcategory: (source.subcategory as string) || null,
      price: source.price as string | null,
      isFree: source.isFree as boolean | number | null,
    };

    const needles = similarSearchNeedles(sourceListing);
    const candidates = await fetchCandidates({
      excludeId: listingId,
      category: sourceListing.category,
      subcategory: sourceListing.subcategory || '',
      needles,
    });

    const ranked = rankSimilarListings(sourceListing, candidates, offset + limit + 12);
    const page = ranked.slice(offset, offset + limit);
    const listings = page.map((row) => formatRow(row as Record<string, unknown>));

    return NextResponse.json({
      listings,
      total: ranked.length,
      hasMore: offset + listings.length < ranked.length,
      offset,
      limit,
    });
  } catch (error) {
    logApiError('listings/[id]/similar', error);
    return NextResponse.json({ listings: [], total: 0, hasMore: false, error: 'failed' }, { status: 500 });
  }
}
