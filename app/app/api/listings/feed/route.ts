import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeCityInput } from '@/lib/city/cityNormalization';
import { trackUserActivity } from '@/utils/trackActivity';
import { listingTimeFieldsForApi } from '@/utils/parseDbDate';
import { buildListingImageUrl } from '@/lib/listings/imageUrl';
import {
  buildBazaarCatalogCacheKey,
  getBazaarCatalogServerCache,
  setBazaarCatalogServerCache,
} from '@/lib/listings/bazaarCatalogServerCache';
import {
  appendCatalogFiltersToWhere,
  catalogOrderByClause,
  parseConditionParam,
  parseOptionalInt,
  type CatalogFilterParams,
} from '@/lib/listings/catalogFilters';
import { generateSearchVariantsWithCities } from '@/lib/listings/searchVariants';
import {
  backfillFeedDenormIfNeeded,
  ensureFeedDenormColumns,
  FEED_FAVORITES_DISPLAY_SQL,
  pickThumbFromJson,
} from '@/lib/listings/feedDenorm';
import { ensureListingFts, searchListingIdsViaFts } from '@/lib/listings/listingFts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function normalizeCondition(condition: string | null): 'new' | 'used' | null {
  if (!condition) return null;
  if (condition === 'new') return 'new';
  return 'used';
}

function normalizeFavoritesCount(value: number | bigint | string | undefined): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

function encodeCursor(createdAt: string, id: number): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}

