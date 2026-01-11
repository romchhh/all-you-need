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

    // Статистика за останні 30 днів для графіка
    const days30 = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      days30.push(date.toISOString().split('T')[0]);
    }

    // Статистика за останні 30 днів
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

    // Нові користувачі за останні 30 днів
    const newUsersByDayRaw = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT 
          DATE(createdAt) as date, 
          COUNT(*) as count 
        FROM User 
        WHERE createdAt >= ?
        GROUP BY DATE(createdAt)
        ORDER BY date`,
        thirtyDaysAgoISO
      ) as Promise<Array<{ date: string; count: bigint }>>
    );

    // Нові оголошення за останні 30 днів
    const newListingsByDayRaw = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT 
          DATE(createdAt) as date, 
          COUNT(*) as count 
        FROM Listing 
        WHERE createdAt >= ?
        GROUP BY DATE(createdAt)
        ORDER BY date`,
        thirtyDaysAgoISO
      ) as Promise<Array<{ date: string; count: bigint }>>
    );

    // Активні користувачі за останні 30 днів
    const activeUsersByDayRaw = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT 
          DATE(lastActiveAt) as date, 
          COUNT(DISTINCT userId) as count 
        FROM UserSession 
        WHERE lastActiveAt >= ?
        GROUP BY DATE(lastActiveAt)
        ORDER BY date`,
        thirtyDaysAgoISO
      ) as Promise<Array<{ date: string; count: bigint }>>
    ).catch(() => []);

    // Конвертуємо дати в формат YYYY-MM-DD для коректного порівняння
    const newUsersByDay = (newUsersByDayRaw || []).map((row: any) => ({
      date: typeof row.date === 'string' ? row.date.split('T')[0] : row.date,
      count: row.count
    }));

    const newListingsByDay = (newListingsByDayRaw || []).map((row: any) => ({
      date: typeof row.date === 'string' ? row.date.split('T')[0] : row.date,
      count: row.count
    }));

    const activeUsersByDay = (activeUsersByDayRaw || []).map((row: any) => ({
      date: typeof row.date === 'string' ? row.date.split('T')[0] : row.date,
      count: row.count
    }));

    // Статистика по категоріях
    const listingsByCategory = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT category, COUNT(*) as count 
        FROM Listing 
        GROUP BY category 
        ORDER BY count DESC 
        LIMIT 10`
      ) as Promise<Array<{ category: string; count: bigint }>>
    );

    // Топ оголошень за переглядами
    const topListings = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT l.id, l.title, l.views, l.status, l.createdAt,
         u.firstName, u.lastName, u.username
        FROM Listing l
        JOIN User u ON l.userId = u.id
        ORDER BY l.views DESC
        LIMIT 10`
      ) as Promise<Array<any>>
    );

    // Топ користувачі за кількістю оголошень
    const topUsers = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT u.id, u.firstName, u.lastName, u.username, u.avatar,
         CAST(u.telegramId AS INTEGER) as telegramId,
         COUNT(l.id) as listingsCount,
         SUM(l.views) as totalViews
        FROM User u
        LEFT JOIN Listing l ON u.id = l.userId
        GROUP BY u.id
        HAVING listingsCount > 0
        ORDER BY listingsCount DESC
        LIMIT 10`
      ) as Promise<Array<any>>
    );

    // Форматуємо дані для графіків
    const usersChart = days30.map((date) => {
      const day = newUsersByDay.find((d: any) => {
        const dayDate = typeof d.date === 'string' ? d.date.split('T')[0] : d.date;
        return dayDate === date;
      });
      return {
        date,
        count: day ? Number(day.count) : 0,
      };
    });

    const listingsChart = days30.map((date) => {
      const day = newListingsByDay.find((d: any) => {
        const dayDate = typeof d.date === 'string' ? d.date.split('T')[0] : d.date;
        return dayDate === date;
      });
      return {
        date,
        count: day ? Number(day.count) : 0,
      };
    });

    const activeUsersChart = days30.map((date) => {
      const day = activeUsersByDay.find((d: any) => {
        const dayDate = typeof d.date === 'string' ? d.date.split('T')[0] : d.date;
        return dayDate === date;
      });
      return {
        date,
        count: day ? Number(day.count) : 0,
      };
    });

    return NextResponse.json({
      charts: {
        newUsers: usersChart,
        newListings: listingsChart,
        activeUsers: activeUsersChart,
      },
      categories: listingsByCategory.map((item) => ({
        category: item.category,
        count: Number(item.count),
      })),
      topListings: topListings.map((listing) => ({
        id: listing.id,
        title: listing.title,
        views: listing.views || 0,
        status: listing.status,
        createdAt: listing.createdAt,
        seller: listing.firstName || listing.username || 'Користувач',
      })),
      topUsers: topUsers.map((user) => ({
        id: user.id,
        name: user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`.trim()
          : user.firstName || user.username || 'Користувач',
        username: user.username,
        avatar: user.avatar,
        telegramId: user.telegramId?.toString() || '',
        listingsCount: Number(user.listingsCount || 0),
        totalViews: Number(user.totalViews || 0),
      })),
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Error fetching detailed stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch detailed stats' },
      { status: 500 }
    );
  }
}
