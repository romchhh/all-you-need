import { NextRequest, NextResponse } from 'next/server';
import { prisma, executeWithRetry } from '@/lib/prisma';
import { getListingDisplayDate, parseDbDate } from '@/utils/parseDbDate';
import { formatPostedTimeUk } from '@/utils/formatPostedTimeUk';
import { LISTING_FAVORITES_COUNT_SQL } from '@/lib/listingFavoritesCountSql';

export const dynamic = 'force-dynamic';

function formatListingRow(listing: Record<string, unknown>) {
  const images =
    typeof listing.images === 'string'
      ? JSON.parse(listing.images)
      : (listing.images as string[]) || [];
  const sellerName = listing.sellerFirstName
    ? `${listing.sellerFirstName} ${listing.sellerLastName || ''}`.trim()
    : (listing.sellerUsername as string) || 'Користувач';
  const display = getListingDisplayDate({
    publishedAt: listing.publishedAt as string | null | undefined,
    createdAt: listing.createdAt as string,
  });

  return {
    id: listing.id as number,
    title: listing.title as string,
    price: listing.isFree ? 'Free' : (listing.price as string),
    previousPrice: (listing.previousPrice as string) || null,
    priceChangedAt: listing.priceChangedAt
      ? parseDbDate(listing.priceChangedAt as string)?.toISOString() ?? (listing.priceChangedAt as string)
      : null,
    currency: (listing.currency as string) || undefined,
    image: images[0] || '',
    images,
    seller: {
      name: sellerName,
      avatar: (listing.sellerAvatar as string) || '👤',
      phone: (listing.sellerPhone as string) || '',
      telegramId: listing.sellerTelegramId?.toString() || '',
      username: (listing.sellerUsername as string) || null,
    },
    category: listing.category as string,
    subcategory: listing.subcategory as string | undefined,
    description: listing.description as string,
    location: listing.location as string,
    views: (listing.views as number) || 0,
    posted: display ? formatPostedTimeUk(display) : '',
    isFree: listing.isFree === 1 || listing.isFree === true,
    status: (listing.status as string) || 'active',
    favoritesCount: Number(listing.favoritesCount ?? 0),
  };
}

const LISTING_SELECT = `
  l.id,
  l.title,
  l.description,
  l.price,
  l.previousPrice,
  l.priceChangedAt,
  l.currency,
  l.isFree,
  l.category,
  l.subcategory,
  l.location,
  l.views,
  l.status,
  l.images,
  l.createdAt,
  l.publishedAt,
  u.username as sellerUsername,
  u.firstName as sellerFirstName,
  u.lastName as sellerLastName,
  u.avatar as sellerAvatar,
  u.phone as sellerPhone,
  CAST(u.telegramId AS INTEGER) as sellerTelegramId,
  ${LISTING_FAVORITES_COUNT_SQL} as favoritesCount
`;

export async function GET(request: NextRequest) {
  try {
    const telegramId = request.nextUrl.searchParams.get('telegramId');
    const popularLimit = Math.min(
      parseInt(request.nextUrl.searchParams.get('popularLimit') || '8', 10),
      16
    );
    const recentLimit = Math.min(
      parseInt(request.nextUrl.searchParams.get('recentLimit') || '8', 10),
      12
    );

    const popularRows = await executeWithRetry(
      () =>
        prisma.$queryRawUnsafe(
          `SELECT ${LISTING_SELECT}
           FROM Listing l
           JOIN User u ON l.userId = u.id
           WHERE l.status = 'active'
           ORDER BY l.views DESC, l.createdAt DESC
           LIMIT ?`,
          popularLimit
        ) as Promise<Array<Record<string, unknown>>>
    );

    let recentRows: Array<Record<string, unknown>> = [];

    if (telegramId) {
      const viewerId = parseInt(telegramId, 10);
      if (!Number.isNaN(viewerId)) {
        recentRows = await executeWithRetry(
          () =>
            prisma.$queryRawUnsafe(
              `SELECT ${LISTING_SELECT}
               FROM ViewHistory vh
               JOIN Listing l ON l.id = vh.listingId
               JOIN User u ON l.userId = u.id
               WHERE vh.viewerTelegramId = ?
                 AND l.status = 'active'
               ORDER BY vh.viewedAt DESC
               LIMIT ?`,
              viewerId,
              recentLimit
            ) as Promise<Array<Record<string, unknown>>>
        );
      }
    }

    return NextResponse.json({
      popularListings: popularRows.map(formatListingRow),
      recentViewedListings: recentRows.map(formatListingRow),
    });
  } catch (error) {
    console.error('[search/discover]', error);
    return NextResponse.json(
      { popularListings: [], recentViewedListings: [], error: 'unavailable' },
      { status: 503 }
    );
  }
}
