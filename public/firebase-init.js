// 천안남산교회 PWA - Firebase 공용 초기화
// 사용자 앱과 관리자 페이지에서 함께 import 합니다.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-analytics.js';

const firebaseConfig = {
  apiKey: 'AIzaSyD3a8RXkKaGiq4mFHCUkArLRecifU_-uFQ',
  authDomain: 'church-399cb.firebaseapp.com',
  databaseURL: 'https://church-399cb-default-rtdb.firebaseio.com',
  projectId: 'church-399cb',
  storageBucket: 'church-399cb.firebasestorage.app',
  messagingSenderId: '285920062728',
  appId: '1:285920062728:web:534fd5cd1824c3658f90bd',
  measurementId: 'G-4G2T868KSX'
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

isSupported()
  .then((supported) => { if (supported) getAnalytics(app); })
  .catch(() => {});

const isAdminPage = location.pathname === '/admin' || location.pathname.startsWith('/admin/');

function loadModule(path, label) {
  import(path).catch((error) => console.warn(`[${label}] 로드 실패:`, error?.message || error));
}

if (isAdminPage) {
  loadModule('/admin-google-login.js', 'admin-google-login');
  loadModule('/admin/admin-claims.js', 'admin-claims');
  loadModule('/admin/member-approval.js', 'member-approval');
  loadModule('/admin/admin-event-range.js', 'admin-event-range');
  loadModule('/admin/event-edit-icon-style.js', 'event-edit-icon-style');
} else {
  loadModule('/talent-room-board.js', 'talent-room-board');
  loadModule('/talent-category-fix.js', 'talent-category-fix');
  loadModule('/room-status-fix.js', 'room-status-fix');
  loadModule('/pc-install-button.js', 'pc-install-button');
  loadModule('/pc-brand-size-fix.js', 'pc-brand-size-fix');
  loadModule('/member-status.js', 'member-status');
  loadModule('/bible-daily-qt.js', 'bible-daily-qt');
  loadModule('/home-news-feed.js', 'home-news-feed');
  loadModule('/event-range-ui.js', 'event-range-ui');
  loadModule('/volunteer-form-fix.js', 'volunteer-form-fix');
}

loadModule('/meditation-sync.js', 'meditation-sync');
loadModule('/admin-shortcut.js', 'admin-shortcut');
loadModule('/church-contact.js', 'church-contact');
loadModule('/ui-fixes.js', 'ui-fixes');