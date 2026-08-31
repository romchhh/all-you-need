import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry } from '@/lib/prisma';

/** Пакетне завантаження оголошень за списком id (обране). */
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
          COALESCE(l.currency, 'EUR') as currency,
          l.category, l.subcategory, l.location, l.images,
          l.isFree, l.condition, l.status, l.createdAt,
          l.views, l.favoritesCount, l.expiresAt,
          u.username, u.firstName, u.lastName,
          CAST(u.telegramId AS TEXT) as sellerTelegramId
        FROM Listing l
        JOIN User u ON l.userId = u.id
        WHERE l.id IN (${placeholders})
          AND l.status = 'active'
        `,
        ...ids
      )
    )) as Record<string, unknown>[];

    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

    return NextResponse.json({ listings: ordered });
  } catch (error) {
    console.error('[Favorites listings batch]', error);
    return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 });
  }
}
