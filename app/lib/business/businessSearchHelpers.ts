import { prisma } from '@/lib/prisma';
import {
  getCustomDirectionText,
  getBusinessDirectionLabel,
  getBusinessSphereLabel,
  isValidBusinessSphere,
  parseBusinessDirections,
} from '@/lib/businessSphereConstants';
import type { BusinessLang } from '@/lib/businessSphereLabels';

export type BusinessSearchSort = 'relevance' | 'rating';

export type BusinessSearchFilters = {
  search?: string;
  sphere?: string | null;
  direction?: string | null;
  cities?: string[];
  hasPhysicalAddress?: boolean;
  travelsToClient?: boolean;
  worksOnline?: boolean;
  minRating?: number | null;
  sortBy?: BusinessSearchSort;
  limit?: number;
  offset?: number;
  viewerTelegramId?: string | null;
};

export type BusinessSearchResultRow = {
  id: number;
  businessName: string;
  logo: string | null;
  category: string;
  subcategory: string | null;
  description: string;
  city: string;
  address: string | null;
  sellerTelegramId: string;
  rating: number;
  reviewsCount: number;
  followersCount: number;
  isFollowing: boolean;
};

const ACTIVE_BUSINESS_WHERE = `
  bp.subscriptionStatus = 'active'
  AND (bp.subscriptionEndsAt IS NULL OR bp.subscriptionEndsAt > datetime('now'))
  AND bp.isPublished = 1
`;

function buildSearchPattern(term: string): string {
  return `%${term.trim().replace(/[%_]/g, '')}%`;
}

function appendSearchClause(search: string | undefined, params: unknown[]): string {
  if (!search?.trim()) return '';

  const pattern = buildSearchPattern(search);
  params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);

  return ` AND (
    bp.businessName LIKE ?
    OR bp.category LIKE ?
    OR bp.subcategory LIKE ?
    OR bp.description LIKE ?
    OR EXISTS (
      SELECT 1 FROM Listing l
      WHERE l.userId = bp.userId
        AND COALESCE(l.profileType, 'personal') = 'business'
        AND l.status = 'active'
        AND (
          l.title LIKE ?
          OR l.description LIKE ?
          OR l.category LIKE ?
          OR l.subcategory LIKE ?
        )
    )
  )`;
}

function appendFilterClauses(filters: BusinessSearchFilters, params: unknown[]): string {
  let clause = '';

  if (filters.sphere && isValidBusinessSphere(filters.sphere)) {
    clause += ' AND bp.category = ?';
    params.push(filters.sphere);
  }

  if (filters.direction?.trim()) {
    clause += ' AND bp.subcategory LIKE ?';
    params.push(`%"${filters.direction.trim()}"%`);
  }

  if (filters.cities?.length) {
    const cityParts = filters.cities.map(() => 'bp.city LIKE ?');
    filters.cities.forEach((city) => params.push(`%${city.trim()}%`));
    clause += ` AND (${cityParts.join(' OR ')})`;
  }

  if (filters.hasPhysicalAddress) {
    clause += ` AND bp.address IS NOT NULL AND TRIM(bp.address) != ''`;
  }

  if (filters.travelsToClient) {
    clause += ` AND bp.serviceArea IN ('city_radius', 'all_germany')`;
  }

  if (filters.worksOnline) {
    clause += ` AND bp.website IS NOT NULL AND TRIM(bp.website) != ''`;
  }

  if (filters.minRating != null && filters.minRating > 0) {
    clause += ' AND COALESCE(u.rating, 0) >= ?';
    params.push(filters.minRating);
  }

  return clause;
}

async function resolveViewerUserId(viewerTelegramId?: string | null): Promise<number | null> {
  if (!viewerTelegramId) return null;
  const viewerIdNum = parseInt(viewerTelegramId, 10);
  if (Number.isNaN(viewerIdNum)) return null;

  const viewers = (await prisma.$queryRawUnsafe(
    `SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ? LIMIT 1`,
    viewerIdNum
  )) as Array<{ id: number }>;

  return viewers[0]?.id ?? null;
}

export function formatBusinessActivityLine(
  sphereId: string,
  directionsRaw: string | null | undefined,
  lang: BusinessLang,
  maxParts = 3
): string {
  const parts: string[] = [];
  const sphereLabel = getBusinessSphereLabel(sphereId, lang);
  if (sphereLabel) parts.push(sphereLabel);

  const directions = parseBusinessDirections(directionsRaw);
  for (const dir of directions) {
    if (parts.length >= maxParts) break;
    const customText = getCustomDirectionText(dir);
    const resolved = getBusinessDirectionLabel(dir, lang) || customText;
    if (resolved && !parts.includes(resolved)) {
      parts.push(resolved);
    }
  }

  return parts.slice(0, maxParts).join(' · ');
}

