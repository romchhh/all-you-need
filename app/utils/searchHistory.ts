const SEARCH_HISTORY_KEY = 'ayn_marketplace_search_history';
const SEARCH_HISTORY_V2_KEY = 'ayn_search_history_v2';
const MAX_HISTORY_ITEMS = 10;
const MAX_LISTINGS_PER_ENTRY = 6;

export type SearchListingPreview = {
  id: number;
  title: string;
  price: string;
  image: string;
  isFree?: boolean;
  currency?: string;
  location?: string;
};

export type SearchHistoryEntry = {
  query: string;
  listings?: SearchListingPreview[];
  ts: number;
};

function migrateFromLegacy(): SearchHistoryEntry[] {
  try {
    const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!stored) return [];
    const legacy = JSON.parse(stored) as string[];
    if (!Array.isArray(legacy)) return [];
    return legacy
      .filter((q) => typeof q === 'string' && q.trim())
      .map((query) => ({ query: query.trim(), ts: Date.now() }));
  } catch {
    return [];
  }
}

export const getSearchHistoryEntries = (): SearchHistoryEntry[] => {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(SEARCH_HISTORY_V2_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as SearchHistoryEntry[];
      if (Array.isArray(parsed)) {
        return parsed.filter((e) => e && typeof e.query === 'string' && e.query.trim());
      }
    }

    const migrated = migrateFromLegacy();
    if (migrated.length > 0) {
      localStorage.setItem(SEARCH_HISTORY_V2_KEY, JSON.stringify(migrated));
    }
    return migrated;
  } catch (error) {
    console.error('Error reading search history:', error);
    return [];
  }
};

export const getSearchHistory = (): string[] => {
  return getSearchHistoryEntries().map((e) => e.query);
};

export const getRecentSearchListings = (): SearchListingPreview[] => {
  const seen = new Set<number>();
  const result: SearchListingPreview[] = [];

  for (const entry of getSearchHistoryEntries()) {
    for (const listing of entry.listings ?? []) {
      if (!listing?.id || seen.has(listing.id)) continue;
      seen.add(listing.id);
      result.push(listing);
    }
  }

  return result.slice(0, 12);
};

export const addToSearchHistory = (
  query: string,
  listings?: SearchListingPreview[]
): void => {
  if (typeof window === 'undefined' || !query.trim()) return;

  try {
    const trimmedQuery = query.trim();
    const previews =
      listings?.slice(0, MAX_LISTINGS_PER_ENTRY).map((l) => ({
        id: l.id,
        title: l.title,
        price: l.price,
        image: l.image,
        isFree: l.isFree,
        currency: l.currency,
        location: l.location,
      })) ?? [];

    const filtered = getSearchHistoryEntries().filter(
      (item) => item.query.toLowerCase() !== trimmedQuery.toLowerCase()
    );

    const updated: SearchHistoryEntry[] = [
      {
        query: trimmedQuery,
        listings: previews.length > 0 ? previews : undefined,
        ts: Date.now(),
      },
      ...filtered,
    ].slice(0, MAX_HISTORY_ITEMS);

    localStorage.setItem(SEARCH_HISTORY_V2_KEY, JSON.stringify(updated));

    // Sync legacy key for older code paths
    localStorage.setItem(
      SEARCH_HISTORY_KEY,
      JSON.stringify(updated.map((e) => e.query))
    );
  } catch (error) {
    console.error('Error saving search history:', error);
  }
};

export const updateSearchHistoryListings = (
  query: string,
  listings: SearchListingPreview[]
): void => {
  if (typeof window === 'undefined' || !query.trim() || listings.length === 0) return;

  try {
    const trimmedQuery = query.trim();
    const previews = listings.slice(0, MAX_LISTINGS_PER_ENTRY).map((l) => ({
      id: l.id,
      title: l.title,
      price: l.price,
      image: l.image,
      isFree: l.isFree,
      currency: l.currency,
      location: l.location,
    }));

    const entries = getSearchHistoryEntries();
    const idx = entries.findIndex(
      (e) => e.query.toLowerCase() === trimmedQuery.toLowerCase()
    );

    if (idx >= 0) {
      entries[idx] = { ...entries[idx], listings: previews, ts: Date.now() };
    } else {
      entries.unshift({ query: trimmedQuery, listings: previews, ts: Date.now() });
    }

    const updated = entries.slice(0, MAX_HISTORY_ITEMS);
    localStorage.setItem(SEARCH_HISTORY_V2_KEY, JSON.stringify(updated));
    localStorage.setItem(
      SEARCH_HISTORY_KEY,
      JSON.stringify(updated.map((e) => e.query))
    );
  } catch (error) {
    console.error('Error updating search history listings:', error);
  }
};

export const clearSearchHistory = (): void => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    localStorage.removeItem(SEARCH_HISTORY_V2_KEY);
  } catch (error) {
    console.error('Error clearing search history:', error);
  }
};

export const listingToSearchPreview = (listing: {
  id: number;
  title: string;
  price: string;
  image: string;
  isFree?: boolean;
  currency?: string;
  location?: string;
}): SearchListingPreview => ({
  id: listing.id,
  title: listing.title,
  price: listing.price,
  image: listing.image,
  isFree: listing.isFree,
  currency: listing.currency,
  location: listing.location,
});
