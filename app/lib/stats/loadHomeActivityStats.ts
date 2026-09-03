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
import { NEW_LISTINGS_IN_KYIV_WINDOW_SQL } from '@/lib/stats/homeActivitySql';
import { listingCityKeyFromLocation } from '@/lib/city/cityNormalization';

export type HomeActivityStatsPayload = {
  newListingsToday: number;
  newListingsByCity: Array<{ city: string; count: number }>;
  newListingsByCategory: Array<{ category: string; count: number }>;
  windowKey: string;
};

const CITY_LISTINGS_SQL = `
  SELECT location, COUNT(*) AS count
  FROM Listing
  WHERE ${NEW_LISTINGS_IN_KYIV_WINDOW_SQL}
  GROUP BY location
  HAVING COUNT(*) > 0
  ORDER BY count DESC
  LIMIT 80
`;

const CATEGORY_LISTINGS_SQL = `
  SELECT category, COUNT(*) AS count
  FROM Listing
  WHERE ${NEW_LISTINGS_IN_KYIV_WINDOW_SQL}
    AND category IS NOT NULL AND TRIM(category) != ''
  GROUP BY category
  HAVING COUNT(*) > 0
  ORDER BY count DESC
  LIMIT 8
`;

function mergeCityRows(
  rows: Array<{ location: string; count: bigint | number }>
): Array<{ city: string; count: number }> {
  const merged = new Map<string, number>();
  for (const row of rows) {
    const raw = (row.location || '').trim();
    const cityKey = listingCityKeyFromLocation(raw);
    const label = cityKey || raw || '';
    if (!label) continue;
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
  const [countRows, cityRows, categoryRows] = await Promise.all([
    executeWithRetry(
      () =>
        prisma.$queryRawUnsafe(
          `SELECT COUNT(*) AS count FROM Listing WHERE ${NEW_LISTINGS_IN_KYIV_WINDOW_SQL}`,
          dayStartStr,
          nowStr
        ) as Promise<Array<{ count: bigint | number }>>
    ),
    executeWithRetry(
      () =>
        prisma.$queryRawUnsafe(
          CITY_LISTINGS_SQL,
          dayStartStr,
          nowStr
        ) as Promise<Array<{ location: string; count: bigint | number }>>
    ).catch((err) => {
      console.error('[home-activity] city breakdown failed:', err);
      return [] as Array<{ location: string; count: bigint | number }>;
    }),
    executeWithRetry(
      () =>
        prisma.$queryRawUnsafe(
          CATEGORY_LISTINGS_SQL,
          dayStartStr,
          nowStr
        ) as Promise<Array<{ category: string; count: bigint | number }>>
    ).catch((err) => {
      console.error('[home-activity] category breakdown failed:', err);
      return [] as Array<{ category: string; count: bigint | number }>;
    }),
  ]);

  return {
    newListingsToday: Number(countRows[0]?.count ?? 0),
    newListingsByCity: mergeCityRows(cityRows),
    newListingsByCategory: categoryRows.map((row) => ({
      category: (row.category || '').trim(),
      count: Number(row.count ?? 0),
    })),
  };
}

/** Next.js Data Cache — переживає cold start (60 с). */
const getCachedStatsForWindow = unstable_cache(
  async (_windowKey: string) => {
    const now = new Date();
    const dayStart = startOfKyivListingsReportingWindow(now);
    const dayStartStr = toSQLiteDate(dayStart);
    const nowStr = toSQLiteDate(now);
    return queryHomeActivityStats(dayStartStr, nowStr);
  },
  ['home-activity-stats-v2'],
  { revalidate: 60, tags: ['home-activity'] }
);

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
    return {
      newListingsToday: mem.newListingsToday as number,
      newListingsByCity: mem.newListingsByCity as HomeActivityStatsPayload['newListingsByCity'],
      newListingsByCategory: mem.newListingsByCategory as HomeActivityStatsPayload['newListingsByCategory'],
      windowKey,
    };
  }

  const stats = await getCachedStatsForWindow(windowKey);
  const payload: HomeActivityStatsPayload = { ...stats, windowKey };
  setHomeActivityServerCache(windowKey, payload);
  return payload;
}
