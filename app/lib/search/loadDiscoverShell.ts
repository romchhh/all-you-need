import { prisma, executeWithRetry } from '@/lib/prisma';
import { getListingDisplayDate, parseDbDate } from '@/utils/parseDbDate';
import { formatPostedTimeUk } from '@/utils/formatPostedTimeUk';
import { LISTING_FAVORITES_COUNT_SQL } from '@/lib/listingFavoritesCountSql';
import {
  formatBusinessActivityLine,
  formatBusinessLocationLine,
  getRecommendedBusinessProfiles,
} from '@/lib/business/businessSearchHelpers';
import { attachBusinessSearchListingPreviews } from '@/lib/business/businessSearchListings';
import { logApiError } from '@/lib/server/logApiError';

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
  CAST(u.telegramId AS TEXT) as sellerTelegramId,
  ${LISTING_FAVORITES_COUNT_SQL} as favoritesCount
`;

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

export async function loadSearchDiscoverShell(options: {
  telegramId?: string | null;
  viewerTelegramId?: string | null;
  popularLimit?: number;
  recentLimit?: number;
  businessLimit?: number;
  lang?: 'uk' | 'ru';
}) {
  const popularLimit = Math.min(options.popularLimit ?? 24, 24);
  const recentLimit = Math.min(options.recentLimit ?? 16, 16);
  const businessLimit = Math.min(options.businessLimit ?? 12, 12);
  const lang = options.lang === 'ru' ? 'ru' : 'uk';

  const [popularRows, recentRows, businessBase] = await Promise.all([
    executeWithRetry(
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
    ),
    (async () => {
      const telegramId = options.telegramId?.trim();
      if (!telegramId) return [] as Array<Record<string, unknown>>;
      const viewerId = parseInt(telegramId, 10);
      if (Number.isNaN(viewerId)) return [];
      return executeWithRetry(
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
    })(),
    getRecommendedBusinessProfiles(businessLimit, options.viewerTelegramId ?? null),
  ]);

  const mapped = businessBase.map((item) => ({
    ...item,
    activityLine: formatBusinessActivityLine(item.category, item.subcategory, lang),
    locationLine: formatBusinessLocationLine(item.city, item.address),
  }));

  let recommendedBusinesses = mapped;
  try {
    recommendedBusinesses = await attachBusinessSearchListingPreviews(mapped);
  } catch (previewError) {
    logApiError('search/shell business previews', previewError);
    recommendedBusinesses = mapped.map((b) => ({ ...b, vitrineListings: [] }));
  }

  return {
    popularListings: popularRows.map(formatListingRow),
    recentViewedListings: recentRows.map(formatListingRow),
    recommendedBusinesses,
  };
}
