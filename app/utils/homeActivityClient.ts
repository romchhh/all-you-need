import { kyivListingsWindowKey } from '@/utils/kyivListingsDayWindow';

export type HomeActivityData = {
  online: number;
  newListingsToday: number;
  newListingsByCity: Array<{ city: string; count: number }>;
  newListingsByCategory: Array<{ category: string; count: number }>;
  windowKey: string;
};

type CacheEnvelope = {
  data: HomeActivityData;
  fetchedAt: number;
};

const STORAGE_KEY = 'tradeground.homeActivity.v1';
/** Показуємо кеш одразу; фонове оновлення — не частіше ніж раз на 90 сек (онлайн частіше змінюється). */
export const HOME_ACTIVITY_CLIENT_TTL_MS = 90 * 1000;
/** Якщо API недоступний — можна показувати застарілі дані до 15 хв. */
const STALE_FALLBACK_MS = 15 * 60 * 1000;

let memoryCache: CacheEnvelope | null = null;
let inflight: Promise<HomeActivityData | null> | null = null;

function isValidPayload(data: unknown): data is HomeActivityData {
  if (!data || typeof data !== 'object') return false;
  const row = data as Record<string, unknown>;
  return typeof row.online === 'number' && typeof row.newListingsToday === 'number';
}

function normalizePayload(data: HomeActivityData): HomeActivityData {
  return {
    online: data.online,
    newListingsToday: data.newListingsToday,
    windowKey: data.windowKey || '',
    newListingsByCity: Array.isArray(data.newListingsByCity)
      ? data.newListingsByCity.filter(
          (item) =>
            item &&
            typeof item.city === 'string' &&
            typeof item.count === 'number'
        )
      : [],
    newListingsByCategory: Array.isArray(data.newListingsByCategory)
      ? data.newListingsByCategory.filter(
          (item) =>
            item &&
            typeof item.category === 'string' &&
            typeof item.count === 'number'
        )
      : [],
  };
}

function readStorage(): CacheEnvelope | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (!parsed?.data || typeof parsed.fetchedAt !== 'number') return null;
    if (!isValidPayload(parsed.data)) return null;
    return { data: normalizePayload(parsed.data), fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

function writeStorage(envelope: CacheEnvelope): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    /* quota / private mode */
  }
}

function currentWindowKey(): string {
  return kyivListingsWindowKey(new Date());
}

function isFresh(envelope: CacheEnvelope, windowKey: string): boolean {
  if (envelope.data.windowKey !== windowKey) return false;
  return Date.now() - envelope.fetchedAt < HOME_ACTIVITY_CLIENT_TTL_MS;
}

function isUsable(envelope: CacheEnvelope, windowKey: string): boolean {
  if (envelope.data.windowKey !== windowKey) return false;
  return Date.now() - envelope.fetchedAt < STALE_FALLBACK_MS;
}

/** Синхронно: кеш для миттєвого рендеру (скидається о 06:00 Kyiv через windowKey). */
export function readHomeActivityCache(): HomeActivityData | null {
  const windowKey = currentWindowKey();
  const fromMemory = memoryCache;
  if (fromMemory && isUsable(fromMemory, windowKey)) {
    return fromMemory.data;
  }
  const fromStorage = readStorage();
  if (fromStorage && isUsable(fromStorage, windowKey)) {
    memoryCache = fromStorage;
    return fromStorage.data;
  }
  return null;
}

async function requestHomeActivity(): Promise<HomeActivityData | null> {
  try {
    const res = await fetch('/api/home-activity', { cache: 'default' });
    if (!res.ok) return null;
    const data = (await res.json()) as HomeActivityData;
    if (!isValidPayload(data)) return null;
    const normalized = normalizePayload(data);
    const envelope: CacheEnvelope = { data: normalized, fetchedAt: Date.now() };
    memoryCache = envelope;
    writeStorage(envelope);
    return normalized;
  } catch {
    return null;
  }
}

/**
 * Спільний запит для HomeActivityStats + HomePlatformTicker.
 * Показує кеш одразу; оновлює у фоні лише якщо TTL минув або force.
 */
export async function fetchHomeActivity(options?: {
  force?: boolean;
}): Promise<HomeActivityData | null> {
  const windowKey = currentWindowKey();
  const cached = memoryCache ?? readStorage();

  if (cached && isUsable(cached, windowKey) && !options?.force && isFresh(cached, windowKey)) {
    memoryCache = cached;
    return cached.data;
  }

  if (inflight) {
    return inflight;
  }

  inflight = requestHomeActivity().finally(() => {
    inflight = null;
  });

  const fresh = await inflight;
  if (fresh) return fresh;

  if (cached && isUsable(cached, windowKey)) {
    return cached.data;
  }

  return null;
}
