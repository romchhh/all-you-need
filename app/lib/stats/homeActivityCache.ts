let serverCache: {
  windowKey: string;
  payload: Record<string, unknown>;
  expiresAt: number;
} | null = null;

export const HOME_ACTIVITY_SERVER_CACHE_TTL_MS = 120_000;

export function getHomeActivityServerCache(windowKey: string): Record<string, unknown> | null {
  if (
    serverCache &&
    serverCache.windowKey === windowKey &&
    Date.now() < serverCache.expiresAt
  ) {
    return serverCache.payload;
  }
  return null;
}

export function setHomeActivityServerCache(windowKey: string, payload: Record<string, unknown>) {
  serverCache = {
    windowKey,
    payload,
    expiresAt: Date.now() + HOME_ACTIVITY_SERVER_CACHE_TTL_MS,
  };
}

export function invalidateHomeActivityCache() {
  serverCache = null;
}
