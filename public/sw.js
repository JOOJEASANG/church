const CACHE_NAME = 'namsan-church-v91';
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
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return (await caches.match('/offline.html')) || new Response('오프라인 상태입니다.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (canCache(response)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/__/') || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate' || ['script', 'style', 'worker'].includes(request.destination)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (['image', 'font'].includes(request.destination)) {
    event.respondWith(cacheFirst(request));
  }
});

// FCM은 동일한 서비스워커 등록을 사용해 PWA 캐시와 충돌하지 않도록 합니다.
try {
  importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-messaging-compat.js');

  firebase.initializeApp({
    apiKey: 'AIzaSyD3a8RXkKaGiq4mFHCUkArLRecifU_-uFQ',
    authDomain: 'church-399cb.firebaseapp.com',
    projectId: 'church-399cb',
    storageBucket: 'church-399cb.firebasestorage.app',
    messagingSenderId: '285920062728',
    appId: '1:285920062728:web:534fd5cd1824c3658f90bd'
  });

  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    // notification payload는 FCM이 자동 표시합니다. data-only 메시지만 직접 표시합니다.
    if (payload.notification) return;
    const title = payload.data?.title || '천안남산교회';
    const body = payload.data?.body || '새 소식이 있습니다.';
    const url = payload.data?.url || '/';
    self.registration.showNotification(title, {
      body,
      icon: APP_ICON,
      badge: APP_ICON,
      data: { url },
      tag: payload.data?.tag || 'church-notification'
    });
  });
} catch (error) {
  console.warn('[sw] FCM 초기화 실패:', error?.message || error);
}

function safeNotificationUrl(value) {
  try {
    const url = new URL(value || '/', self.location.origin);
    return url.origin === self.location.origin ? url.href : new URL('/', self.location.origin).href;
  } catch {
    return new URL('/', self.location.origin).href;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = safeNotificationUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return clients.openWindow(targetUrl);
  })());
});
