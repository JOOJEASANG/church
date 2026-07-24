/*
 * 레거시 FCM 등록 호환용 서비스워커입니다.
 * 현재 앱은 /sw.js 등록을 getToken()에 직접 전달하므로 이 파일은 fallback으로만 사용됩니다.
 */
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
  if (payload.notification) return;
  self.registration.showNotification(payload.data?.title || '천안남산교회', {
    body: payload.data?.body || '새 소식이 있습니다.',
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    data: { url: payload.data?.url || '/' },
    tag: payload.data?.tag || 'church-notification'
  });
});

function safeUrl(value) {
  try {
    const url = new URL(value || '/', self.location.origin);
    return url.origin === self.location.origin ? url.href : new URL('/', self.location.origin).href;
  } catch {
    return new URL('/', self.location.origin).href;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = safeUrl(event.notification.data?.url);
  event.waitUntil(clients.openWindow(targetUrl));
});
