import { NextRequest, NextResponse } from 'next/server';
import { prisma, executeWithRetry, queryRawUnsafe } from '@/lib/prisma';
import { requireAdminAuth } from '@/utils/adminAuth';

function dateKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

function buildDailyChart(
  days: string[],
  rows: Array<{ day: string; count: number }>
): Array<{ date: string; count: number }> {
  const byDay = new Map(rows.map((r) => [r.day, r.count]));
  return days.map((date) => ({
    date,
    count: byDay.get(date) ?? 0,
  }));
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days30: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      days30.push(dateKey(date));
    }

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [newUsersByDayRaw, newListingsByDayRaw, activeUsersByDayRaw, listingsByCategory, topListingsRaw, topUsersRaw] =
      await executeWithRetry(() =>
        Promise.all([
          queryRawUnsafe<Array<{ day: string; count: bigint | number }>>(
            `SELECT TO_CHAR("createdAt"::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
             FROM "User"
             WHERE "createdAt" >= ?
             GROUP BY "createdAt"::date
             ORDER BY day`,
            thirtyDaysAgo
          ),
          queryRawUnsafe<Array<{ day: string; count: bigint | number }>>(
            `SELECT TO_CHAR("createdAt"::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
             FROM "Listing"
             WHERE "createdAt" >= ?
             GROUP BY "createdAt"::date
             ORDER BY day`,
            thirtyDaysAgo
          ),
          queryRawUnsafe<Array<{ day: string; count: bigint | number }>>(
            `SELECT TO_CHAR("lastActiveAt"::date, 'YYYY-MM-DD') AS day, COUNT(DISTINCT "userId")::int AS count
             FROM "UserSession"
             WHERE "lastActiveAt" >= ?
             GROUP BY "lastActiveAt"::date
             ORDER BY day`,
            thirtyDaysAgo
          ).catch(() => [] as Array<{ day: string; count: bigint | number }>),
          prisma.listing.groupBy({
            by: ['category'],
            _count: { _all: true },
            orderBy: { _count: { category: 'desc' } },
            take: 10,
          }),
          prisma.listing.findMany({
            take: 10,
            orderBy: { views: 'desc' },
            select: {
              id: true,
              title: true,
              views: true,
              status: true,
              createdAt: true,
              user: {
                select: { firstName: true, lastName: true, username: true },
              },
            },
          }),
          prisma.user.findMany({
            take: 10,
            where: { listings: { some: {} } },
            orderBy: { listings: { _count: 'desc' } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              avatar: true,
              telegramId: true,
              _count: { select: { listings: true } },
              listings: { select: { views: true } },
            },
          }),
        ])
      );

    const mapDayRows = (rows: Array<{ day: string; count: bigint | number }>) =>
      rows.map((row) => ({
        day: String(row.day).split('T')[0],
        count: Number(row.count ?? 0),
      }));

    const usersChart = buildDailyChart(days30, mapDayRows(newUsersByDayRaw));
    const listingsChart = buildDailyChart(days30, mapDayRows(newListingsByDayRaw));
    const activeUsersChart = buildDailyChart(days30, mapDayRows(activeUsersByDayRaw));

    const topListings = topListingsRaw.map((listing) => ({
      id: listing.id,
      title: listing.title,
      views: listing.views ?? 0,
      status: listing.status,
      createdAt: listing.createdAt,
      seller: listing.user.firstName || listing.user.username || 'Користувач',
    }));

    const topUsers = topUsersRaw.map((user) => ({
      id: user.id,
      name:
        user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`.trim()
          : user.firstName || user.username || 'Користувач',
      username: user.username,
      avatar: user.avatar,
      telegramId: user.telegramId?.toString() ?? '',
      listingsCount: user._count.listings,
      totalViews: user.listings.reduce((sum, l) => sum + (l.views ?? 0), 0),
    }));

    return NextResponse.json({
      charts: {
        newUsers: usersChart,
        newListings: listingsChart,
        activeUsers: activeUsersChart,
      },
      categories: listingsByCategory.map((item) => ({
        category: item.category,
        count: item._count._all,
      })),
      topListings,
      topUsers,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching detailed stats:', error);
    return NextResponse.json({ error: 'Failed to fetch detailed stats' }, { status: 500 });
  }
}
