import { unstable_cache } from 'next/cache';
import { prisma, executeWithRetry } from '@/lib/prisma';
import { toSQLiteDate } from '@/utils/dateHelpers';
import {
  kyivListingsWindowKey,
  startOfKyivListingsReportingWindow,
} from '@/utils/kyivListingsDayWindow';
import {
  getHomeActivityServerCache,
  setHomeActivityServerCache,
} from '@/lib/stats/homeActivityCache';
import { ensureListingStatsColumns } from '@/lib/stats/ensureListingStatsColumns';
import {
  LISTING_EFFECTIVE_CITY_SQL,
  newListingsInKyivWindowSql,
} from '@/lib/stats/homeActivitySql';
import { listingCityKeyFromLocation } from '@/lib/city/cityNormalization';

export type HomeActivityStatsPayload = {
  newListingsToday: number;
  newListingsByCity: Array<{ city: string; count: number }>;
  newListingsByCategory: Array<{ category: string; count: number }>;
  windowKey: string;
};

const FALLBACK_CITY_LABEL = 'Germany';

function buildCityListingsSql(): string {
  const windowSql = newListingsInKyivWindowSql('l');
  return `
  SELECT ${LISTING_EFFECTIVE_CITY_SQL} AS location, COUNT(*) AS count
  FROM Listing l
  LEFT JOIN parsed_items pi ON pi.marketplace_listing_id = l.id
  WHERE ${windowSql}
  GROUP BY ${LISTING_EFFECTIVE_CITY_SQL}
  HAVING COUNT(*) > 0
  ORDER BY 2 DESC
  LIMIT 80
`;
}

function buildCategoryListingsSql(): string {
  const windowSql = newListingsInKyivWindowSql('l');
  return `
  SELECT l.category, COUNT(*) AS count
  FROM Listing l
  WHERE ${windowSql}
    AND l.category IS NOT NULL AND TRIM(l.category) != ''
  GROUP BY l.category
  HAVING COUNT(*) > 0
  ORDER BY 2 DESC
  LIMIT 8
`;
}

function mergeCityRows(
  rows: Array<{ location: string; count: bigint | number }>
): Array<{ city: string; count: number }> {
  const merged = new Map<string, number>();
  for (const row of rows) {
    const raw = (row.location || '').trim();
    const cityKey = listingCityKeyFromLocation(raw);
    const label = cityKey || raw || FALLBACK_CITY_LABEL;
    merged.set(label, (merged.get(label) || 0) + Number(row.count ?? 0));
  }
  return [...merged.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city))
    .slice(0, 25);
}

async function queryHomeActivityStats(
  dayStartStr: string,
  nowStr: string
): Promise<Omit<HomeActivityStatsPayload, 'windowKey'>> {
  await ensureListingStatsColumns();

  const windowSql = newListingsInKyivWindowSql('l');
  const countSql = `SELECT COUNT(*) AS count FROM Listing l WHERE ${windowSql}`;
  const citySql = buildCityListingsSql();
  const categorySql = buildCategoryListingsSql();

  const [countRows, cityRows, categoryRows] = await Promise.all([
    executeWithRetry(
      () =>
        prisma.$queryRawUnsafe(countSql, dayStartStr, nowStr) as Promise<
          Array<{ count: bigint | number }>
        >
    ),
    executeWithRetry(
      () =>
        prisma.$queryRawUnsafe(citySql, dayStartStr, nowStr) as Promise<
          Array<{ location: string; count: bigint | number }>
        >
    ).catch(async (err) => {
      console.error('[home-activity] city breakdown failed, fallback without join:', err);
      const fallbackSql = `
        SELECT COALESCE(NULLIF(TRIM(l.location), ''), '${FALLBACK_CITY_LABEL}') AS location,
               COUNT(*) AS count
        FROM Listing l
        WHERE ${windowSql}
        GROUP BY COALESCE(NULLIF(TRIM(l.location), ''), '${FALLBACK_CITY_LABEL}')
        ORDER BY 2 DESC
        LIMIT 80
      `;
      return prisma.$queryRawUnsafe(fallbackSql, dayStartStr, nowStr) as Promise<
        Array<{ location: string; count: bigint | number }>
      >;
    }),
    executeWithRetry(
      () =>
        prisma.$queryRawUnsafe(categorySql, dayStartStr, nowStr) as Promise<
          Array<{ category: string; count: bigint | number }>
        >
    ).catch((err) => {
      console.error('[home-activity] category breakdown failed:', err);
      return [] as Array<{ category: string; count: bigint | number }>;
    }),
  ]);

  const newListingsToday = Number(countRows[0]?.count ?? 0);
  const newListingsByCity = mergeCityRows(cityRows);

  // Якщо загальний лічильник > 0, а міст немає — показуємо хоча б один bucket
  if (newListingsToday > 0 && newListingsByCity.length === 0) {
    newListingsByCity.push({ city: FALLBACK_CITY_LABEL, count: newListingsToday });
  }

  return {
    newListingsToday,
    newListingsByCity,
    newListingsByCategory: categoryRows.map((row) => ({
      category: (row.category || '').trim(),
      count: Number(row.count ?? 0),
    })),
  };
}

/** Next.js Data Cache — ключ включає windowKey. */
async function getCachedStatsForWindow(windowKey: string, now: Date) {
  return unstable_cache(
    async () => {
      const dayStart = startOfKyivListingsReportingWindow(now);
      return queryHomeActivityStats(toSQLiteDate(dayStart), toSQLiteDate(now));
    },
    ['home-activity-stats-v3', windowKey],
    { revalidate: 60, tags: ['home-activity'] }
  )();
}

export async function loadHomeActivityStats(
  now: Date = new Date()
): Promise<HomeActivityStatsPayload> {
  const windowKey = kyivListingsWindowKey(now);

  const mem = getHomeActivityServerCache(windowKey);
  if (
    mem &&
    typeof mem.newListingsToday === 'number' &&
    Array.isArray(mem.newListingsByCity) &&
    Array.isArray(mem.newListingsByCategory)
  ) {
    const cities = mem.newListingsByCity as HomeActivityStatsPayload['newListingsByCity'];
    const today = mem.newListingsToday as number;
    return {
      newListingsToday: today,
      newListingsByCity:
        today > 0 && cities.length === 0
          ? [{ city: FALLBACK_CITY_LABEL, count: today }]
          : cities,
      newListingsByCategory: mem.newListingsByCategory as HomeActivityStatsPayload['newListingsByCategory'],
      windowKey,
    };
  }

  const stats = await getCachedStatsForWindow(windowKey, now);
  const payload: HomeActivityStatsPayload = { ...stats, windowKey };
  setHomeActivityServerCache(windowKey, payload);
  return payload;
}
