type BazaarCatalogPayload = {
  listings: unknown[];
  total: number;
  limit: number;
  offset: number;
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { data: BazaarCatalogPayload; at: number }>();

export function getBazaarCatalogServerCache(key: string): BazaarCatalogPayload | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setBazaarCatalogServerCache(key: string, data: BazaarCatalogPayload): void {
  cache.set(key, { data, at: Date.now() });
  if (cache.size > 48) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

export function buildBazaarCatalogCacheKey(params: {
  category: string | null;
  subcategory: string | null;
  isFree: boolean;
  cities: string[];
  search: string | null;
  sortBy: string;
  limit: number;
  offset: number;
}): string {
  return [
    params.category ?? '',
    params.subcategory ?? '',
    params.isFree ? '1' : '0',
    params.cities.join(','),
    params.search ?? '',
    params.sortBy,
    String(params.limit),
    String(params.offset),
  ].join('|');
}
