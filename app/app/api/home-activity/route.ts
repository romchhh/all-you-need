import { NextResponse } from 'next/server';
import { prisma, executeWithRetry } from '@/lib/prisma';
import { toSQLiteDate } from '@/utils/dateHelpers';
import {
  isKyivEveningOrNight,
  kyivListingsWindowKey,
  kyivYmd,
  startOfKyivListingsReportingWindow,
} from '@/utils/kyivListingsDayWindow';

const DISPLAY_ONLINE_MIN = 30;
const DISPLAY_ONLINE_MAX = 60;
const DISPLAY_ONLINE_NIGHT_MIN = 10;
const DISPLAY_ONLINE_NIGHT_MAX = 15;

function displayOnlineSynced(now: Date): number {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hour: '2-digit', hour12: false }).format(now),
    10
  );
  const minute = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', minute: '2-digit' }).format(now),
    10
  );
  const ymd = kyivYmd(now).replace(/\D/g, '');
  const slot = Math.floor(now.getTime() / (4 * 60 * 1000));
  let x = slot * 0x9e3779b1 + hour * 0x85ebca6b + minute * 17 + parseInt(ymd.slice(-6), 10);
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  if (isKyivEveningOrNight(now)) {
    const span = DISPLAY_ONLINE_NIGHT_MAX - DISPLAY_ONLINE_NIGHT_MIN + 1;
    return DISPLAY_ONLINE_NIGHT_MIN + (Math.abs(x | 0) % span);
  }
  const span = DISPLAY_ONLINE_MAX - DISPLAY_ONLINE_MIN + 1;
  return DISPLAY_ONLINE_MIN + (Math.abs(x | 0) % span);
}

const NEW_LISTINGS_TODAY_SQL = `
  status = 'active'
  AND datetime(COALESCE(publishedAt, createdAt)) >= datetime(?)
  AND datetime(COALESCE(publishedAt, createdAt)) <= datetime(?)
`;

// Публічна статистика для головної / базару (без аутентифікації)
export async function GET() {
  try {
    const now = new Date();
    const dayStart = startOfKyivListingsReportingWindow(now);
    const dayStartStr = toSQLiteDate(dayStart);
    const nowStr = toSQLiteDate(now);
    const windowKey = kyivListingsWindowKey(now);

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
          `SELECT
             CASE
               WHEN location IS NULL OR TRIM(location) = '' THEN ''
               ELSE TRIM(SUBSTR(location || ',', 1, INSTR(location || ',', ',') - 1))
             END AS city,
             COUNT(*) AS count
           FROM Listing
           WHERE ${NEW_LISTINGS_TODAY_SQL}
           GROUP BY CASE
             WHEN location IS NULL OR TRIM(location) = '' THEN ''
             ELSE TRIM(SUBSTR(location || ',', 1, INSTR(location || ',', ',') - 1))
           END
           ORDER BY count DESC, city ASC`,
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
          `SELECT category, COUNT(*) AS count
           FROM Listing
           WHERE ${NEW_LISTINGS_TODAY_SQL}
             AND category IS NOT NULL AND TRIM(category) != ''
           GROUP BY category
           ORDER BY count DESC, category ASC
           LIMIT 8`,
          dayStartStr,
          nowStr
        ) as Promise<Array<{ category: string; count: bigint | number }>>
    );

    const newListingsByCategory = categoryRows.map((row) => ({
      category: (row.category || '').trim(),
      count: Number(row.count ?? 0),
    }));

    const online = displayOnlineSynced(now);

    return NextResponse.json({
      online,
      newListingsToday,
      newListingsByCity,
      newListingsByCategory,
      windowKey,
    });
  } catch (error) {
    console.error('[home-activity]', error);
    return NextResponse.json(
      { online: 0, newListingsToday: 0, newListingsByCity: [], newListingsByCategory: [], windowKey: '', error: 'unavailable' },
      { status: 503 }
    );
  }
}
