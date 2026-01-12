import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry, ensureCurrencyColumn } from '@/lib/prisma';
import { requireAdminAuth } from '@/utils/adminAuth';

export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth();

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status'); // all, pending, approved, active, sold, expired, hidden
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const currencyColumnExists = await ensureCurrencyColumn();

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    // Фільтр по статусу
    if (status && status !== 'all') {
      whereClause += ' AND l.status = ?';
      params.push(status);
    }

    // Фільтр по датах створення
    if (dateFrom) {
      whereClause += ' AND l.createdAt >= ?';
      params.push(new Date(dateFrom).toISOString());
    }
    if (dateTo) {
      whereClause += ' AND l.createdAt <= ?';
      params.push(new Date(dateTo).toISOString());
    }

    // Фільтр по категорії
    if (category && category !== 'all') {
      whereClause += ' AND l.category = ?';
      params.push(category);
    }

    // Пошук
    if (search) {
      whereClause += ' AND (l.title LIKE ? OR l.description LIKE ? OR l.location LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // Отримуємо оголошення з обох таблиць окремо та об'єднуємо в JavaScript
    // Це простіше ніж UNION ALL з різними типами даних
    
    // Формуємо окремі параметри для TelegramListing
    const telegramParams: any[] = [];
    let telegramWhere = 'WHERE 1=1';
    
    // Додаємо фільтр для виключення невалідних записів
    telegramWhere += ' AND tl.price IS NOT NULL AND tl.price >= 0';
    
    // Фільтр по статусу для Telegram
    if (status && status !== 'all') {
      telegramWhere += ' AND tl.status = ?';
      telegramParams.push(status);
    }

    // Фільтр по датах створення для Telegram
    if (dateFrom) {
      telegramWhere += ' AND tl.createdAt >= ?';
      telegramParams.push(new Date(dateFrom).toISOString());
    }
    if (dateTo) {
      telegramWhere += ' AND tl.createdAt <= ?';
      telegramParams.push(new Date(dateTo).toISOString());
    }

    // Фільтр по категорії для Telegram
    if (category && category !== 'all') {
      telegramWhere += ' AND tl.category = ?';
      telegramParams.push(category);
    }

    // Пошук для Telegram (безпечний для спеціальних символів)
    if (search) {
      telegramWhere += ' AND (tl.title LIKE ? OR tl.description LIKE ? OR tl.location LIKE ?)';
      const searchPattern = `%${search}%`;
      telegramParams.push(searchPattern, searchPattern, searchPattern);
    }
    
    // Отримуємо оголошення з маркетплейсу
    const marketplaceQuery = `
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
        l.images,
        l.tags,
        l.createdAt,
        l.updatedAt,
        l.publishedAt,
        u.username as sellerUsername,
        u.firstName as sellerFirstName,
        u.lastName as sellerLastName,
        u.avatar as sellerAvatar,
        CAST(u.telegramId AS TEXT) as sellerTelegramId,
        COALESCE((SELECT COUNT(*) FROM Favorite WHERE listingId = l.id), 0) as favoritesCount
      FROM Listing l
      JOIN User u ON l.userId = u.id
      ${whereClause}
      ORDER BY l.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    // Отримуємо оголошення з Telegram (використовуємо JOIN як в moderation/route.ts)
    const telegramQuery = `
      SELECT 
        tl.id,
        tl.userId,
        tl.title,
        tl.description,
        tl.price,
        COALESCE(tl.currency, 'EUR') as currency,
        0 as isFree,
        tl.category,
        tl.subcategory,
        tl.condition,
        tl.location,
        0 as views,
        tl.status,
        tl.images,
        NULL as tags,
        tl.createdAt,
        COALESCE(tl.updatedAt, tl.createdAt) as updatedAt,
        tl.publishedAt,
        u.username as sellerUsername,
        u.firstName as sellerFirstName,
        u.lastName as sellerLastName,
        u.avatar as sellerAvatar,
        CAST(u.telegramId AS TEXT) as sellerTelegramId,
        0 as favoritesCount
      FROM TelegramListing tl
      JOIN User u ON tl.userId = u.id
      ${telegramWhere}
      ORDER BY tl.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    // Підрахунок для обох таблиць
    const marketplaceCountQuery = `
      SELECT COUNT(*) as count
      FROM Listing l
      ${whereClause}
    `;

    const telegramCountQuery = `
      SELECT COUNT(*) as count
      FROM TelegramListing tl
      ${telegramWhere}
    `;

    // Виконуємо запити окремо з обробкою помилок для кожного
    let marketplaceListings: any[] = [];
    let telegramListings: any[] = [];
    let marketplaceCountData: Array<{ count: bigint }> = [{ count: BigInt(0) }];
    let telegramCountData: Array<{ count: bigint }> = [{ count: BigInt(0) }];

    try {
      marketplaceListings = await executeWithRetry(() =>
        prisma.$queryRawUnsafe(marketplaceQuery, ...params, limit, offset) as Promise<any[]>
      );
    } catch (error: any) {
      console.error('[Admin Listings] Error fetching marketplace listings:', error);
      // Продовжуємо з порожнім масивом
    }

    try {
      // Спочатку перевіряємо, чи існує таблиця TelegramListing
      const tableCheck = await prisma.$queryRawUnsafe(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='TelegramListing'`
      ) as any[];
      
      if (tableCheck.length > 0) {
        // Використовуємо простий запит як в moderation/route.ts (завжди без складних умов)
        // Отримуємо всі дані, фільтрацію робимо в JavaScript
        try {
          const simpleQuery = `
            SELECT 
              tl.id, tl.userId, tl.title, tl.description, tl.price, 
              COALESCE(tl.currency, 'EUR') as currency,
              tl.category, tl.subcategory, tl.condition, tl.location,
              tl.status, tl.images, tl.createdAt, 
              COALESCE(tl.updatedAt, tl.createdAt) as updatedAt,
              tl.publishedAt,
              u.username as sellerUsername,
              u.firstName as sellerFirstName,
              u.lastName as sellerLastName,
              u.avatar as sellerAvatar,
              CAST(u.telegramId AS TEXT) as sellerTelegramId
            FROM TelegramListing tl
            JOIN User u ON tl.userId = u.id
            WHERE tl.price IS NOT NULL AND tl.price >= 0
            ORDER BY tl.createdAt DESC
          `;
          const allTelegramListings = await executeWithRetry(() =>
            prisma.$queryRawUnsafe(simpleQuery) as Promise<any[]>
          );
          
          // Додаємо додаткові поля
          let filteredListings = allTelegramListings.map((l: any) => ({
            ...l,
            isFree: 0,
            views: 0,
            tags: null,
            favoritesCount: 0
          }));
          
          // Застосовуємо фільтри в JavaScript
          if (status && status !== 'all') {
            filteredListings = filteredListings.filter((l: any) => l.status === status);
          }
          if (dateFrom) {
            const fromDate = new Date(dateFrom);
            filteredListings = filteredListings.filter((l: any) => 
              new Date(l.createdAt) >= fromDate
            );
          }
          if (dateTo) {
            const toDate = new Date(dateTo);
            filteredListings = filteredListings.filter((l: any) => 
              new Date(l.createdAt) <= toDate
            );
          }
          if (category && category !== 'all') {
            filteredListings = filteredListings.filter((l: any) => l.category === category);
          }
          if (search) {
            const searchLower = search.toLowerCase();
            filteredListings = filteredListings.filter((l: any) => 
              (l.title?.toLowerCase().includes(searchLower)) ||
              (l.description?.toLowerCase().includes(searchLower)) ||
              (l.location?.toLowerCase().includes(searchLower))
            );
          }
          
          // Застосовуємо пагінацію
          telegramListings = filteredListings.slice(offset, offset + limit);
          
        } catch (queryError: any) {
          console.error('[Admin Listings] Error fetching telegram listings:', {
            message: queryError.message,
            code: queryError.code,
            meta: queryError.meta
          });
          telegramListings = [];
        }
      } else {
        console.warn('[Admin Listings] TelegramListing table does not exist');
      }
    } catch (error: any) {
      console.error('[Admin Listings] Error checking TelegramListing table:', error.message);
      telegramListings = [];
    }

    try {
      marketplaceCountData = await executeWithRetry(() =>
        prisma.$queryRawUnsafe(marketplaceCountQuery, ...params) as Promise<Array<{ count: bigint }>>
      );
    } catch (error: any) {
      console.error('[Admin Listings] Error counting marketplace listings:', error);
      // Продовжуємо з нульовим значенням
    }

    try {
      // Для підрахунку також використовуємо простий запит
      const tableCheck = await prisma.$queryRawUnsafe(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='TelegramListing'`
      ) as any[];
      
      if (tableCheck.length > 0) {
        const simpleCountQuery = `
          SELECT COUNT(*) as count
          FROM TelegramListing tl
          WHERE tl.price IS NOT NULL AND tl.price >= 0
        `;
        const allCount = await executeWithRetry(() =>
          prisma.$queryRawUnsafe(simpleCountQuery) as Promise<Array<{ count: bigint }>>
        );
        
        // Застосовуємо ті самі фільтри для підрахунку
        let count = Number(allCount[0]?.count || 0);
        
        // Якщо є фільтри, отримуємо всі записи та фільтруємо
        if (status || dateFrom || dateTo || category || search) {
          const simpleQuery = `
            SELECT 
              tl.id, tl.status, tl.createdAt, tl.category, 
              tl.title, tl.description, tl.location
            FROM TelegramListing tl
            WHERE tl.price IS NOT NULL AND tl.price >= 0
          `;
          const allListings = await executeWithRetry(() =>
            prisma.$queryRawUnsafe(simpleQuery) as Promise<any[]>
          );
          
          let filtered = allListings;
          if (status && status !== 'all') {
            filtered = filtered.filter((l: any) => l.status === status);
          }
          if (dateFrom) {
            const fromDate = new Date(dateFrom);
            filtered = filtered.filter((l: any) => new Date(l.createdAt) >= fromDate);
          }
          if (dateTo) {
            const toDate = new Date(dateTo);
            filtered = filtered.filter((l: any) => new Date(l.createdAt) <= toDate);
          }
          if (category && category !== 'all') {
            filtered = filtered.filter((l: any) => l.category === category);
          }
          if (search) {
            const searchLower = search.toLowerCase();
            filtered = filtered.filter((l: any) => 
              (l.title?.toLowerCase().includes(searchLower)) ||
              (l.description?.toLowerCase().includes(searchLower)) ||
              (l.location?.toLowerCase().includes(searchLower))
            );
          }
          count = filtered.length;
        }
        
        telegramCountData = [{ count: BigInt(count) }];
      } else {
        telegramCountData = [{ count: BigInt(0) }];
      }
    } catch (error: any) {
      console.error('[Admin Listings] Error counting telegram listings:', error);
      telegramCountData = [{ count: BigInt(0) }];
    }

    // Об'єднуємо результати та додаємо source
    const allListings = [
      ...marketplaceListings.map((l: any) => ({ ...l, source: 'marketplace' })),
      ...telegramListings.map((l: any) => ({ ...l, source: 'telegram' })),
    ];

    // Сортуємо за датою створення (найновіші спочатку)
    allListings.sort((a: any, b: any) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    // Беремо тільки потрібну кількість (limit)
    const listingsData = allListings.slice(0, limit);

    const total = Number(marketplaceCountData[0]?.count || 0) + Number(telegramCountData[0]?.count || 0);

    const formattedListings = listingsData.map((listing: any) => {
      // Безпечний парсинг images
      let images: string[] = [];
      try {
        if (typeof listing.images === 'string') {
          if (listing.images.trim()) {
            images = JSON.parse(listing.images);
          }
        } else if (Array.isArray(listing.images)) {
          images = listing.images;
        }
      } catch (e) {
        console.warn(`[Admin Listings] Failed to parse images for listing ${listing.id}:`, e);
        images = [];
      }

      // Безпечний парсинг tags
      let tags: string[] = [];
      try {
        if (listing.tags && typeof listing.tags === 'string') {
          if (listing.tags.trim()) {
            tags = JSON.parse(listing.tags);
          }
        } else if (Array.isArray(listing.tags)) {
          tags = listing.tags;
        }
      } catch (e) {
        console.warn(`[Admin Listings] Failed to parse tags for listing ${listing.id}:`, e);
        tags = [];
      }

      return {
        id: Number(listing.id),
        userId: Number(listing.userId),
        title: listing.title || '',
        description: listing.description || '',
        price: String(listing.price || '0'),
        currency: listing.currency || null,
        isFree: listing.isFree === 1 || listing.isFree === true || listing.isFree === '1',
        category: listing.category || '',
        subcategory: listing.subcategory || null,
        condition: listing.condition || null,
        location: listing.location || '',
        views: Number(listing.views || 0),
        status: listing.status || 'pending',
        images: images,
        tags: tags,
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
        publishedAt: listing.publishedAt || null,
        source: listing.source || 'marketplace', // 'marketplace' або 'telegram'
        seller: {
          id: Number(listing.userId),
          username: listing.sellerUsername || null,
          firstName: listing.sellerFirstName || null,
          lastName: listing.sellerLastName || null,
          avatar: listing.sellerAvatar || null,
          telegramId: listing.sellerTelegramId?.toString() || '',
        },
        favoritesCount: typeof listing.favoritesCount === 'bigint' ? Number(listing.favoritesCount) : Number(listing.favoritesCount || 0),
      };
    });

    return NextResponse.json({
      listings: formattedListings,
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
    console.error('[Admin Listings] Error fetching admin listings:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return NextResponse.json(
      { 
        error: 'Failed to fetch listings',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdminAuth();

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Listing ID is required' },
        { status: 400 }
      );
    }

    const listingId = parseInt(id, 10);
    if (isNaN(listingId)) {
      return NextResponse.json(
        { error: 'Invalid listing ID' },
        { status: 400 }
      );
    }

    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`DELETE FROM Listing WHERE id = ?`, listingId)
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Error deleting listing:', error);
    return NextResponse.json(
      { error: 'Failed to delete listing' },
      { status: 500 }
    );
  }
}
