import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry } from '@/lib/prisma';
import { requireAdminAuth } from '@/utils/adminAuth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAuth();

    const { id } = await params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return NextResponse.json(
        { error: 'Invalid user ID' },
        { status: 400 }
      );
    }

    const users = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT 
          u.id,
          CAST(u.telegramId AS INTEGER) as telegramId,
          u.username,
          u.firstName,
          u.lastName,
          u.phone,
          u.avatar,
          u.balance,
          u.rating,
          u.reviewsCount,
          u.isActive,
          u.createdAt,
          u.updatedAt,
          us.lastActiveAt,
          (SELECT COUNT(*) FROM Listing WHERE userId = u.id) as listingsCount,
          (SELECT COUNT(*) FROM Listing WHERE userId = u.id AND status = 'active') as activeListingsCount,
          (SELECT COUNT(*) FROM Listing WHERE userId = u.id AND status = 'pending') as pendingListingsCount,
          (SELECT COUNT(*) FROM Listing WHERE userId = u.id AND status = 'sold') as soldListingsCount,
          (SELECT SUM(views) FROM Listing WHERE userId = u.id) as totalViews,
          (SELECT COUNT(*) FROM Favorite WHERE userId = u.id) as favoritesCount
        FROM User u
        LEFT JOIN UserSession us ON u.id = us.userId
        WHERE u.id = ?
        GROUP BY u.id`,
        userId
      ) as Promise<Array<any>>
    ).catch(() => {
      // Якщо таблиця UserSession не існує
      return executeWithRetry(() =>
        prisma.$queryRawUnsafe(
          `SELECT 
            u.id,
            CAST(u.telegramId AS INTEGER) as telegramId,
            u.username,
            u.firstName,
            u.lastName,
            u.phone,
            u.avatar,
            u.balance,
            u.rating,
            u.reviewsCount,
            u.isActive,
            u.createdAt,
            u.updatedAt,
            NULL as lastActiveAt,
            (SELECT COUNT(*) FROM Listing WHERE userId = u.id) as listingsCount,
            (SELECT COUNT(*) FROM Listing WHERE userId = u.id AND status = 'active') as activeListingsCount,
            (SELECT COUNT(*) FROM Listing WHERE userId = u.id AND status = 'pending') as pendingListingsCount,
            (SELECT COUNT(*) FROM Listing WHERE userId = u.id AND status = 'sold') as soldListingsCount,
            (SELECT SUM(views) FROM Listing WHERE userId = u.id) as totalViews,
            (SELECT COUNT(*) FROM Favorite WHERE userId = u.id) as favoritesCount
          FROM User u
          WHERE u.id = ?`,
          userId
        ) as Promise<Array<any>>
      );
    });

    const user = users[0];
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Отримуємо останні оголошення користувача
    const listings = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT id, title, status, views, createdAt FROM Listing WHERE userId = ? ORDER BY createdAt DESC LIMIT 10`,
        userId
      ) as Promise<Array<any>>
    ).catch(() => []);

    return NextResponse.json({
      id: user.id,
      telegramId: user.telegramId?.toString() || '',
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.firstName && user.lastName 
        ? `${user.firstName} ${user.lastName}`.trim()
        : user.firstName || user.username || 'Користувач',
      phone: user.phone,
      avatar: user.avatar,
      balance: typeof user.balance === 'bigint' ? Number(user.balance) : user.balance,
      rating: typeof user.rating === 'bigint' ? Number(user.rating) : user.rating,
      reviewsCount: typeof user.reviewsCount === 'bigint' ? Number(user.reviewsCount) : user.reviewsCount,
      isActive: user.isActive === 1 || user.isActive === true,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastActiveAt: user.lastActiveAt || null,
      stats: {
        listingsCount: typeof user.listingsCount === 'bigint' ? Number(user.listingsCount) : (user.listingsCount || 0),
        activeListingsCount: typeof user.activeListingsCount === 'bigint' ? Number(user.activeListingsCount) : (user.activeListingsCount || 0),
        pendingListingsCount: typeof user.pendingListingsCount === 'bigint' ? Number(user.pendingListingsCount) : (user.pendingListingsCount || 0),
        soldListingsCount: typeof user.soldListingsCount === 'bigint' ? Number(user.soldListingsCount) : (user.soldListingsCount || 0),
        totalViews: typeof user.totalViews === 'bigint' ? Number(user.totalViews) : (user.totalViews || 0),
        favoritesCount: typeof user.favoritesCount === 'bigint' ? Number(user.favoritesCount) : (user.favoritesCount || 0),
      },
      recentListings: listings.map((l: any) => ({
        id: l.id,
        title: l.title,
        status: l.status,
        views: l.views || 0,
        createdAt: l.createdAt,
      })),
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAuth();

    const { id } = await params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return NextResponse.json(
        { error: 'Invalid user ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { isActive } = body;

    if (typeof isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'isActive must be a boolean' },
        { status: 400 }
      );
    }

    // Оновлюємо статус користувача
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `UPDATE User SET isActive = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        isActive ? 1 : 0,
        userId
      )
    );

    return NextResponse.json({ success: true, isActive });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Error updating user status:', error);
    return NextResponse.json(
      { error: 'Failed to update user status' },
      { status: 500 }
    );
  }
}
