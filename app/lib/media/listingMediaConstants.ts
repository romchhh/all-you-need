/** HTTP-кеш для незмінних файлів оголошень (CDN + браузер). 1 рік + довгий SWR. */
export const LISTING_MEDIA_CACHE_CONTROL =
  'public, max-age=31536000, immutable, stale-while-revalidate=2592000';

export const LISTING_MEDIA_URL_PATTERNS = [
  '/api/images/',
  '/api/parsed-images/',
  '/listings/',
  '/avatars/',
  '/images/',
] as const;
