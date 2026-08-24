const CACHE_PREFIX = 'mon-foyer-';
const CACHE_NAME = CACHE_PREFIX + 'v35-reminders';
const PRECACHE_ASSETS = ['/']; // __PRECACHE_ASSETS__

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CHECK_OFFLINE_READY') return;
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.keys())
      .then((requests) => {
        const reply = event.ports?.[0] || event.source;
        reply?.postMessage({
          type: 'OFFLINE_READY',
          ready: PRECACHE_ASSETS.every((path) => requests.some((request) => {
            const url = new URL(request.url);
            return url.pathname + url.search === path;
          })),
          cachedAssets: requests.length,
        });
      }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clients) => {
        const sameOrigin = clients.find((client) => {
          try {
            return new URL(client.url).origin === self.location.origin;
          } catch {
            return false;
          }
        });
        if (sameOrigin) {
          await sameOrigin.focus();
          if ('navigate' in sameOrigin) await sameOrigin.navigate(target);
          return sameOrigin;
        }
        return self.clients.openWindow(target);
      }),
  );
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
    caches.match(request).then((cached) => (
      cached || fetch(request).then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      })
    )),
  );
});
