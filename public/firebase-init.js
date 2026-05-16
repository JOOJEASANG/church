// 천안남산교회 PWA - Firebase 공용 초기화
// 사용자 앱과 관리자 페이지에서 함께 import 합니다.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AI" + "zaSyD3a8RXkKaGiq4mFHCUkArLRecifU_-uFQ",
  authDomain: "church-399cb.firebaseapp.com",
  databaseURL: "https://church-399cb-default-rtdb.firebaseio.com",
  projectId: "church-399cb",
  storageBucket: "church-399cb.firebasestorage.app",
  messagingSenderId: "285920062728",
  appId: "1:285920062728:web:534fd5cd1824c3658f90bd",
  measurementId: "G-4G2T868KSX"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// CORS 오류 방지: 외부 bible-api.com 호출은 더 이상 사용하지 않고 Firebase dailyVerses만 사용합니다.
try {
  const originalFetch = window.fetch?.bind(window);
  if (originalFetch && !window.__namsanBibleApiBlocked) {
    window.__namsanBibleApiBlocked = true;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (/https?:\/\/bible-api\.com\//i.test(url)) {
        console.warn('[daily-verse] bible-api.com 요청 차단: Firebase 등록 말씀을 사용합니다.');
        return Promise.resolve(new Response(JSON.stringify({ text: '', reference: '' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
      return originalFetch(input, init);
    };
  }
} catch (e) {
  console.warn('[daily-verse] 외부 API 차단 초기화 실패:', e?.message || e);
}

isSupported().then((ok) => { if (ok) getAnalytics(app); }).catch(() => {});

const __isAdminPage = location.pathname === '/admin' || location.pathname.startsWith('/admin/');

// 사용자 전용 모듈
if (!__isAdminPage) {
  import('/talent-room-board.js').catch((e) => console.warn('[talent-room-board] 로드 실패:', e?.message || e));
  import('/talent-category-fix.js').catch((e) => console.warn('[talent-category-fix] 로드 실패:', e?.message || e));
  import('/room-status-fix.js').catch((e) => console.warn('[room-status-fix] 로드 실패:', e?.message || e));
}

// 관리자 전용 모듈
if (__isAdminPage) {
  import('/daily-verses.js').catch((e) => console.warn('[daily-verses] 로드 실패:', e?.message || e));
  import('/daily-verses-list-fix.js').catch((e) => console.warn('[daily-verses-list-fix] 로드 실패:', e?.message || e));
  import('/daily-verses-seed.js').catch((e) => console.warn('[daily-verses-seed] 로드 실패:', e?.message || e));
  import('/admin-google-login.js').catch((e) => console.warn('[admin-google-login] 로드 실패:', e?.message || e));
}

// 오늘의 말씀 표시는 daily-verse-final.js 하나만 담당합니다.
import('/daily-verse-final.js').catch((e) => console.warn('[daily-verse-final] 로드 실패:', e?.message || e));

// 오늘의 묵상은 todayVerseChanged 이벤트만 받아 동기화합니다.
import('/meditation-sync.js').catch((e) => console.warn('[meditation-sync] 로드 실패:', e?.message || e));

// 공용 UI/연락처/관리자 이동 버튼
import('/admin-shortcut.js').catch((e) => console.warn('[admin-shortcut] 로드 실패:', e?.message || e));
import('/church-contact.js').catch((e) => console.warn('[church-contact] 로드 실패:', e?.message || e));
import('/ui-fixes.js').catch((e) => console.warn('[ui-fixes] 로드 실패:', e?.message || e));
