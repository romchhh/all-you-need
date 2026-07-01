/** HTTP-кеш для незмінних файлів оголошень (CDN + браузер). */
export const LISTING_MEDIA_CACHE_CONTROL =
  'public, max-age=31536000, immutable, stale-while-revalidate=604800';

export const LISTING_MEDIA_URL_PATTERNS = [
  '/api/images/',
  '/api/parsed-images/',
  '/listings/',
  '/avatars/',
] as const;
