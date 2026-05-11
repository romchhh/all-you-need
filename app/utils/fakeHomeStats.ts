/**
 * Демо-статистика для головної: однакова для всіх користувачів у межах слота часу,
 * змінюється з часом; вдень вище, вночі нижче (за годиною Europe/Kyiv).
 */

const KYIV_TZ = 'Europe/Kyiv';

function fnv1a32(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function kyivDateHourMinute(now: Date): { dateKey: string; hour: number; minute: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: KYIV_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '0';

  const y = pick('year');
  const m = pick('month');
  const d = pick('day');
  const hour = parseInt(pick('hour'), 10);
  const minute = parseInt(pick('minute'), 10);
  return { dateKey: `${y}-${m}-${d}`, hour, minute };
}

/** 0 = глибока ніч, 1 = пік дня/вечора (київська година 0–23). */
function dayStrengthKyiv(hour: number): number {
  if (hour <= 4) return 0.06 + hour * 0.03;
  if (hour <= 7) return 0.18 + (hour - 4) * 0.11;
  if (hour <= 10) return 0.51 + (hour - 7) * 0.1;
  if (hour <= 12) return 0.81 + (hour - 10) * 0.06;
  if (hour <= 20) return 0.93 + Math.sin(((hour - 12) / 8) * Math.PI) * 0.07;
  if (hour <= 23) return 1 - (hour - 20) * 0.17;
  return 0.45;
}

/** Ключ 15-хв слота — усі клієнти з однаковим часом отримують однакові числа. */
export function getFakeHomeStatsSlotKey(now: Date = new Date()): string {
  const { dateKey, hour, minute } = kyivDateHourMinute(now);
  const slotMinute = Math.floor(minute / 15) * 15;
  return `${dateKey}T${String(hour).padStart(2, '0')}:${String(slotMinute).padStart(2, '0')}`;
}

export type FakeHomeStats = {
  online: number;
  listingsLastDay: number;
};

export function getFakeHomeStats(now: Date = new Date()): FakeHomeStats {
  const slot = getFakeHomeStatsSlotKey(now);
  const { hour } = kyivDateHourMinute(now);
  const s = dayStrengthKyiv(hour);

  const hOnline = fnv1a32(`ayn-home-online-v1|${slot}`);
  const hList = fnv1a32(`ayn-home-listings-v1|${slot}`);

  const onlineMin = Math.round(95 + (1 - s) * 140);
  const onlineMax = Math.round(2600 + s * 2700);
  const onlineSpan = Math.max(80, onlineMax - onlineMin);
  const online = onlineMin + (hOnline % onlineSpan);

  const listMin = Math.round(5 + (1 - s) * 28);
  const listMax = Math.round(48 + s * 310);
  const listSpan = Math.max(6, listMax - listMin);
  const listingsLastDay = listMin + (hList % listSpan);

  return { online, listingsLastDay };
}