export function formatBusinessLocationLine(city: string, address: string | null | undefined): string {
  const cityPart = city?.trim() || '';
  const addressPart = address?.trim() || '';
  if (cityPart && addressPart) return `${cityPart}, ${addressPart}`;
  return cityPart || addressPart;
}

export async function searchBusinessProfiles(
  filters: BusinessSearchFilters
): Promise<{ items: BusinessSearchResultRow[]; total: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 24, 1), 48);
  const offset = Math.max(filters.offset ?? 0, 0);
  const sortBy = filters.sortBy ?? 'relevance';
  const search = filters.search?.trim() || '';

  const whereParams: unknown[] = [];
  const searchClause = appendSearchClause(search, whereParams);
  const filterClause = appendFilterClauses(filters, whereParams);

  const countRows = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT bp.id) as cnt
     FROM BusinessProfile bp
     JOIN User u ON u.id = bp.userId
     WHERE ${ACTIVE_BUSINESS_WHERE}
     ${searchClause}
     ${filterClause}`,
    ...whereParams
  )) as Array<{ cnt: bigint | number }>;

  const total = Number(countRows[0]?.cnt ?? 0);
  if (total === 0) {
    return { items: [], total: 0 };
  }

  const viewerUserId = await resolveViewerUserId(filters.viewerTelegramId);
  const listParams: unknown[] = [];
  if (viewerUserId != null) {
    listParams.push(viewerUserId);
  }
  listParams.push(...whereParams);

  let orderBy = 'ORDER BY bp.followersCount DESC, COALESCE(u.rating, 0) DESC';
  if (sortBy === 'rating') {
    orderBy = 'ORDER BY COALESCE(u.rating, 0) DESC, COALESCE(u.reviewsCount, 0) DESC, bp.followersCount DESC';
  } else if (search) {
    listParams.push(buildSearchPattern(search));
    orderBy = `ORDER BY
      CASE WHEN bp.businessName LIKE ? THEN 0 ELSE 1 END,
      COALESCE(u.rating, 0) DESC,
      bp.followersCount DESC`;
  }

  listParams.push(limit, offset);

  const followSelect =
    viewerUserId != null
      ? `CASE WHEN bf.id IS NOT NULL THEN 1 ELSE 0 END as isFollowing`
      : `0 as isFollowing`;
  const followJoin =
    viewerUserId != null
      ? `LEFT JOIN BusinessFollow bf ON bf.businessProfileId = bp.id AND bf.followerUserId = ?`
      : '';

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT DISTINCT
       bp.id,
       bp.businessName,
       bp.logo,
       bp.category,
       bp.subcategory,
       bp.description,
       bp.city,
       bp.address,
       CAST(u.telegramId AS TEXT) as sellerTelegramId,
       COALESCE(u.rating, 0) as rating,
       COALESCE(u.reviewsCount, 0) as reviewsCount,
       COALESCE(bp.followersCount, 0) as followersCount,
       ${followSelect}
     FROM BusinessProfile bp
     JOIN User u ON u.id = bp.userId
     ${followJoin}
     WHERE ${ACTIVE_BUSINESS_WHERE}
     ${searchClause}
     ${filterClause}
     ${orderBy}
     LIMIT ? OFFSET ?`,
    ...listParams
  )) as Array<Record<string, unknown>>;

  const items: BusinessSearchResultRow[] = rows.map((row) => ({
    id: Number(row.id),
    businessName: String(row.businessName),
    logo: (row.logo as string | null) ?? null,
    category: String(row.category),
    subcategory: (row.subcategory as string | null) ?? null,
    description: String(row.description),
    city: String(row.city),
    address: (row.address as string | null) ?? null,
    sellerTelegramId: String(row.sellerTelegramId),
    rating: Number(row.rating) || 0,
    reviewsCount: Number(row.reviewsCount) || 0,
    followersCount: Number(row.followersCount) || 0,
    isFollowing: Number(row.isFollowing) === 1,
  }));

  return { items, total };
}

export async function getRecommendedBusinessProfiles(
  limit = 6,
  viewerTelegramId?: string | null
): Promise<BusinessSearchResultRow[]> {
  const { items } = await searchBusinessProfiles({
    sortBy: 'rating',
    limit,
    offset: 0,
    viewerTelegramId,
  });
  return items;
}
