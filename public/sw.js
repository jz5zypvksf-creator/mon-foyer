const CACHE_PREFIX = 'mon-foyer-';
const CACHE_NAME = CACHE_PREFIX + 'v33-offline-shell';
const CORE_ASSETS = ['/', '/index.html', '/manifest.json', '/icon.svg'];

function sameOriginPath(value) {
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

function assetPathsFromHtml(html) {
  const paths = new Set();
  const pattern = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    const path = sameOriginPath(match[1]);
    if (path && !path.startsWith('/manifest')) paths.add(path);
  }
  return [...paths];
}

async function fetchAndCacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const indexResponse = await fetch('/index.html', { cache: 'reload' });
  if (!indexResponse.ok) throw new Error('Impossible de préparer le mode hors connexion.');

  const html = await indexResponse.clone().text();
  await Promise.all([
    cache.put('/index.html', indexResponse.clone()),
    cache.put('/', indexResponse.clone()),
    ...CORE_ASSETS.slice(2).map(async (path) => {
      const response = await fetch(path, { cache: 'reload' });
      if (response.ok) await cache.put(path, response);
    }),
    ...assetPathsFromHtml(html).map(async (path) => {
      const response = await fetch(path, { cache: 'reload' });
      if (response.ok) await cache.put(path, response);
    }),
  ]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(fetchAndCacheAppShell());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put('/index.html', response.clone());
            await cache.put('/', response.clone());
          }
          return response;
        })
        .catch(async () => (
          await caches.match('/index.html')
          || await caches.match('/')
          || Response.error()
        )),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      });
    }),
  );
});
