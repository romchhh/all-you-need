import { NextResponse } from 'next/server';
import { prisma, executeWithRetry } from '@/lib/prisma';
import { toSQLiteDate } from '@/utils/dateHelpers';
import {
  isKyivEveningOrNight,
  kyivListingsWindowKey,
  startOfKyivListingsReportingWindow,
} from '@/utils/kyivListingsDayWindow';

const DISPLAY_ONLINE_MIN = 22;
const DISPLAY_ONLINE_MAX = 58;
const DISPLAY_ONLINE_NIGHT_MIN = 7;
const DISPLAY_ONLINE_NIGHT_MAX = 18;

function mix32(x: number): number {
  let v = x | 0;
  v = Math.imul(v ^ (v >>> 16), 0x7feb352d);
  v = Math.imul(v ^ (v >>> 15), 0x846ca68b);
  return (v ^ (v >>> 16)) >>> 0;
}

function displayOnlineSynced(now: Date): number {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hour: '2-digit', hour12: false }).format(now),
    10
  );
  const minute = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', minute: '2-digit' }).format(now),
    10
  );
  const second = now.getSeconds();
  const weekdayChar = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv',
    weekday: 'narrow',
  }).format(now).charCodeAt(0);
  const ymd = kyivListingsWindowKey(now).replace(/\D/g, '');

  /** 90-секундні слоти + секунда — більше варіацій, рідше повторення числа. */
  const slot = Math.floor(now.getTime() / (90 * 1000));
  let seed =
    slot * 0x9e3779b1 +
    hour * 0x85ebca6b +
    minute * 0x27d4eb2d +
    second * 131 +
    weekdayChar * 977 +
    parseInt(ymd.slice(-6), 10) * 0x517cc1b7;
  seed = mix32(seed ^ (slot >>> 7) ^ minute);

  if (isKyivEveningOrNight(now)) {
    const span = DISPLAY_ONLINE_NIGHT_MAX - DISPLAY_ONLINE_NIGHT_MIN + 1;
    return DISPLAY_ONLINE_NIGHT_MIN + (seed % span);
  }
  const span = DISPLAY_ONLINE_MAX - DISPLAY_ONLINE_MIN + 1;
  return DISPLAY_ONLINE_MIN + (seed % span);
}

/** In-memory кеш відповіді — зменшує навантаження на БД при кожному заході на головну. */
const SERVER_CACHE_TTL_MS = 120_000;
let serverCache: {
  windowKey: string;
  payload: Record<string, unknown>;
  expiresAt: number;
} | null = null;

const NEW_LISTINGS_TODAY_SQL = `
  status = 'active'
  AND COALESCE(publishedAt, createdAt) >= ?
  AND COALESCE(publishedAt, createdAt) <= ?
`;

const CITY_LISTINGS_SQL = `
  SELECT
    CASE
      WHEN location IS NULL OR TRIM(location) = '' THEN ''
      ELSE TRIM(SUBSTR(location, 1, INSTR(location || ',', ',') - 1))
    END AS city,
    COUNT(*) AS count
  FROM Listing
  WHERE ${NEW_LISTINGS_TODAY_SQL}
  GROUP BY city
  HAVING count > 0
  ORDER BY count DESC, city ASC
  LIMIT 10
`;

const CATEGORY_LISTINGS_SQL = `
  SELECT category, COUNT(*) AS count
  FROM Listing
  WHERE ${NEW_LISTINGS_TODAY_SQL}
    AND category IS NOT NULL AND TRIM(category) != ''
  GROUP BY category
  HAVING count > 0
  ORDER BY count DESC
  LIMIT 8
`;

// Публічна статистика для головної / базару (без аутентифікації)
export async function GET() {
  try {
    const now = new Date();
    const windowKey = kyivListingsWindowKey(now);

    if (
      serverCache &&
      serverCache.windowKey === windowKey &&
      Date.now() < serverCache.expiresAt
    ) {
      return NextResponse.json(serverCache.payload, {
        headers: {
          'Cache-Control': 'public, max-age=120, stale-while-revalidate=240',
        },
      });
    }

    const dayStart = startOfKyivListingsReportingWindow(now);
    const dayStartStr = toSQLiteDate(dayStart);
    const nowStr = toSQLiteDate(now);

    const countRows = await executeWithRetry(
      () =>
        prisma.$queryRawUnsafe(
          `SELECT COUNT(*) AS count FROM Listing WHERE ${NEW_LISTINGS_TODAY_SQL}`,
          dayStartStr,
          nowStr
        ) as Promise<Array<{ count: bigint | number }>>
    );
    const newListingsToday = Number(countRows[0]?.count ?? 0);

    const cityRows = await executeWithRetry(
      () =>
        prisma.$queryRawUnsafe(
          CITY_LISTINGS_SQL,
          dayStartStr,
          nowStr
        ) as Promise<Array<{ city: string; count: bigint | number }>>
    );

    const newListingsByCity = cityRows.map((row) => ({
      city: (row.city || '').trim(),
      count: Number(row.count ?? 0),
    }));

    const categoryRows = await executeWithRetry(
      () =>
        prisma.$queryRawUnsafe(
          CATEGORY_LISTINGS_SQL,
          dayStartStr,
          nowStr
        ) as Promise<Array<{ category: string; count: bigint | number }>>
    );

    const newListingsByCategory = categoryRows.map((row) => ({
      category: (row.category || '').trim(),
      count: Number(row.count ?? 0),
    }));

    const online = displayOnlineSynced(now);

    const payload = {
      online,
      newListingsToday,
      newListingsByCity,
      newListingsByCategory,
      windowKey,
    };

    serverCache = {
      windowKey,
      payload,
      expiresAt: Date.now() + SERVER_CACHE_TTL_MS,
    };

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=240',
      },
    });
  } catch (error) {
    console.error('[home-activity]', error);
    return NextResponse.json(
      { online: 0, newListingsToday: 0, newListingsByCity: [], newListingsByCategory: [], windowKey: '', error: 'unavailable' },
      { status: 503 }
    );
  }
}
