import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry, ensureCurrencyColumn } from '@/lib/prisma';

/**
 * Комплексний endpoint для отримання всіх даних профілю користувача за один запит
 * Повертає: profile, stats, listings
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const telegramId = searchParams.get('telegramId');
    const viewerId = searchParams.get('viewerId'); // ID користувача, який переглядає профіль
    const limit = parseInt(searchParams.get('limit') || '16');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!telegramId) {
      return NextResponse.json(
        { error: 'telegramId is required' },
        { status: 400 }
      );
    }

    const telegramIdNum = parseInt(telegramId);
    const currencyColumnExists = await ensureCurrencyColumn();

    // Знаходимо користувача
    const users = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT 
          id,
          CAST(telegramId AS INTEGER) as telegramId,
          username,
          firstName,
          lastName,
          phone,
          avatar,
          balance,
          rating,
          reviewsCount,
          createdAt
        FROM User
        WHERE CAST(telegramId AS INTEGER) = ?`,
        telegramIdNum
      ) as Promise<Array<{
        id: number;
        telegramId: number;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
        avatar: string | null;
        balance: number;
        rating: number;
        reviewsCount: number;
        createdAt: string;
      }>>
    );

    const userData = users[0];

    if (!userData) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userId = userData.id;

    // Отримуємо статистику
    const stats = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT 
          COUNT(*) as totalListings,
          SUM(views) as totalViews,
          SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as soldListings,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeListings
        FROM Listing
        WHERE userId = ?`,
        userId
      ) as Promise<Array<{
        totalListings: bigint;
        totalViews: bigint;
        soldListings: bigint;
        activeListings: bigint;
      }>>
    );

    const stat = stats[0] || {
      totalListings: BigInt(0),
      totalViews: BigInt(0),
      soldListings: BigInt(0),
      activeListings: BigInt(0),
    };

    // Отримуємо оголошення користувача
    const whereClause = "WHERE l.userId = ?";
    const queryParams: any[] = [userId];
    
    const query = `SELECT 
        l.id,
        l.userId,
        l.title,
        l.description,
        l.price,
        ${currencyColumnExists ? 'l.currency,' : 'NULL as currency,'}
        l.isFree,
        l.category,
        l.subcategory,
        l.condition,
        l.location,
        l.views,
        l.status,
        l.images,
        l.tags,
        l.createdAt,
        u.username as sellerUsername,
        u.firstName as sellerFirstName,
        u.lastName as sellerLastName,
        u.avatar as sellerAvatar,
        u.phone as sellerPhone,
        CAST(u.telegramId AS INTEGER) as sellerTelegramId,
        COALESCE((SELECT COUNT(*) FROM Favorite WHERE listingId = l.id), 0) as favoritesCount
      FROM Listing l
      JOIN User u ON l.userId = u.id
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN l.status = 'active' THEN 1
          WHEN l.status = 'sold' THEN 2
          WHEN l.status = 'hidden' THEN 3
          ELSE 4
        END,
        l.createdAt DESC
      LIMIT ? OFFSET ?`;

    queryParams.push(limit, offset);

    let userListings: any[] = [];
    try {
      userListings = await prisma.$queryRawUnsafe(
        query,
        ...queryParams
      ) as any[];
    } catch (error: any) {
      if (error.message?.includes('no such table: Favorite') || error.message?.includes('Favorite')) {
        const queryWithoutFavorites = query.replace(', COALESCE((SELECT COUNT(*) FROM Favorite WHERE listingId = l.id), 0) as favoritesCount', '');
        userListings = await prisma.$queryRawUnsafe(
          queryWithoutFavorites,
          ...queryParams
        ) as any[];
        userListings = userListings.map((listing: any) => ({ ...listing, favoritesCount: 0 }));
      } else {
        throw error;
      }
    }

    const countQuery = `SELECT COUNT(*) as count
      FROM Listing l
      JOIN User u ON l.userId = u.id
      ${whereClause}`;
    
    const totalCount = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        countQuery,
        userId
      ) as Promise<Array<{ count: bigint }>>
    );

    // Форматуємо оголошення
    const formattedListings = userListings.map((listing: any) => {
      const images = typeof listing.images === 'string' ? JSON.parse(listing.images) : listing.images || [];
      const tags = listing.tags ? (typeof listing.tags === 'string' ? JSON.parse(listing.tags) : listing.tags) : [];
      const createdAt = listing.createdAt instanceof Date ? listing.createdAt : new Date(listing.createdAt);
      
      return {
        id: listing.id,
        title: listing.title,
        price: listing.isFree ? 'Безкоштовно' : listing.price,
        currency: (listing.currency as 'UAH' | 'EUR' | 'USD' | undefined) || undefined,
        image: images[0] || '',
        images: images,
        seller: {
          name: listing.sellerFirstName 
            ? `${listing.sellerFirstName} ${listing.sellerLastName || ''}`.trim()
            : listing.sellerUsername || 'Користувач',
          avatar: listing.sellerAvatar || '👤',
          phone: listing.sellerPhone || '',
          telegramId: listing.sellerTelegramId?.toString() || '',
          username: listing.sellerUsername || null,
        },
        category: listing.category,
        subcategory: listing.subcategory,
        description: listing.description,
        location: listing.location,
        views: listing.views || 0,
        posted: new Date(createdAt).toLocaleDateString('uk-UA'),
        createdAt: listing.createdAt instanceof Date ? listing.createdAt.toISOString() : listing.createdAt,
        condition: listing.condition === 'new' ? 'new' : (listing.condition ? 'used' : null),
        tags: tags,
        isFree: listing.isFree === 1 || listing.isFree === true,
        status: listing.status || 'active',
        favoritesCount: typeof listing.favoritesCount === 'bigint' ? Number(listing.favoritesCount) : (listing.favoritesCount || 0),
      };
    });

    return NextResponse.json({
      profile: {
        id: userData.id,
        telegramId: userData.telegramId.toString(),
        username: userData.username,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: userData.phone,
        avatar: userData.avatar,
        balance: userData.balance,
        rating: userData.rating,
        reviewsCount: userData.reviewsCount,
        createdAt: userData.createdAt,
      },
      stats: {
        totalListings: Number(stat.totalListings),
        totalViews: Number(stat.totalViews),
        soldListings: Number(stat.soldListings),
        activeListings: Number(stat.activeListings),
        createdAt: userData.createdAt,
      },
      listings: {
        listings: formattedListings,
        total: Number(totalCount[0]?.count || 0),
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error fetching profile-full:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profile data' },
      { status: 500 }
    );
  }
}
