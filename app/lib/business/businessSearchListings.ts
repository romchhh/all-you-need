import { prisma } from '@/lib/prisma';
import { rawQuery } from '@/lib/dbSql';
import { parseListingDisplayConfig } from '@/lib/businessProfileSettings';
import { resolveStoredListingImages } from '@/lib/listings/imageStorage';
import { LISTING_FAVORITES_COUNT_SQL } from '@/lib/listingFavoritesCountSql';
import { getListingDisplayDate, parseDbDate } from '@/utils/parseDbDate';
import { formatPostedTimeUk } from '@/utils/formatPostedTimeUk';
import type { Listing } from '@/types';

const PREVIEW_LIMIT = 8;
const VITRINE_LIMIT = 200;

/** PG raw часто віддає id як bigint/string — Number.isFinite(1n|"12") === false. */
export function toFinitePositiveId(value: unknown): number | null {
  if (typeof value === 'bigint') {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export function normalizeListingIds(ids: unknown[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of ids) {
    const id = toFinitePositiveId(raw);
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

const LISTING_SELECT_CORE = `
  l.id,
  l.title,
  l.description,
  l.price,
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
  CAST(u.telegramId AS TEXT) as sellerTelegramId
`;

const LISTING_SELECT = `
  ${LISTING_SELECT_CORE},
  l.previousPrice,
  l.priceChangedAt,
  ${LISTING_FAVORITES_COUNT_SQL} as favoritesCount
`;

async function queryListingRows(
  sqlFull: string,
  sqlCoreFrom: string,
  params: unknown[]
): Promise<Array<Record<string, unknown>>> {
  try {
    return await rawQuery<Array<Record<string, unknown>>>(prisma, sqlFull, params);
  } catch {
    try {
      return await rawQuery<Array<Record<string, unknown>>>(
        prisma,
        `SELECT ${LISTING_SELECT_CORE} ${sqlCoreFrom}`,
        params
      );
    } catch {
      const sqlNoFav = sqlFull.replace(`, ${LISTING_FAVORITES_COUNT_SQL} as favoritesCount`, '');
      return await rawQuery<Array<Record<string, unknown>>>(prisma, sqlNoFav, params);
    }
  }
}

function rowsToListingsPreserveOrder(
  rows: Array<Record<string, unknown>>,
  orderedIds?: number[]
): Listing[] {
  const listingById = new Map<number, Listing>();
  for (const row of rows) {
    const id = toFinitePositiveId(row.id);
    if (id == null) continue;
    listingById.set(id, formatListingRow(row));
  }
  if (!orderedIds?.length) {
    return [...listingById.values()];
  }
  return orderedIds
    .map((id) => listingById.get(id))
    .filter((listing): listing is Listing => Boolean(listing));
}

export async function fetchFormattedActiveListingsByIds(ids: number[]): Promise<Listing[]> {
  const listingIds = normalizeListingIds(ids);
  if (listingIds.length === 0) return [];

  const placeholders = listingIds.map(() => '?').join(',');
  const fromWhere = `FROM Listing l
       JOIN User u ON l.userId = u.id
       WHERE l.id IN (${placeholders}) AND l.status = 'active'`;
  const sql = `SELECT ${LISTING_SELECT} ${fromWhere}`;

  const rows = await queryListingRows(sql, fromWhere, listingIds);
  return rowsToListingsPreserveOrder(rows, listingIds);
}

/** Активні оголошення власника (режим вітрини «усі»). */
export async function fetchFormattedActiveListingsByUserId(
  userId: number,
  limit = VITRINE_LIMIT
): Promise<Listing[]> {
  const uid = toFinitePositiveId(userId);
  if (uid == null) return [];

  const fromWhere = `FROM Listing l
       JOIN User u ON l.userId = u.id
       WHERE l.userId = ? AND l.status = 'active'
       ORDER BY l.id DESC
       LIMIT ?`;
  const sql = `SELECT ${LISTING_SELECT} ${fromWhere}`;

  const rows = await queryListingRows(sql, fromWhere, [uid, limit]);
  return rowsToListingsPreserveOrder(rows);
}

/**
 * Публічна вітрина бізнесу: mode=all → активні оголошення userId;
 * mode=manual → активні з обраних id.
 */
export async function fetchPublicBusinessVitrineListings(
  userId: number,
  linkedListingIdsRaw: string | null | undefined
): Promise<Listing[]> {
  const config = parseListingDisplayConfig(linkedListingIdsRaw);
  if (config.mode === 'manual') {
    return fetchFormattedActiveListingsByIds(config.ids);
  }
  return fetchFormattedActiveListingsByUserId(userId);
}

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
      const uid = toFinitePositiveId(row.userId);
      const lid = toFinitePositiveId(row.id);
      if (uid == null || lid == null) continue;
      const list = listingsByUserId.get(uid) ?? [];
      list.push(lid);
      listingsByUserId.set(uid, list);
    }
  }

  const idLists = businesses.map((b) => {
    const profile = profileById.get(b.id);
    if (!profile) return [] as number[];
    const config = parseListingDisplayConfig(profile.linkedListingIds);
    const ids =
      config.mode === 'manual'
        ? normalizeListingIds(config.ids)
        : listingsByUserId.get(profile.userId) ?? [];
    return ids.slice(0, previewLimit);
  });

  const allListingIds = [...new Set(idLists.flat())];
  const formatted = await fetchFormattedActiveListingsByIds(allListingIds);
  const listingById = new Map(formatted.map((listing) => [listing.id, listing]));

  return businesses.map((b, index) => {
    const ordered = idLists[index]
      .map((id) => listingById.get(id))
      .filter((l): l is Listing => Boolean(l));
    return { ...b, vitrineListings: ordered };
  });
}
