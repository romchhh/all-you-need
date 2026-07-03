export const BAZAAR_RETURN_LISTING_KEY = 'bazaarReturnListingId';
export const BAZAAR_RESTORE_LISTING_EVENT = 'bazaar-restore-listing';

export function persistBazaarReturnListingId(listingId: number): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(BAZAAR_RETURN_LISTING_KEY, String(listingId));
}

export function readBazaarReturnListingId(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(BAZAAR_RETURN_LISTING_KEY);
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return Number.isNaN(id) ? null : id;
}

export function dispatchBazaarRestoreListingScroll(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BAZAAR_RESTORE_LISTING_EVENT));
}
