import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry, ensureCurrencyColumn, ensureListingApiRawColumns } from '@/lib/prisma';
import { LISTING_FAVORITES_COUNT_SQL } from '@/lib/listingFavoritesCountSql';
import { listingTimeFieldsForApi } from '@/utils/parseDbDate';

// SQLite може повертати COUNT як number, bigint або string
function normalizeFavoritesCount(value: number | bigint | string | undefined): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return parseInt(value, 10) || 0;
  return 0;
}

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
    await ensureListingApiRawColumns();

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

    // Визначаємо, чи це власний профіль
    const viewerIdNum = viewerId ? parseInt(viewerId) : null;
    const isOwnProfile = viewerIdNum !== null && viewerIdNum === telegramIdNum;

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
    // Для чужого профілю показуємо тільки активні оголошення
    let whereClause = "WHERE l.userId = ?";
    const queryParams: any[] = [userId];
    
    if (!isOwnProfile) {
      whereClause += " AND l.status = 'active'";
    }
    
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
        l.promotionType,
        l.promotionEnds,
        l.expiresAt,
        l.images,
        l.optimizedImages,
        l.tags,
        l.createdAt,
        l.publishedAt,
        COALESCE(l.autoRenew, 0) as autoRenew,
        u.username as sellerUsername,
        u.firstName as sellerFirstName,
        u.lastName as sellerLastName,
        u.avatar as sellerAvatar,
        u.phone as sellerPhone,
        CAST(u.telegramId AS INTEGER) as sellerTelegramId,
        ${LISTING_FAVORITES_COUNT_SQL} as favoritesCount
      FROM Listing l
      JOIN User u ON l.userId = u.id
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN l.status = 'active' THEN 1
          WHEN l.status = 'pending_moderation' THEN 2
          WHEN l.status = 'sold' THEN 3
          WHEN l.status = 'expired' THEN 4
          WHEN l.status = 'rejected' THEN 5
          WHEN l.status = 'deactivated' THEN 6
          WHEN l.status = 'hidden' THEN 7
          ELSE 8
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
      const msg = String(error?.message || '');
      const favBroken =
        msg.includes('no such table: Favorite') ||
        (msg.includes('Favorite') && !msg.toLowerCase().includes('favoriteboost'));
      const arBroken = msg.includes('autoRenew');
      if (!favBroken && !arBroken) {
        throw error;
      }
      let queryFallback = query;
      if (favBroken) {
        queryFallback = queryFallback.replace(`, ${LISTING_FAVORITES_COUNT_SQL} as favoritesCount`, '');
      }
      if (arBroken) {
        queryFallback = queryFallback.replace(', COALESCE(l.autoRenew, 0) as autoRenew', '');
      }
      userListings = await prisma.$queryRawUnsafe(queryFallback, ...queryParams) as any[];
      userListings = userListings.map((listing: any) => ({
        ...listing,
        ...(favBroken ? { favoritesCount: 0 } : {}),
        ...(arBroken ? { autoRenew: listing.autoRenew ?? 0 } : {}),
      }));
    }

    const countQuery = `SELECT COUNT(*) as count
      FROM Listing l
      JOIN User u ON l.userId = u.id
      ${whereClause}`;
    
    const totalCount = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        countQuery,
        ...queryParams.slice(0, -2) // Виключаємо limit та offset
      ) as Promise<Array<{ count: bigint }>>
    );

    // Форматуємо оголошення
    const formattedListings = userListings.map((listing: any) => {
      const originalImages = typeof listing.images === 'string' ? JSON.parse(listing.images) : listing.images || [];
      const optimizedImages = listing.optimizedImages 
        ? (typeof listing.optimizedImages === 'string' ? JSON.parse(listing.optimizedImages) : listing.optimizedImages)
        : null;
      // Використовуємо оптимізовані версії якщо є, інакше оригінали
      const images = optimizedImages && optimizedImages.length > 0 ? optimizedImages : originalImages;
      const tags = listing.tags ? (typeof listing.tags === 'string' ? JSON.parse(listing.tags) : listing.tags) : [];
      const timeFields = listingTimeFieldsForApi(listing);

      return {
        id: listing.id,
        title: listing.title,
        price: listing.isFree ? 'Free' : listing.price,
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
        posted: timeFields.posted,
        publishedAt: timeFields.publishedAt,
        createdAt: timeFields.createdAt,
        condition: listing.condition === 'new' ? 'new' : (listing.condition ? 'used' : null),
        tags: tags,
        isFree: listing.isFree === 1 || listing.isFree === true,
        status: listing.status ?? 'active',
        promotionType: listing.promotionType || null,
        promotionEnds: listing.promotionEnds || null,
        expiresAt: listing.expiresAt || null,
        autoRenew: listing.autoRenew === true || Number(listing.autoRenew) === 1,
        favoritesCount: normalizeFavoritesCount(listing.favoritesCount),
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