function decodeCursor(raw: string | null): { createdAt: string; id: number } | null {
  if (!raw) return null;
  try {
    const text = Buffer.from(raw, 'base64url').toString('utf8');
    const [createdAt, idStr] = text.split('|');
    const id = Number.parseInt(idStr || '', 10);
    if (!createdAt || !Number.isFinite(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/**
 * Легкий каталог: без User/Favorite JOIN, cursor для newest, FTS для search.
 */
export async function GET(request: NextRequest) {
  try {
    void trackUserActivity(request);

    const { ensureCurrencyColumn, ensureFavoriteTable, ensureListingApiRawColumns } =
      await import('@/lib/prisma');
    const currencyColumnExists = await ensureCurrencyColumn();
    await ensureListingApiRawColumns();
    await ensureFavoriteTable();
    await ensureFeedDenormColumns();
    void backfillFeedDenormIfNeeded();
    void ensureListingFts();

    const sp = request.nextUrl.searchParams;
    const category = sp.get('category');
    const subcategory = sp.get('subcategory');
    const isFree = sp.get('isFree') === 'true';
    const search = sp.get('search')?.trim() || null;
    const sortBy = sp.get('sortBy') || 'newest';
    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '20', 10) || 20, 1), 50);
    const offset = Math.max(parseInt(sp.get('offset') || '0', 10) || 0, 0);
    const cursor = decodeCursor(sp.get('cursor'));
    const useCursor = sortBy === 'newest' && !search;

    const citiesRaw = (sp.get('cities')?.trim() || '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const cities = citiesRaw.map((c) => normalizeCityInput(c));
    const minPrice = parseOptionalInt(sp.get('minPrice'));
    const maxPrice = parseOptionalInt(sp.get('maxPrice'));
    const condition = parseConditionParam(sp.get('condition'));
    const currency = sp.get('currency')?.trim().toUpperCase() || null;

    const filters: CatalogFilterParams = {
      category,
      subcategory,
      isFree,
      cities,
      search,
      sortBy,
      minPrice,
      maxPrice,
      condition,
      currency: currency && ['EUR', 'USD', 'UAH'].includes(currency) ? currency : null,
      currencyColumnExists,
    };

    const isServerCacheable =
      !search && cities.length === 0 && offset === 0 && !cursor && sortBy === 'newest';
    const serverCacheKey = isServerCacheable
      ? buildBazaarCatalogCacheKey({
          category,
          subcategory,
          isFree,
          cities,
          search,
          sortBy,
          limit,
          offset,
          minPrice,
          maxPrice,
          condition,
          currency: filters.currency,
          feed: true,
        })
      : null;

    if (serverCacheKey) {
      const cached = getBazaarCatalogServerCache(serverCacheKey);
      if (cached) {
        const res = NextResponse.json(cached);
        res.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
        return res;
      }
    }

    let whereClause = "WHERE l.status = 'active'";
    const params: unknown[] = [];
    whereClause = appendCatalogFiltersToWhere(whereClause, params, filters);
    whereClause +=
      " AND (l.expiresAt IS NULL OR datetime(l.expiresAt) > datetime('now'))";

    // Пошук: FTS → id IN (...); fallback LIKE
    if (search) {
      const ftsIds = await searchListingIdsViaFts(search);
      if (ftsIds && ftsIds.length > 0) {
        whereClause += ` AND l.id IN (${ftsIds.map(() => '?').join(',')})`;
        params.push(...ftsIds);
      } else if (ftsIds && ftsIds.length === 0) {
        const empty = {
          listings: [],
          total: 0,
          limit,
          offset: 0,
          hasMore: false,
          nextCursor: null as string | null,
        };
        return NextResponse.json(empty);
      } else if (search.trim().length <= 30) {
        const searchVariants = generateSearchVariantsWithCities(search.trim());
        const titleConditions = searchVariants.map(() => 'l.title LIKE ?').join(' OR ');
        const descConditions = searchVariants.map(() => 'l.description LIKE ?').join(' OR ');
        const locationConditions = searchVariants.map(() => 'l.location LIKE ?').join(' OR ');
        whereClause += ` AND ((${titleConditions}) OR (${descConditions}) OR (${locationConditions}))`;
        searchVariants.forEach((v) => params.push(`%${v}%`));
        searchVariants.forEach((v) => params.push(`%${v}%`));
        searchVariants.forEach((v) => params.push(`%${v}%`));
      }
    }

    if (useCursor && cursor) {
      whereClause +=
        ' AND (datetime(COALESCE(l.publishedAt, l.createdAt)) < datetime(?) OR (datetime(COALESCE(l.publishedAt, l.createdAt)) = datetime(?) AND l.id < ?))';
      params.push(cursor.createdAt, cursor.createdAt, cursor.id);
    }

    const orderByClause = useCursor
      ? 'ORDER BY datetime(COALESCE(l.publishedAt, l.createdAt)) DESC, l.id DESC'
      : catalogOrderByClause(sortBy);

    const fetchLimit = useCursor ? limit + 1 : limit;

    const listingsQuery = `
      SELECT
        l.id,
        l.title,
        l.price,
        l.previousPrice,
        l.priceChangedAt,
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
        l.thumbUrl,
        l.images,
        l.optimizedImages,
        l.createdAt,
        l.publishedAt,
        ${FEED_FAVORITES_DISPLAY_SQL} as favoritesCount
      FROM Listing l
      ${whereClause}
      ${orderByClause}
      LIMIT ?${useCursor ? '' : ' OFFSET ?'}
    `;

    const queryParams = useCursor
      ? [...params, fetchLimit]
      : [...params, limit, offset];

    let listingsData: any[] = [];
    try {
      listingsData = (await prisma.$queryRawUnsafe(
        listingsQuery,
        ...queryParams
      )) as any[];
    } catch (error: any) {
      // Стара БД без thumbUrl/favoritesCount — ensure вже мав додати; retry без thumbUrl
      const msg = String(error?.message || '');
      if (msg.includes('thumbUrl') || msg.includes('favoritesCount')) {
        await ensureFeedDenormColumns();
        listingsData = (await prisma.$queryRawUnsafe(
          listingsQuery,
          ...queryParams
        )) as any[];
      } else {
        throw error;
      }
    }

    let hasMore = false;
    let nextCursor: string | null = null;
    let total = 0;

    if (useCursor) {
      hasMore = listingsData.length > limit;
      if (hasMore) listingsData = listingsData.slice(0, limit);
      const last = listingsData[listingsData.length - 1];
      if (hasMore && last) {
        const ts = last.publishedAt || last.createdAt;
        nextCursor = encodeCursor(String(ts), Number(last.id));
      }
      total = hasMore ? offset + listingsData.length + 1 : offset + listingsData.length;
    } else {
      const countQuery = `SELECT COUNT(*) as count FROM Listing l ${whereClause}`;
      const countRows = (await prisma.$queryRawUnsafe(
        countQuery,
        ...params
      )) as Array<{ count: bigint }>;
      total = Number(countRows[0]?.count || 0);
      hasMore = offset + listingsData.length < total;
    }

    if (sortBy === 'price_low' || sortBy === 'price_high') {
      listingsData = [...listingsData].sort((a, b) => {
        const pa = a.isFree ? 0 : parseFloat(String(a.price).replace(/[^\d.]/g, '')) || 0;
        const pb = b.isFree ? 0 : parseFloat(String(b.price).replace(/[^\d.]/g, '')) || 0;
        if (sortBy === 'price_low') {
          if (!!a.isFree !== !!b.isFree) return a.isFree ? -1 : 1;
          return pa - pb;
        }
        if (!!a.isFree !== !!b.isFree) return a.isFree ? 1 : -1;
        return pb - pa;
      });
    }

    const formatted = listingsData.map((listing) => {
      const thumbRaw =
        (listing.thumbUrl && String(listing.thumbUrl).trim()) ||
        pickThumbFromJson(listing.optimizedImages, listing.images);
      const thumb = buildListingImageUrl(thumbRaw) || thumbRaw || '';
      const timeFields = listingTimeFieldsForApi(listing);

      return {
        id: listing.id,
        title: listing.title,
        price: listing.isFree ? 'Free' : listing.price,
        previousPrice: listing.previousPrice || null,
        priceChangedAt: listing.priceChangedAt || null,
        currency: (listing.currency as 'UAH' | 'EUR' | 'USD' | undefined) || undefined,
        image: thumb,
        images: thumb ? [thumb] : [],
        thumbUrl: thumb || null,
        seller: {
          name: '',
          avatar: '👤',
          phone: '',
          telegramId: '',
          username: null,
        },
        category: listing.category,
        subcategory: listing.subcategory,
        description: '',
        location: listing.location,
        views: listing.views || 0,
        posted: timeFields.posted,
        publishedAt: timeFields.publishedAt,
        createdAt: timeFields.createdAt,
        condition: normalizeCondition(listing.condition),
        tags: [],
        isFree: listing.isFree === 1 || listing.isFree === true,
        status: listing.status ?? 'active',
        promotionType: listing.promotionType || null,
        promotionEnds: listing.promotionEnds || null,
        favoritesCount: normalizeFavoritesCount(listing.favoritesCount),
      };
    });

    const payload = {
      listings: formatted,
      total,
      limit,
      offset: useCursor ? 0 : offset,
      hasMore,
      nextCursor,
    };
    const response = NextResponse.json(payload);

    if (isServerCacheable && serverCacheKey) {
      response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
      setBazaarCatalogServerCache(serverCacheKey, payload);
    } else {
      response.headers.set('Cache-Control', 'no-store');
    }

    return response;
  } catch (error) {
    console.error('[listings/feed]', error);
    return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 });
  }
}
