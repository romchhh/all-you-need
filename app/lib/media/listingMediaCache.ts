import { buildListingImageUrl } from '@/lib/listings/imageUrl';
import {
  LISTING_MEDIA_CACHE_CONTROL,
  LISTING_MEDIA_URL_PATTERNS,
} from '@/lib/media/listingMediaConstants';

export { LISTING_MEDIA_CACHE_CONTROL, LISTING_MEDIA_URL_PATTERNS };

export function isListingMediaUrl(pathname: string): boolean {
  return LISTING_MEDIA_URL_PATTERNS.some((p) => pathname.includes(p));
}

const prefetchedUrls = new Set<string>();
const loadedUrls = new Set<string>();

export function markListingImageLoaded(url: string): void {
  if (url) loadedUrls.add(url);
}

export function isListingImageLoaded(url: string): boolean {
  return Boolean(url && loadedUrls.has(url));
}

/** Прогрів HTTP/SW-кешу без дублювання запитів у сесії. */
export function prefetchListingImageUrls(urls: string[], limit = 32): void {
  if (typeof window === 'undefined') return;

  const unique = [...new Set(urls.filter(Boolean))].slice(0, limit);
  const run = () => {
    for (const url of unique) {
      if (prefetchedUrls.has(url)) continue;
      prefetchedUrls.add(url);
      const img = new window.Image();
      img.decoding = 'async';
      img.src = url;
    }
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 120);
  }
}

export function collectListingImageUrls(
  listings: Array<{ image?: string; images?: string[] }>,
  limit = 32
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const listing of listings) {
    if (urls.length >= limit) break;
    const url = buildListingImageUrl(listing.image || listing.images?.[0]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export function prefetchListingsImages(
  listings: Array<{ image?: string; images?: string[] }>,
  limit = 32
): void {
  prefetchListingImageUrls(collectListingImageUrls(listings, limit), limit);
}
