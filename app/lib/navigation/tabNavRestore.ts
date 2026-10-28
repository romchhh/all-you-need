/** Відновлення скролу / відкритої картки після переходів нижнього меню. */

export type NavTab = 'bazaar' | 'categories' | 'favorites' | 'profile';

export function tabScrollStorageKey(tab: NavTab): string {
  return `${tab}ScrollPosition`;
}

export function tabReturnListingStorageKey(tab: NavTab): string {
  return `${tab}ReturnListingId`;
}

export function persistTabScroll(tab: NavTab, scrollY: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(tabScrollStorageKey(tab), String(Math.max(0, Math.round(scrollY))));
}

export function readTabScroll(tab: NavTab): number {
  if (typeof window === 'undefined') return 0;
  const n = parseInt(localStorage.getItem(tabScrollStorageKey(tab)) || '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function persistTabReturnListing(tab: NavTab, listingId: number): void {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(listingId) || listingId <= 0) return;
  sessionStorage.setItem(tabReturnListingStorageKey(tab), String(listingId));
}

export function peekTabReturnListing(tab: NavTab): number | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(tabReturnListingStorageKey(tab));
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Зчитати й одразу прибрати (після успішного відкриття картки). */
export function consumeTabReturnListing(tab: NavTab): number | null {
  const id = peekTabReturnListing(tab);
  if (id != null && typeof window !== 'undefined') {
    sessionStorage.removeItem(tabReturnListingStorageKey(tab));
  }
  return id;
}

export function clearTabReturnListing(tab: NavTab): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(tabReturnListingStorageKey(tab));
}

/** Зберегти відкриту картку перед виходом з табу (з URL ?listing=). */
export function persistOpenListingFromUrl(tab: NavTab): void {
  if (typeof window === 'undefined') return;
  const raw = new URLSearchParams(window.location.search).get('listing');
  if (!raw) return;
  const id = parseInt(raw, 10);
  if (Number.isFinite(id) && id > 0) {
    persistTabReturnListing(tab, id);
  }
}

export function restoreWindowScroll(scrollY: number): void {
  if (typeof window === 'undefined' || scrollY <= 0) return;
  window.scrollTo({ top: scrollY, behavior: 'auto' });
  document.documentElement.scrollTop = scrollY;
  document.body.scrollTop = scrollY;
}
