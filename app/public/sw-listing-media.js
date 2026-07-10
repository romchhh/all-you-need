/**
 * Кеш медіа оголошень для всіх користувачів (cache-first + stale-while-revalidate).
 * Працює разом із Cache-Control на /api/images та /api/parsed-images.
 */
const CACHE_NAME = 'listing-media-v3';
const MAX_ENTRIES = 800;

const MEDIA_PATH_RE =
  /^\/(api\/images\/|api\/parsed-images\/|listings\/|avatars\/|images\/)/;

function shouldCache(request) {
  if (request.method !== 'GET') return false;
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return false;
    return MEDIA_PATH_RE.test(url.pathname);
  } catch {
    return false;
  }
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  const excess = keys.length - MAX_ENTRIES;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!shouldCache(request)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);

      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
            void cache.put(request, response.clone()).then(() => trimCache(cache));
          }
          return response;
        })
        .catch((err) => {
          if (cached) return cached;
          throw err;
        });

      // Cache-first: миттєво з кешу, у фоні оновлюємо (SWR)
      if (cached) {
        void networkFetch;
        return cached;
      }
      return networkFetch;
    })
  );
});
