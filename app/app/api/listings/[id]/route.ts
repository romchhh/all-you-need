import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { trackUserActivity } from '@/utils/trackActivity';
import { getListingDisplayDate, parseDbDate } from '@/utils/parseDbDate';
import { formatPostedTimeUk } from '@/utils/formatPostedTimeUk';
import { LISTING_FAVORITES_COUNT_SQL } from '@/lib/listingFavoritesCountSql';

// Функція для конвертації старих значень стану в нові
function normalizeCondition(condition: string | null): 'new' | 'used' | null {
  if (!condition) return null;
  if (condition === 'new') return 'new';
  // Конвертуємо всі старі значення (like_new, good, fair) в 'used'
  return 'used';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Відстежуємо активність користувача
    await trackUserActivity(request);
    
    const { id } = await params;
    const listingId = parseInt(id);
    const searchParams = request.nextUrl.searchParams;
    const viewerId = searchParams.get('viewerId'); // Telegram ID користувача, який переглядає

    // Перевіряємо колонку currency та таблицю Favorite (з кешуванням)
    const { ensureCurrencyColumn, ensureFavoriteTable, ensureListingApiRawColumns } =
      await import('@/lib/prisma');
    const currencyColumnExists = await ensureCurrencyColumn();
    await ensureFavoriteTable();
    await ensureListingApiRawColumns();

    const queryWithFavorites = `SELECT 
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
        COALESCE(l.autoRenew, 0) as autoRenew,
        l.images,
        l.tags,
        l.createdAt,
        l.publishedAt,
        u.id as userId,
        CAST(u.telegramId AS INTEGER) as telegramId,
        u.username,
        u.firstName,
        u.lastName,
        u.avatar,
        u.phone,
        ${LISTING_FAVORITES_COUNT_SQL} as favoritesCount
      FROM Listing l
      JOIN User u ON l.userId = u.id
      WHERE l.id = ?`;

    let listings: Array<any>;
    try {
      listings = await prisma.$queryRawUnsafe(queryWithFavorites, listingId) as Array<{
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
      promotionType: string | null;
      promotionEnds: string | null;
      images: string;
      tags: string | null;
      createdAt: string;
      telegramId: number;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
      avatar: string | null;
      phone: string | null;
      favoritesCount?: number | bigint | string;
    }>;
    } catch (error: any) {
      const msg = String(error?.message || '');
      const favBroken =
        msg.includes('no such table: Favorite') ||
        (msg.includes('Favorite') && !msg.toLowerCase().includes('favoriteboost'));
      const arBroken = msg.includes('autoRenew');
      if (!favBroken && !arBroken) {
        throw error;
      }
      let q = queryWithFavorites;
      if (favBroken) {
        q = q.replace(`, ${LISTING_FAVORITES_COUNT_SQL} as favoritesCount`, '');
      }
      if (arBroken) {
        q = q.replace(', COALESCE(l.autoRenew, 0) as autoRenew', '');
      }
      listings = (await prisma.$queryRawUnsafe(q, listingId)) as Array<any>;
      if (listings[0]) {
        if (favBroken) (listings[0] as any).favoritesCount = 0;
        if (arBroken) (listings[0] as any).autoRenew = listings[0].autoRenew ?? 0;
      }
    }

    if (!listings || listings.length === 0) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    const listing = listings[0];

    // Рахуємо тільки унікальні перегляди
    if (viewerId) {
      try {
        // Перевіряємо/створюємо таблицю ViewHistory (з кешуванням)
        const { ensureViewHistoryTable } = await import('@/lib/prisma');
        await ensureViewHistoryTable();
        
        // Перевіряємо, чи цей користувач вже переглядав це оголошення (з retry)
        const viewerTelegramId = parseInt(viewerId);
        const { executeWithRetry } = await import('@/lib/prisma');
        
        const existingView = await executeWithRetry(() =>
          prisma.$queryRawUnsafe(
            `SELECT id FROM ViewHistory WHERE listingId = ? AND viewerTelegramId = ? LIMIT 1`,
            listingId,
            viewerTelegramId
          ) as Promise<Array<{ id: number }>>
        );
        
        // Якщо користувач ще не переглядав - додаємо перегляд (з retry)
        if (!existingView || existingView.length === 0) {
          // Додаємо запис в історію переглядів
          await executeWithRetry(() =>
            prisma.$executeRawUnsafe(
              `INSERT INTO ViewHistory (listingId, viewerTelegramId, viewedAt) VALUES (?, ?, ?)`,
              listingId,
              viewerTelegramId,
              new Date().toISOString()
            )
          );
          
          // Збільшуємо кількість переглядів
          await executeWithRetry(() =>
            prisma.$executeRawUnsafe(
              `UPDATE Listing SET views = views + 1 WHERE id = ?`,
              listingId
            )
          );
        }
      } catch (error: any) {
        // Якщо помилка - все одно повертаємо оголошення
        console.error('Error recording view:', error?.message || error);
      }
    }

    // Отримуємо актуальне значення views
    const updatedListing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { views: true },
    });
    const currentViews = updatedListing?.views || listing.views;

    // Форматуємо дані (час публікації для «щойно» — publishedAt після модерації)
    const display = getListingDisplayDate({
      publishedAt: listing.publishedAt,
      createdAt: listing.createdAt,
    });
    const formattedListing = {
        id: listing.id,
        title: listing.title,
        price: listing.price,
        currency: (listing.currency as 'UAH' | 'EUR' | 'USD' | undefined) || undefined,
        image: JSON.parse(listing.images)[0] || '',
        images: JSON.parse(listing.images),
        seller: {
          name: listing.firstName 
            ? `${listing.firstName} ${listing.lastName || ''}`.trim()
            : listing.username || 'Користувач',
          avatar: listing.avatar || '👤',
          phone: listing.phone || '',
          telegramId: listing.telegramId?.toString() || '',
          username: listing.username || null,
        },
        category: listing.category,
        subcategory: listing.subcategory,
        description: listing.description,
        location: listing.location,
        views: currentViews, // Використовуємо актуальне значення
        posted: display ? formatPostedTimeUk(display) : '',
        publishedAt:
          listing.publishedAt != null && String(listing.publishedAt).trim() !== ''
            ? parseDbDate(listing.publishedAt)?.toISOString() ?? listing.publishedAt
            : null,
        createdAt:
          parseDbDate(listing.createdAt)?.toISOString() ?? listing.createdAt,
        condition: normalizeCondition(listing.condition),
        tags: listing.tags ? JSON.parse(listing.tags) : [],
        isFree: listing.isFree === 1,
        status: listing.status || 'active',
        promotionType: listing.promotionType || null,
        promotionEnds: listing.promotionEnds || null,
        autoRenew:
          (listing as any).autoRenew === true || Number((listing as any).autoRenew) === 1,
        favoritesCount: normalizeFavoritesCount((listing as any).favoritesCount),
      };

    return NextResponse.json(formattedListing);
  } catch (error) {
    console.error('Error fetching listing:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listing' },
      { status: 500 }
    );
  }
}

// SQLite може повертати COUNT як number, bigint або string
function normalizeFavoritesCount(value: number | bigint | string | undefined): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return parseInt(value, 10) || 0;
  return 0;
}
