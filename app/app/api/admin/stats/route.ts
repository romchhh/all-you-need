import { NextRequest, NextResponse } from 'next/server';
import { prisma, executeWithRetry, queryRawUnsafe } from '@/lib/prisma';
import { requireAdminAuth } from '@/utils/adminAuth';

async function countActiveSessions(since: Date): Promise<number> {
  try {
    const rows = await queryRawUnsafe<Array<{ count: bigint | number }>>(
      `SELECT COUNT(DISTINCT "userId") as count FROM "UserSession" WHERE "lastActiveAt" >= ?`,
      since
    );
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

async function countActiveSessionsBetween(from: Date, to: Date): Promise<number> {
  try {
    const rows = await queryRawUnsafe<Array<{ count: bigint | number }>>(
      `SELECT COUNT(DISTINCT "userId") as count FROM "UserSession" WHERE "lastActiveAt" >= ? AND "lastActiveAt" < ?`,
      from,
      to
    );
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersToday,
      newUsersWeek,
      newUsersMonth,
      onlineUsers,
      totalListings,
      newListingsToday,
      newListingsWeek,
      newListingsMonth,
      usersActiveToday,
      usersActiveYesterday,
      usersActiveWeek,
      listingsByStatusRows,
    ] = await executeWithRetry(() =>
      Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: today } } }),
        prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.user.count({ where: { createdAt: { gte: monthAgo } } }),
        countActiveSessions(oneHourAgo),
        prisma.listing.count(),
        prisma.listing.count({ where: { createdAt: { gte: today } } }),
        prisma.listing.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.listing.count({ where: { createdAt: { gte: monthAgo } } }),
        countActiveSessions(today),
        countActiveSessionsBetween(yesterday, today),
        countActiveSessions(weekAgo),
        prisma.listing.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
      ])
    );

    const listingsByStatus: Record<string, number> = {};
    for (const row of listingsByStatusRows) {
      listingsByStatus[row.status] = row._count._all;
    }

    return NextResponse.json({
      users: {
        total: totalUsers,
        newToday: newUsersToday,
        newWeek: newUsersWeek,
        newMonth: newUsersMonth,
        online: onlineUsers,
        activeToday: usersActiveToday,
        activeYesterday: usersActiveYesterday,
        activeWeek: usersActiveWeek,
      },
      listings: {
        total: totalListings,
        newToday: newListingsToday,
        newWeek: newListingsWeek,
        newMonth: newListingsMonth,
        byStatus: listingsByStatus,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching admin stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
