import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry, ensureCurrencyColumn } from '@/lib/prisma';
import { requireAdminAuth } from '@/utils/adminAuth';

export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth();

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status'); // all, pending, approved, rejected, active, sold, expired
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

    // Отримуємо оголошення
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
        l.images,
        l.tags,
        l.createdAt,
        l.updatedAt,
        l.publishedAt,
        u.username as sellerUsername,
        u.firstName as sellerFirstName,
        u.lastName as sellerLastName,
        u.avatar as sellerAvatar,
        CAST(u.telegramId AS INTEGER) as sellerTelegramId,
        COALESCE((SELECT COUNT(*) FROM Favorite WHERE listingId = l.id), 0) as favoritesCount
      FROM Listing l
      JOIN User u ON l.userId = u.id
      ${whereClause}
      ORDER BY l.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as count
      FROM Listing l
      ${whereClause}
    `;

    const [listingsData, totalCountData] = await Promise.all([
      executeWithRetry(() =>
        prisma.$queryRawUnsafe(listingsQuery, ...params, limit, offset) as Promise<any[]>
      ),
      executeWithRetry(() =>
        prisma.$queryRawUnsafe(countQuery, ...params) as Promise<Array<{ count: bigint }>>
      ),
    ]);

    const formattedListings = listingsData.map((listing: any) => {
      const images = typeof listing.images === 'string' ? JSON.parse(listing.images) : listing.images || [];
      const tags = listing.tags ? (typeof listing.tags === 'string' ? JSON.parse(listing.tags) : listing.tags) : [];

      return {
        id: listing.id,
        userId: listing.userId,
        title: listing.title,
        description: listing.description,
        price: listing.price,
        currency: listing.currency || null,
        isFree: listing.isFree === 1 || listing.isFree === true,
        category: listing.category,
        subcategory: listing.subcategory,
        condition: listing.condition,
        location: listing.location,
        views: listing.views || 0,
        status: listing.status,
        images: images,
        tags: tags,
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
        publishedAt: listing.publishedAt,
        seller: {
          id: listing.userId,
          username: listing.sellerUsername,
          firstName: listing.sellerFirstName,
          lastName: listing.sellerLastName,
          avatar: listing.sellerAvatar,
          telegramId: listing.sellerTelegramId?.toString() || '',
        },
        favoritesCount: typeof listing.favoritesCount === 'bigint' ? Number(listing.favoritesCount) : (listing.favoritesCount || 0),
      };
    });

    const total = Number(totalCountData[0]?.count || 0);

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
    console.error('Error fetching admin listings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listings' },
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
