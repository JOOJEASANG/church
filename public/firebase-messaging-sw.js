/* Firebase Cloud Messaging - 백그라운드 메시지 핸들러
 * 이 파일은 반드시 루트(/)에 있어야 FCM이 자동 탐색합니다.
 */

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD3a8RXkKaGiq4mFHCUkArLRecifU_-uFQ",
  authDomain: "church-399cb.firebaseapp.com",
  databaseURL: "https://church-399cb-default-rtdb.firebaseio.com",
  projectId: "church-399cb",
  storageBucket: "church-399cb.firebasestorage.app",
  messagingSenderId: "285920062728",
  appId: "1:285920062728:web:534fd5cd1824c3658f90bd",
  measurementId: "G-4G2T868KSX"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || '천안남산교회';
  const options = {
    body: payload.notification?.body || '',
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    tag: payload.data?.tag || 'default',
    data: payload.data || {}
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.navigate(url); return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
