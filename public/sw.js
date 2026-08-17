const CACHE_NAME = 'namsan-church-v92';
const APP_ICON = '/icons/premium-install-icon.svg?v=20260726-1';
const PRECACHE_URLS = ['/offline.html', '/manifest.json', '/icons/icon.svg', APP_ICON];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function canCache(response) {
  return response && response.ok && (response.type === 'basic' || response.type === 'cors');
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (canCache(response)) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match('/offline.html');
    throw new Error('offline');
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) event.respondWith(networkFirst(request));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { notification: { body: event.data?.text() || '' } }; }
  const notification = data.notification || {};
  const payload = data.data || {};
  const title = notification.title || payload.title || '천안남산교회';
  const options = {
    body: notification.body || payload.body || '',
    icon: APP_ICON,
    badge: APP_ICON,
    data: { url: payload.url || '/' },
    tag: payload.tag || undefined
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const requested = event.notification.data?.url || '/';
    let target = '/';
    try {
      const url = new URL(requested, self.location.origin);
      if (url.origin === self.location.origin) target = `${url.pathname}${url.search}${url.hash}`;
    } catch {}
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.navigate(target).catch(() => {});
        return client.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(target);
  })());
});
