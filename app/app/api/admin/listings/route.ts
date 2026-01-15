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

    // Фільтр по категорії видалено - показуємо всі категорії як текст

    // Пошук
    if (search) {
      whereClause += ' AND (l.title LIKE ? OR l.description LIKE ? OR l.location LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
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

    // Підрахунок для маркетплейсу
    const marketplaceCountQuery = `
      SELECT COUNT(*) as count
      FROM Listing l
      ${whereClause}
    `;

    // Виконуємо запити для маркетплейсу
    let marketplaceListings: any[] = [];
    let marketplaceCountData: Array<{ count: bigint }> = [{ count: BigInt(0) }];

    try {
      marketplaceListings = await executeWithRetry(() =>
        prisma.$queryRawUnsafe(marketplaceQuery, ...params, limit, offset) as Promise<any[]>
      );
    } catch (error: any) {
      console.error('[Admin Listings] Error fetching marketplace listings:', error);
      // Продовжуємо з порожнім масивом
    }

    try {
      marketplaceCountData = await executeWithRetry(() =>
        prisma.$queryRawUnsafe(marketplaceCountQuery, ...params) as Promise<Array<{ count: bigint }>>
      );
    } catch (error: any) {
      console.error('[Admin Listings] Error counting marketplace listings:', error);
      // Продовжуємо з нульовим значенням
    }

    // Використовуємо тільки оголошення з маркетплейсу
    const allListings = marketplaceListings.map((l: any) => ({ ...l, source: 'marketplace' }));

    // Підрахунок total
    const total = Number(marketplaceCountData[0]?.count || 0);

    const formattedListings = allListings.map((listing: any) => {
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

      // Всі оголошення з маркетплейсу

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
        source: 'marketplace',
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
