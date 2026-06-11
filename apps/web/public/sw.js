// LMS Service Worker — push notifications + offline caching

const CACHE_VERSION = 'v1';
const STATIC_CACHE  = `lms-static-${CACHE_VERSION}`;
const PAGE_CACHE    = `lms-pages-${CACHE_VERSION}`;
const OFFLINE_URL   = '/offline.html';

// ── Install: pre-cache offline fallback ───────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: prune stale caches ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k !== STATIC_CACHE && k !== PAGE_CACHE)
            .map(k  => caches.delete(k))
        )
      )
      .then(() => clients.claim())
  );
});

// ── Fetch: caching strategies ─────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Network Only: API calls must always be fresh
  if (url.pathname.startsWith('/api/')) return;

  // Cache First: _next/static assets have content-hashed filenames — immutable
  if (url.pathname.startsWith('/_next/static/') || /\.(?:png|jpg|jpeg|svg|ico|webp|gif|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(c => c.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network First + offline fallback: page navigations
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(PAGE_CACHE).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then(cached => cached ?? caches.match(OFFLINE_URL))
        )
    );
  }
});

// ── Push notifications ─────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { data = { title: 'New Notification', body: event.data?.text() ?? '' }; }

  const title   = data.title || 'New Notification';
  const options = {
    body:    data.body  || '',
    icon:    '/icon-192.png',
    badge:   '/icon-72.png',
    data:    { url: data.url || '/' },
    vibrate: [100, 50, 100],
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
