// 천안남산교회 PWA — Service Worker
// 전략: HTML/JS/CSS는 network-first (항상 최신 코드 보장), 정적 자산은 cache-first
const CACHE_VERSION = 'namsan-v88';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon.svg'
];

const OFFLINE_HTML = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>오프라인 — 천안남산교회</title><style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fafaf7;color:#15171a}.box{text-align:center;padding:40px 24px}.ico{font-size:48px;margin-bottom:16px}h1{font-size:20px;font-weight:800;margin:0 0 8px}p{color:#767a83;font-size:14px;margin:0 0 20px}button{background:#73926d;color:white;border:0;border-radius:999px;padding:12px 24px;font-size:14px;font-weight:700;cursor:pointer}</style></head><body><div class="box"><div class="ico">📶</div><h1>인터넷 연결이 필요해요</h1><p>네트워크 연결을 확인한 후 다시 시도해주세요</p><button onclick="location.reload()">다시 시도</button></div></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isHtmlOrScript(url) {
  return url.pathname.endsWith('.html')
      || url.pathname.endsWith('.js')
      || url.pathname.endsWith('.css')
      || url.pathname === '/'
      || url.pathname.startsWith('/admin');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // HTML/JS/CSS: network-first (실시간 코드 업데이트 보장)
  if (isHtmlOrScript(url)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          // 캐시도 없으면 오프라인 안내 페이지 반환
          return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        })
    );
    return;
  }

  // 이미지·아이콘 등 정적 자산: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        return res;
      });
    })
  );
});
