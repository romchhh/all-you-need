import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminAuthenticated } from '@/utils/adminAuth';
import { getListingWithUser, approveListing, rejectListing } from '@/utils/moderationHelpers';

// Отримати оголошення з маркетплейсу на модерації
export async function GET(request: NextRequest) {
  try {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'pending';
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);

    console.log('[Moderation API - Marketplace] Fetching listings with status:', status);

    // Отримуємо оголошення з маркетплейсу через SQL запит (обхід проблеми з форматом дати expiresAt)
    const marketplaceQuery = `
      SELECT 
        l.id,
        l.userId,
        l.title,
        l.description,
        l.price,
        COALESCE(l.currency, 'EUR') as currency,
        l.category,
        l.location,
        l.images,
        l.createdAt,
        l.moderationStatus,
        u.id as userId,
        CAST(u.telegramId AS TEXT) as telegramId,
        u.username,
        u.firstName,
        u.lastName
      FROM Listing l
      JOIN User u ON l.userId = u.id
      WHERE l.moderationStatus = ?
      ORDER BY l.createdAt DESC
      LIMIT ? OFFSET ?
    `;
    
    const marketplaceDbRaw = await prisma.$queryRawUnsafe(
      marketplaceQuery,
      status,
      limit,
      offset
    ) as any[];
    
    const marketplaceDb = marketplaceDbRaw.map((row: any) => ({
      id: row.id,
      userId: row.userId,
      title: row.title,
      description: row.description,
      price: row.price,
      currency: row.currency,
      category: row.category,
      location: row.location,
      images: row.images,
      createdAt: row.createdAt,
      moderationStatus: row.moderationStatus,
      user: {
        id: row.userId,
        telegramId: row.telegramId,
        username: row.username,
        firstName: row.firstName,
        lastName: row.lastName,
      },
    }));

    const totalQuery = `
      SELECT COUNT(*) as count
      FROM Listing
      WHERE moderationStatus = ?
    `;
    const totalResult = await prisma.$queryRawUnsafe(
      totalQuery,
      status
    ) as Array<{ count: bigint }>;
    const total = Number(totalResult[0]?.count || 0);

    const marketplaceListings = marketplaceDb.map((l: any) => ({
      id: l.id,
      userId: l.userId,
      title: l.title,
      description: l.description,
      price: l.price,
      currency: l.currency,
      category: l.category,
      location: l.location,
      images: l.images,
      createdAt: l.createdAt,
      moderationStatus: l.moderationStatus,
      user: {
        id: l.user.id,
        telegramId: typeof l.user.telegramId === 'bigint' 
          ? l.user.telegramId.toString() 
          : (l.user.telegramId?.toString() || null),
        username: l.user.username,
        firstName: l.user.firstName,
        lastName: l.user.lastName,
      },
    }));

    console.log('[Moderation API - Marketplace] Found listings:', marketplaceListings.length, 'Total:', total);

    return NextResponse.json({
      listings: marketplaceListings,
      total,
      hasMore: offset + marketplaceListings.length < total,
    });
  } catch (error) {
    console.error('Error fetching marketplace moderation listings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listings' },
      { status: 500 }
    );
  }
}

// Схвалити/відхилити оголошення з маркетплейсу
export async function POST(request: NextRequest) {
  try {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { listingId, action, reason } = body;

    if (!listingId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    if (action === 'reject' && !reason) {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 }
      );
    }

    // Отримуємо оголошення з маркетплейсу
    const listing = await getListingWithUser(listingId);
    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    if (action === 'approve') {
      await approveListing(listing);
      return NextResponse.json({
        success: true,
        message: 'Listing approved',
      });
    } else {
      const refundInfo = await rejectListing(listing, reason);
      return NextResponse.json({
        success: true,
        message: 'Listing rejected and funds refunded',
        refundInfo,
      });
    }
  } catch (error) {
    console.error('Error moderating marketplace listing:', error);
    return NextResponse.json(
      { error: 'Failed to moderate listing' },
      { status: 500 }
    );
  }
}
