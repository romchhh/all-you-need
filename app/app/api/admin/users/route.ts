import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry } from '@/lib/prisma';
import { requireAdminAuth } from '@/utils/adminAuth';

export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth();

    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get('dateFrom'); // Фільтр по даті реєстрації
    const dateTo = searchParams.get('dateTo');
    const activeFrom = searchParams.get('activeFrom'); // Фільтр по даті останньої активності
    const activeTo = searchParams.get('activeTo');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    // Фільтр по даті реєстрації
    if (dateFrom) {
      whereClause += ' AND u.createdAt >= ?';
      params.push(new Date(dateFrom).toISOString());
    }
    if (dateTo) {
      whereClause += ' AND u.createdAt <= ?';
      params.push(new Date(dateTo).toISOString());
    }

    // Фільтр по даті останньої активності (з UserSession)
    if (activeFrom || activeTo) {
      if (activeFrom) {
        whereClause += ' AND COALESCE(us.lastActiveAt, u.createdAt) >= ?';
        params.push(new Date(activeFrom).toISOString());
      }
      if (activeTo) {
        whereClause += ' AND COALESCE(us.lastActiveAt, u.createdAt) <= ?';
        params.push(new Date(activeTo).toISOString());
      }
    }

    const usersQuery = `
      SELECT 
        u.id,
        CAST(u.telegramId AS INTEGER) as telegramId,
        u.username,
        u.firstName,
        u.lastName,
        u.avatar,
        u.balance,
        u.rating,
        u.reviewsCount,
        u.isActive,
        u.createdAt,
        u.updatedAt,
        us.lastActiveAt,
        (SELECT COUNT(*) FROM Listing WHERE userId = u.id) as listingsCount,
        (SELECT COUNT(*) FROM Listing WHERE userId = u.id AND status = 'active') as activeListingsCount
      FROM User u
      LEFT JOIN UserSession us ON u.id = us.userId
      ${whereClause}
      GROUP BY u.id
      ORDER BY COALESCE(us.lastActiveAt, u.createdAt) DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as count
      FROM User u
      LEFT JOIN UserSession us ON u.id = us.userId
      ${whereClause}
    `;

    const [usersData, totalCountData] = await Promise.all([
      executeWithRetry(() =>
        prisma.$queryRawUnsafe(usersQuery, ...params, limit, offset) as Promise<any[]>
      ).catch(() => {
        // Якщо таблиця UserSession не існує, виконуємо без неї
        const simpleUsersQuery = usersQuery.replace('LEFT JOIN UserSession us ON u.id = us.userId', '').replace('COALESCE(us.lastActiveAt, u.createdAt)', 'u.createdAt').replace('us.lastActiveAt,', '').replace('GROUP BY u.id', '');
        return executeWithRetry(() =>
          prisma.$queryRawUnsafe(simpleUsersQuery, ...params, limit, offset) as Promise<any[]>
        );
      }),
      executeWithRetry(() =>
        prisma.$queryRawUnsafe(countQuery, ...params) as Promise<Array<{ count: bigint }>>
      ).catch(() => {
        const simpleCountQuery = countQuery.replace('LEFT JOIN UserSession us ON u.id = us.userId', '');
        return executeWithRetry(() =>
          prisma.$queryRawUnsafe(simpleCountQuery, ...params) as Promise<Array<{ count: bigint }>>
        );
      }),
    ]);

    const formattedUsers = usersData.map((user: any) => ({
      id: user.id,
      telegramId: user.telegramId?.toString() || '',
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.firstName && user.lastName 
        ? `${user.firstName} ${user.lastName}`.trim()
        : user.firstName || user.username || 'Користувач',
      avatar: user.avatar,
      balance: typeof user.balance === 'bigint' ? Number(user.balance) : user.balance,
      rating: typeof user.rating === 'bigint' ? Number(user.rating) : user.rating,
      reviewsCount: typeof user.reviewsCount === 'bigint' ? Number(user.reviewsCount) : user.reviewsCount,
      isActive: user.isActive === 1 || user.isActive === true,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastActiveAt: user.lastActiveAt || null,
      listingsCount: typeof user.listingsCount === 'bigint' ? Number(user.listingsCount) : (user.listingsCount || 0),
      activeListingsCount: typeof user.activeListingsCount === 'bigint' ? Number(user.activeListingsCount) : (user.activeListingsCount || 0),
    }));

    const total = Number(totalCountData[0]?.count || 0);

    return NextResponse.json({
      users: formattedUsers,
      total,
      limit,
      offset,
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Error fetching admin users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
