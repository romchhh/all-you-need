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

/** Початок «дня» для статистики нових оголошень: 06:00 Europe/Kyiv до наступних 06:00. */
const LISTINGS_DAY_START_HOUR_KYIV = 6;

/** UTC-момент «HH:MM» у Europe/Kyiv для календарної дати ymd (YYYY-MM-DD). */
function utcAtKyivYmdHourMinute(ymd: string, hour: number, minute: number): Date {
  const [yStr, mStr, dStr] = ymd.split('-');
  const y = Number(yStr);
  const mo = Number(mStr);
  const d = Number(dStr);
  const center = Date.UTC(y, mo - 1, d, 10, 0, 0);
  const from = center - 48 * 3600000;
  const to = center + 48 * 3600000;
  for (let t = from; t <= to; t += 60 * 1000) {
    const dt = new Date(t);
    if (kyivYmd(dt) !== ymd) continue;
    const h = parseInt(
      new Intl.DateTimeFormat('en-GB', { timeZone: KYIV_TZ, hour: '2-digit', hour12: false }).format(dt),
      10
    );
    const mi = parseInt(
      new Intl.DateTimeFormat('en-GB', { timeZone: KYIV_TZ, minute: '2-digit' }).format(dt),
      10
    );
    if (h === hour && mi === minute) return dt;
  }
  throw new Error(`[home-activity] Could not resolve Kyiv instant for ${ymd} ${hour}:${minute}`);
}

/**
 * Початок поточного «добового» вікна для нових оголошень: о 06:00 Europe/Kyiv.
 * До 06:00 поточної календарної доби в Києві вікно починається з учорашніх 06:00.
 */
function startOfKyivListingsReportingWindow(ref: Date): Date {
  const hourKyiv = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: KYIV_TZ, hour: '2-digit', hour12: false }).format(ref),
    10
  );
  let anchorYmd = kyivYmd(ref);
  if (hourKyiv < LISTINGS_DAY_START_HOUR_KYIV) {
    const midnightTodayKyiv = startOfKyivDay(ref);
    anchorYmd = kyivYmd(new Date(midnightTodayKyiv.getTime() - 1));
  }
  return utcAtKyivYmdHourMinute(anchorYmd, LISTINGS_DAY_START_HOUR_KYIV, 0);
}

const DISPLAY_ONLINE_MIN = 30;
const DISPLAY_ONLINE_MAX = 60;
/** Вечір і ніч за Києвом — менший діапазон, щоб виглядало природніше. */
const DISPLAY_ONLINE_NIGHT_MIN = 10;
const DISPLAY_ONLINE_NIGHT_MAX = 15;

/** 20:00–06:59 Europe/Kyiv — «вечір ближче до ночі» + ніч. */
function isKyivEveningOrNight(now: Date): boolean {
  const hourKyiv = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: KYIV_TZ, hour: '2-digit', hour12: false }).format(now),
    10
  );
  return hourKyiv >= 20 || hourKyiv < 7;
}

/**
 * Показ «онлайн»: денний діапазон 30–60, вечір/ніч 10–15; змінюється з часом (4-хв слот).
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
  if (isKyivEveningOrNight(now)) {
    const span = DISPLAY_ONLINE_NIGHT_MAX - DISPLAY_ONLINE_NIGHT_MIN + 1;
    return DISPLAY_ONLINE_NIGHT_MIN + (Math.abs(x | 0) % span);
  }
  const span = DISPLAY_ONLINE_MAX - DISPLAY_ONLINE_MIN + 1;
  return DISPLAY_ONLINE_MIN + (Math.abs(x | 0) % span);
}

// Публічна статистика для головної / базару (без аутентифікації)
export async function GET() {
  try {
    const now = new Date();
    const dayStart = startOfKyivListingsReportingWindow(now);

    /** Лише активні оголошення (як у каталозі), створені з 06:00 до «зараз» у поточному 6–6 вікні. */
    const newListingsToday = await executeWithRetry(() =>
      prisma.listing.count({
        where: {
          status: 'active',
          createdAt: { gte: dayStart, lte: now },
        },
      })
    );

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
