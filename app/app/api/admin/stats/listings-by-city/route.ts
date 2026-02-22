import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminAuth } from '@/utils/adminAuth';

/**
 * Топ 20 міст за кількістю оголошень.
 * Місто = частина location до першої коми (або весь рядок, якщо коми немає).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth();

    const raw = await prisma.$queryRawUnsafe(
      `SELECT 
        TRIM(SUBSTR(location || ',', 1, INSTR(location || ',', ',') - 1)) AS city,
        COUNT(*) AS count
       FROM Listing
       WHERE location IS NOT NULL AND TRIM(location) != ''
       GROUP BY TRIM(SUBSTR(location || ',', 1, INSTR(location || ',', ',') - 1))
       ORDER BY count DESC
       LIMIT 20`
    ) as Array<{ city: string; count: number | bigint }>;

    const list = raw.map((row) => ({
      city: row.city || '—',
      count: Number(row.count ?? 0),
    }));

    return NextResponse.json({ cities: list });
  } catch (error) {
    console.error('[Admin stats listings-by-city]', error);
    return NextResponse.json(
      { error: 'Помилка завантаження статистики' },
      { status: 500 }
    );
  }
}
