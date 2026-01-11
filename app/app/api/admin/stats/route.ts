import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry, ensureUserSessionTable } from '@/lib/prisma';
import { requireAdminAuth } from '@/utils/adminAuth';

export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth();
    
    // Переконаємося, що таблиця UserSession існує
    await ensureUserSessionTable();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    // Загальна кількість користувачів
    const totalUsersResult = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM User`) as Promise<Array<{ count: bigint }>>
    );
    const totalUsers = Number(totalUsersResult[0]?.count || 0);

    // Нові користувачі за день
    const newUsersTodayResult = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM User WHERE createdAt >= ?`,
        today.toISOString()
      ) as Promise<Array<{ count: bigint }>>
    );
    const newUsersToday = Number(newUsersTodayResult[0]?.count || 0);

    // Нові користувачі за тиждень
    const newUsersWeekResult = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM User WHERE createdAt >= ?`,
        weekAgo.toISOString()
      ) as Promise<Array<{ count: bigint }>>
    );
    const newUsersWeek = Number(newUsersWeekResult[0]?.count || 0);

    // Нові користувачі за місяць
    const newUsersMonthResult = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM User WHERE createdAt >= ?`,
        monthAgo.toISOString()
      ) as Promise<Array<{ count: bigint }>>
    );
    const newUsersMonth = Number(newUsersMonthResult[0]?.count || 0);

    // Користувачі онлайн (активні за останню годину)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneHourAgoStr = oneHourAgo.toISOString().replace('T', ' ').substring(0, 19);
    const onlineUsersResult = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT COUNT(DISTINCT userId) as count FROM UserSession WHERE datetime(lastActiveAt) >= datetime(?)`,
        oneHourAgoStr
      ) as Promise<Array<{ count: bigint }>>
    ).catch(() => [{ count: BigInt(0) }]);
    const onlineUsers = Number(onlineUsersResult[0]?.count || 0);

    // Загальна кількість оголошень
    const totalListingsResult = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM Listing`) as Promise<Array<{ count: bigint }>>
    );
    const totalListings = Number(totalListingsResult[0]?.count || 0);

    // Нові оголошення за день
    const newListingsTodayResult = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM Listing WHERE createdAt >= ?`,
        today.toISOString()
      ) as Promise<Array<{ count: bigint }>>
    );
    const newListingsToday = Number(newListingsTodayResult[0]?.count || 0);

    // Нові оголошення за тиждень
    const newListingsWeekResult = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM Listing WHERE createdAt >= ?`,
        weekAgo.toISOString()
      ) as Promise<Array<{ count: bigint }>>
    );
    const newListingsWeek = Number(newListingsWeekResult[0]?.count || 0);

    // Нові оголошення за місяць
    const newListingsMonthResult = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM Listing WHERE createdAt >= ?`,
        monthAgo.toISOString()
      ) as Promise<Array<{ count: bigint }>>
    );
    const newListingsMonth = Number(newListingsMonthResult[0]?.count || 0);

    // Користувачі, що заходили сьогодні
    const todayStr = today.toISOString().replace('T', ' ').substring(0, 19);
    const usersActiveTodayResult = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT COUNT(DISTINCT userId) as count FROM UserSession WHERE datetime(lastActiveAt) >= datetime(?)`,
        todayStr
      ) as Promise<Array<{ count: bigint }>>
    ).catch(() => [{ count: BigInt(0) }]);
    const usersActiveToday = Number(usersActiveTodayResult[0]?.count || 0);

    // Користувачі, що заходили вчора
    const yesterdayStr = yesterday.toISOString().replace('T', ' ').substring(0, 19);
    const usersActiveYesterdayResult = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT COUNT(DISTINCT userId) as count FROM UserSession WHERE datetime(lastActiveAt) >= datetime(?) AND datetime(lastActiveAt) < datetime(?)`,
        yesterdayStr,
        todayStr
      ) as Promise<Array<{ count: bigint }>>
    ).catch(() => [{ count: BigInt(0) }]);
    const usersActiveYesterday = Number(usersActiveYesterdayResult[0]?.count || 0);

    // Користувачі, що заходили за тиждень
    const weekAgoStr = weekAgo.toISOString().replace('T', ' ').substring(0, 19);
    const usersActiveWeekResult = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT COUNT(DISTINCT userId) as count FROM UserSession WHERE datetime(lastActiveAt) >= datetime(?)`,
        weekAgoStr
      ) as Promise<Array<{ count: bigint }>>
    ).catch(() => [{ count: BigInt(0) }]);
    const usersActiveWeek = Number(usersActiveWeekResult[0]?.count || 0);

    // Статистика по статусах оголошень
    const listingsByStatusResult = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT status, COUNT(*) as count FROM Listing GROUP BY status`
      ) as Promise<Array<{ status: string; count: bigint }>>
    );
    const listingsByStatus: Record<string, number> = {};
    listingsByStatusResult.forEach((row) => {
      listingsByStatus[row.status] = Number(row.count);
    });

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
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
