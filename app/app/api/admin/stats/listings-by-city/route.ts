import { NextRequest, NextResponse } from 'next/server';
import { listingCityExtractExpr, quoteTable } from '@/lib/dbSql';
import { queryRawUnsafe } from '@/lib/prisma';
import { requireAdminAuth } from '@/utils/adminAuth';

/**
 * Топ 20 міст за кількістю оголошень.
 * Місто = частина location до першої коми (або весь рядок, якщо коми немає).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth();

    const cityExpr = listingCityExtractExpr('l.location');
    const listingTable = quoteTable('Listing');

    const raw = await queryRawUnsafe<Array<{ city: string; count: number | bigint }>>(
      `SELECT 
        ${cityExpr} AS city,
        COUNT(*) AS count
       FROM ${listingTable} l
       WHERE l.location IS NOT NULL AND TRIM(l.location) != ''
       GROUP BY ${cityExpr}
       ORDER BY count DESC
       LIMIT 20`
    );

    const list = raw.map((row) => ({
      city: row.city || '—',
      count: Number(row.count ?? 0),
    }));

    return NextResponse.json({ cities: list });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin stats listings-by-city]', error);
    return NextResponse.json(
      { error: 'Помилка завантаження статистики' },
      { status: 500 }
    );
  }
}
