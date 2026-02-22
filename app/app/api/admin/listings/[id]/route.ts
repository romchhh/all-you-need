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

    // Спочатку шукаємо в таблиці Listing
    let listings = await executeWithRetry(() =>
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
          COALESCE((SELECT COUNT(*) FROM Favorite WHERE listingId = l.id), 0) as favoritesCount,
          'marketplace' as source
        FROM Listing l
        JOIN User u ON l.userId = u.id
        WHERE l.id = ?`,
        listingId
      ) as Promise<Array<any>>
    );

    let listing = listings[0];
    let source = 'marketplace';

    // Якщо не знайдено в Listing, шукаємо в TelegramListing
    if (!listing) {
      try {
        const telegramListings = await executeWithRetry(() =>
          prisma.$queryRawUnsafe(
            `SELECT 
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
              NULL as promotionType,
              NULL as promotionEnds,
              u.username as sellerUsername,
              u.firstName as sellerFirstName,
              u.lastName as sellerLastName,
              u.avatar as sellerAvatar,
              u.phone as sellerPhone,
              CAST(u.telegramId AS INTEGER) as sellerTelegramId,
              0 as favoritesCount,
              'telegram' as source
            FROM TelegramListing tl
            JOIN User u ON tl.userId = u.id
            WHERE tl.id = ?`,
            listingId
          ) as Promise<Array<any>>
        );
        listing = telegramListings[0];
        source = 'telegram';
      } catch (telegramError: any) {
        // Якщо таблиця TelegramListing не існує, ігноруємо помилку
        console.warn('[Admin Listings Detail] TelegramListing table not available:', telegramError.message);
      }
    }

    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    // Парсимо images
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
      console.warn(`[Admin Listings Detail] Failed to parse images for listing ${listing.id}:`, e);
      images = [];
    }

    // Для Telegram оголошень images містить file_id, які не можна використовувати як URL
    // Очищаємо images для Telegram оголошень, щоб не виникали помилки при відображенні
    if (source === 'telegram') {
      images = [];
    }

    const tags = listing.tags ? (typeof listing.tags === 'string' ? JSON.parse(listing.tags) : listing.tags) : [];

    const formattedListing = {
      id: listing.id,
      userId: listing.userId,
      title: listing.title,
      description: listing.description,
      price: String(listing.price || '0'),
      currency: listing.currency || null,
      isFree: listing.isFree === 1 || listing.isFree === true || listing.isFree === '1',
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
      source: source, // 'marketplace' або 'telegram'
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

export async function PATCH(
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

    const body = await request.json();
    const { category, subcategory } = body;

    if (!category || typeof category !== 'string') {
      return NextResponse.json(
        { error: 'Category is required' },
        { status: 400 }
      );
    }

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const subValue = subcategory == null || subcategory === '' ? null : String(subcategory);

    // Оновлюємо Listing; якщо запис не знайдено (0 змін), оновлюємо TelegramListing
    const listingResult = await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `UPDATE Listing SET category = ?, subcategory = ?, updatedAt = ? WHERE id = ?`,
        category,
        subValue,
        nowStr,
        listingId
      )
    );

    if (Number(listingResult) === 0) {
      const telegramResult = await executeWithRetry(() =>
        prisma.$executeRawUnsafe(
          `UPDATE TelegramListing SET category = ?, subcategory = ?, updatedAt = ? WHERE id = ?`,
          category,
          subValue,
          nowStr,
          listingId
        )
      );
      if (Number(telegramResult) === 0) {
        return NextResponse.json(
          { error: 'Listing not found' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({ success: true, category, subcategory: subValue });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Error updating listing category:', error);
    return NextResponse.json(
      { error: 'Failed to update listing category' },
      { status: 500 }
    );
  }
}
