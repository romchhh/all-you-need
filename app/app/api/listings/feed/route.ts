import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeCityInput } from '@/lib/city/cityNormalization';
import { trackUserActivity } from '@/utils/trackActivity';
import { listingTimeFieldsForApi } from '@/utils/parseDbDate';
import {
  LISTING_FAVORITES_JOIN_SQL,
  LISTING_FAVORITES_COUNT_FROM_JOIN_SQL,
} from '@/lib/listingFavoritesCountSql';
import { resolveStoredListingImages } from '@/lib/listings/imageStorage';
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
import {
  generateSearchVariantsWithCities,
  normalizeCyrillicToLower,
  generateSearchVariants,
} from '@/lib/listings/searchVariants';

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

/**
 * Легкий каталог для стрічки базару: без description/tags/phone/повних images.
 */
export async function GET(request: NextRequest) {
  try {
    await trackUserActivity(request);

    const { ensureCurrencyColumn, ensureFavoriteTable, ensureListingApiRawColumns } =
      await import('@/lib/prisma');
    const currencyColumnExists = await ensureCurrencyColumn();
    await ensureListingApiRawColumns();
    await ensureFavoriteTable();

    const sp = request.nextUrl.searchParams;
    const category = sp.get('category');
    const subcategory = sp.get('subcategory');
    const isFree = sp.get('isFree') === 'true';
    const search = sp.get('search')?.trim() || null;
    const sortBy = sp.get('sortBy') || 'newest';
    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '20', 10) || 20, 1), 50);
    const offset = Math.max(parseInt(sp.get('offset') || '0', 10) || 0, 0);
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

    const isServerCacheable = !search && cities.length === 0 && offset === 0;
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

    if (search && search.trim().length <= 30) {
      const searchVariants = generateSearchVariantsWithCities(search.trim());
      const titleConditions = searchVariants.map(() => 'l.title LIKE ?').join(' OR ');
      const descConditions = searchVariants.map(() => 'l.description LIKE ?').join(' OR ');
      const locationConditions = searchVariants.map(() => 'l.location LIKE ?').join(' OR ');
      whereClause += ` AND ((${titleConditions}) OR (${descConditions}) OR (${locationConditions}))`;
      searchVariants.forEach((v) => params.push(`%${v}%`));
      searchVariants.forEach((v) => params.push(`%${v}%`));
      searchVariants.forEach((v) => params.push(`%${v}%`));
    }

    whereClause +=
      " AND (l.expiresAt IS NULL OR datetime(l.expiresAt) > datetime('now'))";

    const orderByClause = catalogOrderByClause(sortBy);

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
        l.images,
        l.optimizedImages,
        l.createdAt,
        l.publishedAt,
        u.username as sellerUsername,
        u.firstName as sellerFirstName,
        u.lastName as sellerLastName,
        u.avatar as sellerAvatar,
        CAST(u.telegramId AS INTEGER) as sellerTelegramId,
        ${LISTING_FAVORITES_COUNT_FROM_JOIN_SQL} as favoritesCount
      FROM Listing l
      JOIN User u ON l.userId = u.id
      ${LISTING_FAVORITES_JOIN_SQL}
      ${whereClause}
      ${orderByClause}
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as count
      FROM Listing l
      JOIN User u ON l.userId = u.id
      ${whereClause}
    `;

    let listingsData: any[] = [];
    let total = 0;

    try {
      const [data, countRows] = await Promise.all([
        prisma.$queryRawUnsafe(listingsQuery, ...params, limit, offset) as Promise<any[]>,
        prisma.$queryRawUnsafe(countQuery, ...params) as Promise<Array<{ count: bigint }>>,
      ]);
      listingsData = data;
      total = Number(countRows[0]?.count || 0);
    } catch (error: any) {
      const msg = String(error?.message || '');
      const favBroken =
        msg.includes('no such table: Favorite') ||
        (msg.includes('Favorite') && !msg.toLowerCase().includes('favoriteboost'));
      if (!favBroken) throw error;
      const fallback = listingsQuery
        .replace(`, ${LISTING_FAVORITES_COUNT_FROM_JOIN_SQL} as favoritesCount`, '')
        .replace(LISTING_FAVORITES_JOIN_SQL, '');
      const [data, countRows] = await Promise.all([
        prisma.$queryRawUnsafe(fallback, ...params, limit, offset) as Promise<any[]>,
        prisma.$queryRawUnsafe(countQuery, ...params) as Promise<Array<{ count: bigint }>>,
      ]);
      listingsData = data.map((l) => ({ ...l, favoritesCount: 0 }));
      total = Number(countRows[0]?.count || 0);
    }

    if (search && search.trim().length > 30) {
      const searchLower = normalizeCyrillicToLower(search.trim());
      const variants = generateSearchVariants(search.trim());
      listingsData = listingsData.filter((listing) => {
        const blob = normalizeCyrillicToLower(
          `${listing.title || ''} ${listing.location || ''}`
        );
        return variants.some((v) => blob.includes(normalizeCyrillicToLower(v))) ||
          blob.includes(searchLower);
      });
    }

    // Легке сортування по ціні в JS (price — string)
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
      const originalImages =
        typeof listing.images === 'string' ? JSON.parse(listing.images) : listing.images || [];
      const optimizedImages = listing.optimizedImages
        ? typeof listing.optimizedImages === 'string'
          ? JSON.parse(listing.optimizedImages)
          : listing.optimizedImages
        : null;
      const source =
        optimizedImages && optimizedImages.length > 0 ? optimizedImages : originalImages;
      const images = resolveStoredListingImages(source);
      const thumb = images[0] || '';
      const timeFields = listingTimeFieldsForApi(listing);
      const sellerName = listing.sellerFirstName
        ? `${listing.sellerFirstName} ${listing.sellerLastName || ''}`.trim()
        : listing.sellerUsername || 'Користувач';

      return {
        id: listing.id,
        title: listing.title,
        price: listing.isFree ? 'Free' : listing.price,
        previousPrice: listing.previousPrice || null,
        priceChangedAt: listing.priceChangedAt || null,
        currency: (listing.currency as 'UAH' | 'EUR' | 'USD' | undefined) || undefined,
        image: thumb,
        images: thumb ? [thumb] : [],
        seller: {
          name: sellerName,
          avatar: listing.sellerAvatar || '👤',
          phone: '',
          telegramId: listing.sellerTelegramId?.toString() || '',
          username: listing.sellerUsername || null,
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

    const payload = { listings: formatted, total, limit, offset };
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
