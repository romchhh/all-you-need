import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry, ensureCurrencyColumn } from '@/lib/prisma';
import { requireAdminAuth } from '@/utils/adminAuth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAuth();

    const { id } = await params;
    const listingId = parseInt(id, 10);

    if (isNaN(listingId)) {
      return NextResponse.json(
        { error: 'Invalid listing ID' },
        { status: 400 }
      );
    }

    const currencyColumnExists = await ensureCurrencyColumn();

    const listings = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT 
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
          l.promotionType,
          l.promotionEnds,
          u.username as sellerUsername,
          u.firstName as sellerFirstName,
          u.lastName as sellerLastName,
          u.avatar as sellerAvatar,
          u.phone as sellerPhone,
          CAST(u.telegramId AS INTEGER) as sellerTelegramId,
          COALESCE((SELECT COUNT(*) FROM Favorite WHERE listingId = l.id), 0) as favoritesCount
        FROM Listing l
        JOIN User u ON l.userId = u.id
        WHERE l.id = ?`,
        listingId
      ) as Promise<Array<any>>
    );

    const listing = listings[0];
    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    const images = typeof listing.images === 'string' ? JSON.parse(listing.images) : listing.images || [];
    const tags = listing.tags ? (typeof listing.tags === 'string' ? JSON.parse(listing.tags) : listing.tags) : [];

    const formattedListing = {
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
      promotionType: listing.promotionType || null,
      promotionEnds: listing.promotionEnds || null,
      seller: {
        id: listing.userId,
        username: listing.sellerUsername,
        firstName: listing.sellerFirstName,
        lastName: listing.sellerLastName,
        avatar: listing.sellerAvatar,
        phone: listing.sellerPhone,
        telegramId: listing.sellerTelegramId?.toString() || '',
      },
      favoritesCount: typeof listing.favoritesCount === 'bigint' ? Number(listing.favoritesCount) : (listing.favoritesCount || 0),
    };

    return NextResponse.json(formattedListing);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Error fetching listing:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listing' },
      { status: 500 }
    );
  }
}
