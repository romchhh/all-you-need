import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getListingDisplayDate } from '@/utils/parseDbDate';
import { formatPostedTimeUk } from '@/utils/formatPostedTimeUk';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const telegramId = searchParams.get('telegramId');
    const limit = parseInt(searchParams.get('limit') || '16');

    if (!telegramId) {
      return NextResponse.json(
        { error: 'telegramId is required' },
        { status: 400 }
      );
    }

    const telegramIdNum = parseInt(telegramId);

    // Знаходимо користувача
    const user = await prisma.$queryRawUnsafe(
      `SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
      telegramIdNum
    ) as Array<{ id: number }>;

    if (!user[0]) {
      return NextResponse.json({ listings: [] });
    }

    const userId = user[0].id;

    // Отримуємо останні переглянуті товари користувача
    const viewedListings = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT listingId
      FROM ViewHistory
      WHERE listingId IN (
        SELECT id FROM Listing WHERE userId != ?
      )
      ORDER BY viewedAt DESC
      LIMIT 10`,
      userId
    ) as Array<{ listingId: number }>;

    if (viewedListings.length === 0) {
      // Якщо немає переглянутих товарів, повертаємо популярні
      const popularListings = await prisma.$queryRawUnsafe(
        `SELECT 
          l.id,
          l.userId,
          l.title,
          l.description,
          l.price,
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
          l.publishedAt,
          u.username as sellerUsername,
          u.firstName as sellerFirstName,
          u.lastName as sellerLastName,
          u.avatar as sellerAvatar,
          u.phone as sellerPhone,
          CAST(u.telegramId AS INTEGER) as sellerTelegramId
        FROM Listing l
        JOIN User u ON l.userId = u.id
        WHERE l.status = 'active' AND l.userId != ?
        ORDER BY l.views DESC, l.createdAt DESC
        LIMIT ?`,
        userId,
        limit
      ) as Array<any>;

      // Форматуємо популярні товари
      const formattedPopular = popularListings.map((listing: any) => {
        const images = typeof listing.images === 'string' ? JSON.parse(listing.images) : listing.images || [];
        const sellerName = listing.sellerFirstName 
          ? `${listing.sellerFirstName} ${listing.sellerLastName || ''}`.trim()
          : listing.sellerUsername || 'Користувач';
        const display = getListingDisplayDate(listing);
        const posted = display ? formatPostedTimeUk(display) : '';

        return {
          id: listing.id,
          title: listing.title,
          price: listing.isFree ? 'Free' : listing.price,
          image: images[0] || '',
          images: images,
          seller: {
            name: sellerName,
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
          posted: posted,
          condition: listing.condition,
          tags: listing.tags ? (typeof listing.tags === 'string' ? JSON.parse(listing.tags) : listing.tags) : [],
          isFree: listing.isFree === 1 || listing.isFree === true,
          status: listing.status || 'active',
        };
      });

      return NextResponse.json({ listings: formattedPopular });
    }

    const viewedIds = viewedListings.map(v => v.listingId);

    // Отримуємо категорії переглянутих товарів
    if (viewedIds.length === 0) {
      return NextResponse.json({ listings: [] });
    }

    const categories = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT category FROM Listing WHERE id IN (${viewedIds.map(() => '?').join(',')})`,
      ...viewedIds
    ) as Array<{ category: string }>;

    if (categories.length === 0) {
      return NextResponse.json({ listings: [] });
    }

    const categoryList = categories.map(c => c.category);

    // Знаходимо схожі товари (з тих самих категорій, які не переглядав)
    const placeholders = categoryList.map(() => '?').join(',');
    const idPlaceholders = viewedIds.map(() => '?').join(',');
    const recommendations = await prisma.$queryRawUnsafe(
      `SELECT 
        l.id,
        l.userId,
        l.title,
        l.description,
        l.price,
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
        l.publishedAt,
        u.username as sellerUsername,
        u.firstName as sellerFirstName,
        u.lastName as sellerLastName,
        u.avatar as sellerAvatar,
        u.phone as sellerPhone,
        CAST(u.telegramId AS INTEGER) as sellerTelegramId
      FROM Listing l
      JOIN User u ON l.userId = u.id
      WHERE l.status = 'active' 
        AND l.userId != ?
        AND l.id NOT IN (${idPlaceholders})
        AND l.category IN (${placeholders})
      ORDER BY l.views DESC, l.createdAt DESC
      LIMIT ?`,
      userId,
      ...viewedIds,
      ...categoryList,
      limit
    ) as Array<any>;

    // Форматуємо рекомендації
    const formattedRecommendations = recommendations.map((listing: any) => {
      const images = typeof listing.images === 'string' ? JSON.parse(listing.images) : listing.images || [];
      const sellerName = listing.sellerFirstName 
        ? `${listing.sellerFirstName} ${listing.sellerLastName || ''}`.trim()
        : listing.sellerUsername || 'Користувач';
      const display = getListingDisplayDate(listing);
      const posted = display ? formatPostedTimeUk(display) : '';

      return {
        id: listing.id,
        title: listing.title,
        price: listing.isFree ? 'Безкоштовно' : listing.price,
        image: images[0] || '',
        images: images,
        seller: {
          name: sellerName,
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
        posted: posted,
        createdAt: listing.createdAt instanceof Date ? listing.createdAt.toISOString() : listing.createdAt,
        condition: listing.condition,
        tags: listing.tags ? (typeof listing.tags === 'string' ? JSON.parse(listing.tags) : listing.tags) : [],
        isFree: listing.isFree === 1 || listing.isFree === true,
        status: listing.status || 'active',
      };
    });

    return NextResponse.json({ listings: formattedRecommendations });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recommendations' },
      { status: 500 }
    );
  }
}

