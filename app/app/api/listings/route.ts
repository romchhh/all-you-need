import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { trackUserActivity } from '@/utils/trackActivity';

// Відключаємо кешування для API route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Функція для конвертації старих значень стану в нові
function normalizeCondition(condition: string | null): 'new' | 'used' | null {
  if (!condition) return null;
  if (condition === 'new') return 'new';
  // Конвертуємо всі старі значення (like_new, good, fair) в 'used'
  return 'used';
}

// Глобальна змінна для відстеження ініціалізації таблиці Favorite
let favoriteTableInitPromise: Promise<void> | null = null;

export async function GET(request: NextRequest) {
  try {
    // Відстежуємо активність користувача
    await trackUserActivity(request);
    
    // Перевіряємо колонку currency (з кешуванням)
    const { ensureCurrencyColumn, ensureFavoriteTable } = await import('@/lib/prisma');
    const currencyColumnExists = await ensureCurrencyColumn();
    // Перевіряємо та створюємо таблицю Favorite тільки один раз
    if (!favoriteTableInitPromise) {
      favoriteTableInitPromise = ensureFavoriteTable();
    }
    await favoriteTableInitPromise;

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const subcategory = searchParams.get('subcategory');
    const isFree = searchParams.get('isFree') === 'true';
    const search = searchParams.get('search');
    const userId = searchParams.get('userId');
    const viewerId = searchParams.get('viewerId'); // ID користувача, який переглядає профіль
    const sortBy = searchParams.get('sortBy') || 'newest';
    const limit = parseInt(searchParams.get('limit') || '16');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Якщо це запит для профілю користувача (userId), показуємо всі його оголошення
    // Інакше показуємо тільки активні оголошення для каталогу
    const where: any = {};

    // Фільтр по користувачу
    if (userId) {
      // Знаходимо внутрішній id користувача за telegramId
      const userIdNum = parseInt(userId);
      const users = await prisma.$queryRawUnsafe(
        `SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
        userIdNum
      ) as Array<{ id: number }>;
      if (users[0]) {
        where.userId = users[0].id;
        // Для профілю користувача показуємо всі оголошення (pending, active, sold тощо)
        // Не додаємо фільтр по статусу
      } else {
        // Користувач не знайдений - повертаємо порожній список
        return NextResponse.json({
          listings: [],
          total: 0,
          limit,
          offset,
        });
      }
    } else {
      // Для каталогу показуємо тільки активні оголошення
      where.status = 'active';
    }

    if (category) {
      where.category = category;
    }

    if (subcategory) {
      where.subcategory = subcategory;
    }

    if (isFree) {
      where.isFree = true;
    }

    if (search) {
      const searchLower = search.toLowerCase();
      where.OR = [
        { title: { contains: searchLower } },
        { description: { contains: searchLower } },
        { location: { contains: searchLower } },
      ];
    }

    let orderBy: any = {};
    switch (sortBy) {
      case 'newest':
        // VIP > TOP > Highlighted > звичайні, всередині кожної групи по даті
        orderBy = [
          { promotionType: 'desc' }, // VIP буде першим (за алфавітом)
          { createdAt: 'desc' }
        ];
        break;
      case 'price_low':
        orderBy = [
          { promotionType: 'desc' },
          { isFree: 'desc' }
        ];
        break;
      case 'price_high':
        orderBy = [
          { promotionType: 'desc' },
          { isFree: 'asc' }
        ];
        break;
      case 'popular':
        orderBy = [
          { promotionType: 'desc' },
          { views: 'desc' }
        ];
        break;
      default:
        orderBy = [
          { promotionType: 'desc' },
          { createdAt: 'desc' }
        ];
    }

    // Використовуємо raw query для обходу проблеми з форматом дат
    let listings: any[] = [];
    let total = 0;

    if (userId) {
      // Визначаємо, чи це власний профіль (viewerId === userId)
      const isOwnProfile = viewerId && parseInt(viewerId) === parseInt(userId);
      
      // Отримуємо параметри фільтрації
      const status = searchParams.get('status');
      const categoryFilter = searchParams.get('category');
      
      // Для користувача використовуємо raw query з даними про продавця
      // Якщо це не власний профіль, виключаємо продані оголошення
      let whereClause = "WHERE CAST(u.telegramId AS INTEGER) = ?";
      const queryParams: any[] = [parseInt(userId)];
      
      if (!isOwnProfile) {
        whereClause += " AND l.status != 'sold' AND l.status != 'hidden'";
      }
      // Додаємо фільтр за статусом, якщо він вказаний
      if (status && status !== 'all') {
        whereClause += " AND l.status = ?";
        queryParams.push(status);
      }
      // Додаємо фільтр за категорією, якщо він вказаний
      if (categoryFilter && categoryFilter !== 'all') {
        whereClause += " AND l.category = ?";
        queryParams.push(categoryFilter);
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
          l.moderationStatus,
          l.rejectionReason,
          l.promotionType,
          l.promotionEnds,
          l.expiresAt,
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
            WHEN l.status = 'pending_moderation' THEN 2
            WHEN l.status = 'sold' THEN 3
            WHEN l.status = 'expired' THEN 4
            WHEN l.status = 'deactivated' THEN 5
            WHEN l.status = 'hidden' THEN 6
            ELSE 7
          END,
          l.createdAt DESC
        LIMIT ? OFFSET ?`;
      
      queryParams.push(limit, offset);
      
      // Безпечно виконуємо запит з обробкою помилок
      let userListings: any[] = [];
      try {
        userListings = await prisma.$queryRawUnsafe(
          query,
          ...queryParams
        ) as Array<{
        id: number;
        userId: number;
        title: string;
        description: string;
        price: string;
        currency: string | null;
        isFree: number;
        category: string;
        subcategory: string | null;
        condition: string | null;
        location: string;
        views: number;
        status: string;
        images: string;
        tags: string | null;
        createdAt: string;
        sellerUsername: string | null;
        sellerFirstName: string | null;
        sellerLastName: string | null;
        sellerAvatar: string | null;
        sellerPhone: string | null;
        sellerTelegramId: number;
        favoritesCount?: number;
      }>;
      } catch (error: any) {
        // Якщо таблиця Favorite не існує, виконуємо запит без favoritesCount
        if (error.message?.includes('no such table: Favorite') || error.message?.includes('Favorite')) {
          const queryWithoutFavorites = query.replace(', COALESCE((SELECT COUNT(*) FROM Favorite WHERE listingId = l.id), 0) as favoritesCount', '');
          userListings = await prisma.$queryRawUnsafe(
            queryWithoutFavorites,
            ...queryParams
          ) as any[];
          // Додаємо favoritesCount = 0 для всіх записів
          userListings = userListings.map((listing: any) => ({ ...listing, favoritesCount: 0 }));
        } else {
          throw error;
        }
      }

      const countQuery = `SELECT COUNT(*) as count
        FROM Listing l
        JOIN User u ON l.userId = u.id
        ${whereClause}`;
      
      // Для count query потрібні тільки параметри без limit та offset
      const countParams = queryParams.slice(0, -2);
      const totalCount = await prisma.$queryRawUnsafe(
        countQuery,
        ...countParams
      ) as Array<{ count: bigint }>;

      // Форматуємо дані для профілю користувача
      listings = userListings.map((listing: any) => {
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
          posted: formatPostedTime(createdAt),
          createdAt: listing.createdAt instanceof Date ? listing.createdAt.toISOString() : listing.createdAt,
          condition: normalizeCondition(listing.condition),
          tags: tags,
          isFree: listing.isFree === 1 || listing.isFree === true,
          status: listing.status || 'active',
          moderationStatus: listing.moderationStatus || null,
          rejectionReason: listing.rejectionReason || null,
          promotionType: listing.promotionType || null,
          promotionEnds: listing.promotionEnds || null,
          expiresAt: listing.expiresAt || null,
          favoritesCount: typeof listing.favoritesCount === 'bigint' ? Number(listing.favoritesCount) : (typeof listing.favoritesCount === 'number' ? listing.favoritesCount : (typeof (listing as any).favoritesCount === 'bigint' ? Number((listing as any).favoritesCount) : (typeof (listing as any).favoritesCount === 'number' ? (listing as any).favoritesCount : 0))),
        };
      });
      total = Number(totalCount[0]?.count || 0);
    } else {
      // Для загальних запитів використовуємо raw query для обходу проблем з Prisma та SQLite
      let whereClause = "WHERE l.status = 'active'";
      const params: any[] = [];
      
      if (category) {
        whereClause += " AND l.category = ?";
        params.push(category);
      }
      
      if (subcategory) {
        whereClause += " AND l.subcategory = ?";
        params.push(subcategory);
      }
      
      if (isFree) {
        whereClause += " AND l.isFree = 1";
      }
      
      if (search) {
        whereClause += " AND (l.title LIKE ? OR l.description LIKE ? OR l.location LIKE ?)";
        const searchPattern = `%${search.toLowerCase()}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }
      
      // Додаємо фільтр для активних рекламних оголошень (promotionEnds > NOW)
      // Якщо реклама закінчилась, оголошення все одно показується (якщо воно активне)
      // whereClause += " AND (l.promotionEnds IS NULL OR datetime(l.promotionEnds) > datetime('now'))";
      
      // Фільтруємо тільки активні оголошення (не закінчені)
      whereClause += " AND (l.expiresAt IS NULL OR datetime(l.expiresAt) > datetime('now'))";
      
      // Логування для діагностики (тільки в development)
      if (process.env.NODE_ENV === 'development') {
        console.log('[Listings API] Where clause:', whereClause);
        console.log('[Listings API] Params:', params);
      }
      
      // Правильне сортування з урахуванням реклами
      // VIP > TOP > Highlighted > звичайні
      let orderByClause = `ORDER BY 
        CASE 
          WHEN l.promotionType = 'vip' AND datetime(l.promotionEnds) > datetime('now') THEN 1
          WHEN l.promotionType = 'top_category' AND datetime(l.promotionEnds) > datetime('now') THEN 2
          WHEN l.promotionType = 'highlighted' AND datetime(l.promotionEnds) > datetime('now') THEN 3
          ELSE 4
        END,`;
      
      switch (sortBy) {
        case 'newest':
          orderByClause += " l.createdAt DESC";
          break;
        case 'price_low':
          orderByClause += " l.isFree DESC, l.createdAt DESC";
          break;
        case 'price_high':
          orderByClause += " l.isFree ASC, l.createdAt DESC";
          break;
        case 'popular':
          orderByClause += " l.views DESC, l.createdAt DESC";
          break;
        default:
          orderByClause += " l.createdAt DESC";
      }
      
      const listingsQuery = `
             SELECT 
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
               l.moderationStatus,
               l.rejectionReason,
               l.promotionType,
               l.promotionEnds,
               l.expiresAt,
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
             ${orderByClause}
             LIMIT ? OFFSET ?
           `;
      
      const countQuery = `
        SELECT COUNT(*) as count
        FROM Listing l
        ${whereClause}
      `;
      
      // Безпечно виконуємо запит з обробкою помилок
      let listingsData: any[] = [];
      let totalCountData: Array<{ count: bigint }> = [];
      
      try {
        const [data, count] = await Promise.all([
          prisma.$queryRawUnsafe(
            listingsQuery,
            ...params,
            limit * 2, // Беремо більше для сортування по ціні
            offset
          ) as any,
          prisma.$queryRawUnsafe(
            countQuery,
            ...params
          ) as Promise<Array<{ count: bigint }>>
        ]);
        
        listingsData = data;
        totalCountData = count;
      } catch (error: any) {
        // Якщо таблиця Favorite не існує, виконуємо запит без favoritesCount
        if (error.message?.includes('no such table: Favorite') || error.message?.includes('Favorite')) {
          const queryWithoutFavorites = listingsQuery.replace(', COALESCE((SELECT COUNT(*) FROM Favorite WHERE listingId = l.id), 0) as favoritesCount', '');
          const [data, count] = await Promise.all([
            prisma.$queryRawUnsafe(
              queryWithoutFavorites,
              ...params,
              limit * 2,
              offset
            ) as any,
            prisma.$queryRawUnsafe(
              countQuery,
              ...params
            ) as Promise<Array<{ count: bigint }>>
          ]);
          
          // Додаємо favoritesCount = 0 для всіх записів
          listingsData = data.map((listing: any) => ({ ...listing, favoritesCount: 0 }));
          totalCountData = count;
        } else {
          throw error;
        }
      }

      listings = listingsData;
      total = Number(totalCountData[0]?.count || 0);
    }

    // Сортуємо по ціні вручну (якщо потрібно) - тільки для загальних запитів
    let sortedListings = listings;
    if (!userId && (sortBy === 'price_low' || sortBy === 'price_high')) {
      sortedListings = listings.sort((a: any, b: any) => {
        // Безкоштовні завжди перші при сортуванні від дешевих
        if (sortBy === 'price_low') {
          if (a.isFree && !b.isFree) return -1;
          if (!a.isFree && b.isFree) return 1;
        } else {
          if (a.isFree && !b.isFree) return 1;
          if (!a.isFree && b.isFree) return -1;
        }

        // Парсимо ціну
        const priceA = parseFloat(a.price.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        const priceB = parseFloat(b.price.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

        return sortBy === 'price_low' ? priceA - priceB : priceB - priceA;
      });
    }

    // Обмежуємо результат (тільки для загальних запитів)
    if (!userId) {
      sortedListings = sortedListings.slice(0, limit);
    }

    // Форматуємо дані для фронтенду
    const formattedListings = sortedListings.map((listing: any) => {
      // Обробляємо різні формати даних (з Prisma або raw query)
      const images = typeof listing.images === 'string' ? JSON.parse(listing.images) : listing.images || [];
      const tags = listing.tags ? (typeof listing.tags === 'string' ? JSON.parse(listing.tags) : listing.tags) : [];
      const createdAt = listing.createdAt instanceof Date ? listing.createdAt : new Date(listing.createdAt);
      
      // Отримуємо дані користувача
      let sellerName = 'Користувач';
      let sellerAvatar = '👤';
      let sellerTelegramId = '';
      let sellerUsername: string | null = null;
      let sellerPhone: string | null = null;

      if (listing.user) {
        // Дані з Prisma include (не використовується для SQLite)
        sellerName = listing.user.firstName 
          ? `${listing.user.firstName} ${listing.user.lastName || ''}`.trim()
          : listing.user.username || 'Користувач';
        sellerAvatar = listing.user.avatar || '👤';
        sellerTelegramId = listing.user.telegramId?.toString() || '';
        sellerUsername = listing.user.username || null;
        sellerPhone = (listing.user as any).phone || null;
      } else if ((listing as any).sellerFirstName || (listing as any).sellerUsername) {
        // Дані з raw query (використовується для всіх запитів)
        const rawListing = listing as any;
        sellerName = rawListing.sellerFirstName 
          ? `${rawListing.sellerFirstName} ${rawListing.sellerLastName || ''}`.trim()
          : rawListing.sellerUsername || 'Користувач';
        sellerAvatar = rawListing.sellerAvatar || '👤';
        sellerTelegramId = rawListing.sellerTelegramId?.toString() || '';
        sellerUsername = rawListing.sellerUsername || null;
        sellerPhone = rawListing.sellerPhone || null;
        sellerPhone = rawListing.sellerPhone || null;
      }

             return {
               id: listing.id,
               title: listing.title,
               price: listing.isFree ? 'Безкоштовно' : listing.price,
               currency: (listing.currency as 'UAH' | 'EUR' | 'USD' | undefined) || undefined,
               image: images[0] || '',
               images: images,
               seller: {
                 name: sellerName,
                 avatar: sellerAvatar,
                 phone: sellerPhone || '',
                 telegramId: sellerTelegramId,
                 username: sellerUsername,
               },
               category: listing.category,
               subcategory: listing.subcategory,
               description: listing.description,
               location: listing.location,
               views: listing.views || 0,
               posted: formatPostedTime(createdAt),
               createdAt: listing.createdAt instanceof Date ? listing.createdAt.toISOString() : listing.createdAt,
               condition: normalizeCondition(listing.condition),
               tags: tags,
               isFree: listing.isFree === 1 || listing.isFree === true,
               status: listing.status || 'active',
               moderationStatus: listing.moderationStatus || null,
               rejectionReason: listing.rejectionReason || null,
               promotionType: listing.promotionType || null,
               promotionEnds: listing.promotionEnds || null,
               expiresAt: listing.expiresAt || null,
               favoritesCount: typeof (listing as any).favoritesCount === 'bigint' ? Number((listing as any).favoritesCount) : ((listing as any).favoritesCount || 0),
             };
    });

    // Відключаємо кешування для завжди актуальних даних
    const response = NextResponse.json({
      listings: formattedListings,
      total,
      limit,
      offset,
    });
    
    // Додаємо заголовки для відключення кешування
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('Surrogate-Control', 'no-store');
    
    return response;
  } catch (error) {
    console.error('Error fetching listings:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error details:', { errorMessage, errorStack });
    return NextResponse.json(
      { 
        error: 'Failed to fetch listings',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}

function formatPostedTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'щойно';
  if (minutes < 60) return `${minutes} хв тому`;
  if (hours < 24) return `${hours} год тому`;
  if (days === 1) return '1 день тому';
  if (days < 7) return `${days} днів тому`;
  return `${Math.floor(days / 7)} тижнів тому`;
}

