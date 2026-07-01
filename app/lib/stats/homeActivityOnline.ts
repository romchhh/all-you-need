import {
  isKyivEveningOrNight,
  kyivListingsWindowKey,
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

/** Синхронізоване «онлайн» — не кешуємо разом із SQL-агрегаціями. */
export function displayOnlineSynced(now: Date = new Date()): number {
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
