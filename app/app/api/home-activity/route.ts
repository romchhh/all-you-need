import { NextResponse } from 'next/server';
import { prisma, executeWithRetry } from '@/lib/prisma';

const KYIV_TZ = 'Europe/Kyiv';

/** YYYY-MM-DD у календарі Europe/Kyiv для моменту ref. */
function kyivYmd(ref: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KYIV_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ref);
}

/** UTC-момент початку доби 00:00 у Europe/Kyiv для того ж «київського дня», що й ref. */
function startOfKyivDay(ref: Date): Date {
  const ymd = kyivYmd(ref);
  const from = ref.getTime() - 30 * 3600000;
  const to = ref.getTime() + 3600000;
  for (let t = from; t <= to; t += 60 * 1000) {
    const d = new Date(t);
    if (kyivYmd(d) !== ymd) continue;
    const h = parseInt(
      new Intl.DateTimeFormat('en-GB', { timeZone: KYIV_TZ, hour: '2-digit', hour12: false }).format(d),
      10
    );
    const mi = parseInt(
      new Intl.DateTimeFormat('en-GB', { timeZone: KYIV_TZ, minute: '2-digit' }).format(d),
      10
    );
    if (h === 0 && mi === 0) return d;
  }
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DISPLAY_ONLINE_MIN = 30;
const DISPLAY_ONLINE_MAX = 60;

/**
 * Показ «онлайн» 30–60: однаковий для усіх, змінюється з часом (київська година + 4-хв слот).
 * Детерміновано, без реального трекінгу сесій у цьому полі.
 */
function displayOnlineSynced(now: Date): number {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: KYIV_TZ, hour: '2-digit', hour12: false }).format(now),
    10
  );
  const minute = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: KYIV_TZ, minute: '2-digit' }).format(now),
    10
  );
  const ymd = kyivYmd(now).replace(/\D/g, '');
  const slot = Math.floor(now.getTime() / (4 * 60 * 1000));
  let x = slot * 0x9e3779b1 + hour * 0x85ebca6b + minute * 17 + parseInt(ymd.slice(-6), 10);
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  const span = DISPLAY_ONLINE_MAX - DISPLAY_ONLINE_MIN + 1;
  return DISPLAY_ONLINE_MIN + (Math.abs(x | 0) % span);
}

// Публічна статистика для головної / базару (без аутентифікації)
export async function GET() {
  try {
    const now = new Date();
    const dayStart = startOfKyivDay(now);
    const dayStartIso = dayStart.toISOString();

    const newListingsTodayResult = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM Listing WHERE createdAt >= ?`,
        dayStartIso
      ) as Promise<Array<{ count: bigint }>>
    );
    const newListingsToday = Number(newListingsTodayResult[0]?.count || 0);

    const online = displayOnlineSynced(now);

    return NextResponse.json({
      online,
      newListingsToday,
    });
  } catch (error) {
    console.error('[home-activity]', error);
    return NextResponse.json(
      { online: 0, newListingsToday: 0, error: 'unavailable' },
      { status: 503 }
    );
  }
}
