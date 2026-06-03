const KYIV_TZ = 'Europe/Kyiv';

/** Початок «дня» для статистики нових оголошень: 06:00 Europe/Kyiv до наступних 06:00. */
export const LISTINGS_DAY_START_HOUR_KYIV = 6;

/** YYYY-MM-DD у календарі Europe/Kyiv для моменту ref. */
export function kyivYmd(ref: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KYIV_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ref);
}

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
  throw new Error(`[kyivListingsDayWindow] Could not resolve Kyiv instant for ${ymd} ${hour}:${minute}`);
}

/**
 * Початок поточного «добового» вікна для нових оголошень: о 06:00 Europe/Kyiv.
 * До 06:00 поточної календарної доби в Києві вікно починається з учорашніх 06:00.
 */
export function startOfKyivListingsReportingWindow(ref: Date): Date {
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

/** Кінець поточного добового вікна — наступні 06:00 Europe/Kyiv. */
export function endOfKyivListingsReportingWindow(ref: Date): Date {
  const start = startOfKyivListingsReportingWindow(ref);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/** Мілісекунди до наступного скидання «сьогодні» (06:00 Kyiv). */
export function msUntilNextKyivListingsWindowBoundary(ref: Date = new Date()): number {
  return Math.max(0, endOfKyivListingsReportingWindow(ref).getTime() - ref.getTime());
}

/** Ключ вікна для клієнта: змінюється о 06:00 Kyiv → скидання «сьогодні». */
export function kyivListingsWindowKey(ref: Date): string {
  return kyivYmd(startOfKyivListingsReportingWindow(ref));
}

export function isKyivEveningOrNight(now: Date): boolean {
  const hourKyiv = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: KYIV_TZ, hour: '2-digit', hour12: false }).format(now),
    10
  );
  return hourKyiv >= 20 || hourKyiv < 7;
}
