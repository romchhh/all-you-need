import { prisma } from '@/lib/prisma';
import { rawQuery } from '@/lib/dbSql';
import { parseListingDisplayConfig } from '@/lib/businessProfileSettings';
import { resolveStoredListingImages } from '@/lib/listings/imageStorage';
import { LISTING_FAVORITES_COUNT_SQL } from '@/lib/listingFavoritesCountSql';
import { getListingDisplayDate, parseDbDate } from '@/utils/parseDbDate';
import { formatPostedTimeUk } from '@/utils/formatPostedTimeUk';
import type { Listing } from '@/types';

const PREVIEW_LIMIT = 8;

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

function formatListingRow(listing: Record<string, unknown>): Listing {
  let rawImages: string[] = [];
  try {
    rawImages =
      typeof listing.images === 'string'
        ? (JSON.parse(listing.images) as string[])
        : (listing.images as string[]) || [];
  } catch {
    rawImages = [];
  }
  const images = resolveStoredListingImages(rawImages);
  const sellerName = listing.sellerFirstName
    ? `${listing.sellerFirstName} ${listing.sellerLastName || ''}`.trim()
    : (listing.sellerUsername as string) || 'Користувач';
  const display = getListingDisplayDate({
    publishedAt: listing.publishedAt as string | null | undefined,
    createdAt: listing.createdAt as string,
  });

  return {
    id: Number(listing.id),
    title: String(listing.title),
    price: listing.isFree ? 'Free' : String(listing.price),
    previousPrice: (listing.previousPrice as string) || null,
    priceChangedAt: listing.priceChangedAt
      ? parseDbDate(listing.priceChangedAt as string)?.toISOString() ??
        String(listing.priceChangedAt)
      : null,
    currency: (listing.currency as Listing['currency']) || undefined,
    image: images[0] || '',
    images: images[0] ? [images[0]] : [],
    seller: {
      name: sellerName,
      avatar: (listing.sellerAvatar as string) || '👤',
      phone: (listing.sellerPhone as string) || '',
      telegramId: listing.sellerTelegramId?.toString() || '',
      username: (listing.sellerUsername as string) || null,
    },
    category: String(listing.category),
    subcategory: (listing.subcategory as string) || undefined,
    description: '',
    location: String(listing.location || ''),
    views: Number(listing.views) || 0,
    posted: display ? formatPostedTimeUk(display) : '',
    isFree: listing.isFree === 1 || listing.isFree === true,
    status: (listing.status as Listing['status']) || 'active',
    favoritesCount: Number(listing.favoritesCount ?? 0),
    profileType: 'business',
  };
}

export async function attachBusinessSearchListingPreviews<T extends { id: number }>(
  businesses: T[],
  previewLimit = PREVIEW_LIMIT
): Promise<Array<T & { vitrineListings: Listing[] }>> {
  if (businesses.length === 0) return [];

  const profiles = await prisma.businessProfile.findMany({
    where: { id: { in: businesses.map((b) => b.id) } },
    select: { id: true, userId: true, linkedListingIds: true },
  });
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const userIds = [...new Set(profiles.map((p) => p.userId))];
  const listingsByUserId = new Map<number, number[]>();
  if (userIds.length > 0) {
    const userPh = userIds.map(() => '?').join(',');
    const listingRows = await rawQuery<Array<{ id: number; userId: number }>>(
      prisma,
      `SELECT id, userId FROM Listing WHERE userId IN (${userPh}) AND status = 'active' ORDER BY id DESC`,
      userIds
    );
    for (const row of listingRows) {
      const uid = Number(row.userId);
      const list = listingsByUserId.get(uid) ?? [];
      list.push(Number(row.id));
      listingsByUserId.set(uid, list);
    }
  }

  const idLists = businesses.map((b) => {
    const profile = profileById.get(b.id);
    if (!profile) return [] as number[];
    const config = parseListingDisplayConfig(profile.linkedListingIds);
    const ids =
      config.mode === 'manual'
        ? config.ids.filter((id) => Number.isFinite(id))
        : listingsByUserId.get(profile.userId) ?? [];
    return ids.slice(0, previewLimit);
  });

  const allListingIds = [...new Set(idLists.flat())];
  const listingById = new Map<number, Listing>();

  if (allListingIds.length > 0) {
    const placeholders = allListingIds.map(() => '?').join(',');
    const rows = await rawQuery<Array<Record<string, unknown>>>(
      prisma,
      `SELECT ${LISTING_SELECT}
       FROM Listing l
       JOIN User u ON l.userId = u.id
       WHERE l.id IN (${placeholders}) AND l.status = 'active'`,
      allListingIds
    );
    for (const row of rows) {
      listingById.set(Number(row.id), formatListingRow(row));
    }
  }

  return businesses.map((b, index) => {
    const ordered = idLists[index]
      .map((id) => listingById.get(id))
      .filter((l): l is Listing => Boolean(l));
    return { ...b, vitrineListings: ordered };
  });
}
