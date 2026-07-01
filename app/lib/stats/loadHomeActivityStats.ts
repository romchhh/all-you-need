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

export type HomeActivityStatsPayload = {
  newListingsToday: number;
  newListingsByCity: Array<{ city: string; count: number }>;
  newListingsByCategory: Array<{ category: string; count: number }>;
  windowKey: string;
};

const CITY_EXPR = `
  CASE
    WHEN location IS NULL OR TRIM(location) = '' THEN ''
    ELSE TRIM(SUBSTR(location, 1, INSTR(location || ',', ',') - 1))
  END
`;

const CITY_LISTINGS_SQL = `
  SELECT
    ${CITY_EXPR} AS city,
    COUNT(*) AS count
  FROM Listing
  WHERE ${NEW_LISTINGS_IN_KYIV_WINDOW_SQL}
  GROUP BY ${CITY_EXPR}
  HAVING COUNT(*) > 0
  ORDER BY count DESC, city ASC
  LIMIT 10
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
        ) as Promise<Array<{ city: string; count: bigint | number }>>
    ).catch((err) => {
      console.error('[home-activity] city breakdown failed:', err);
      return [] as Array<{ city: string; count: bigint | number }>;
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
    newListingsByCity: cityRows.map((row) => ({
      city: (row.city || '').trim(),
      count: Number(row.count ?? 0),
    })),
    newListingsByCategory: categoryRows.map((row) => ({
      category: (row.category || '').trim(),
      count: Number(row.count ?? 0),
    })),
  };
}

/** Next.js Data Cache — переживає cold start (5 хв). */
const getCachedStatsForWindow = unstable_cache(
  async (_windowKey: string) => {
    const now = new Date();
    const dayStart = startOfKyivListingsReportingWindow(now);
    const dayStartStr = toSQLiteDate(dayStart);
    const nowStr = toSQLiteDate(now);
    return queryHomeActivityStats(dayStartStr, nowStr);
  },
  ['home-activity-stats'],
  { revalidate: 300, tags: ['home-activity'] }
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
