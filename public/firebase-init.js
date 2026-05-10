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

isSupported().then((ok) => { if (ok) getAnalytics(app); }).catch(() => {});

// 공용 확장 기능: 관리자 등록 말씀을 홈 화면 오늘의 말씀에 적용
import('/daily-verses.js').catch((e) => console.warn('[daily-verses] 로드 실패:', e?.message || e));

// 오늘의 말씀 기본 데이터 추가 버튼
import('/daily-verses-seed.js').catch((e) => console.warn('[daily-verses-seed] 로드 실패:', e?.message || e));

// 오늘의 말씀 관리자 목록 강제 렌더링 보정
import('/daily-verses-list-fix.js').catch((e) => console.warn('[daily-verses-list-fix] 로드 실패:', e?.message || e));

// 오늘의 말씀과 오늘의 묵상 동기화
import('/meditation-sync.js').catch((e) => console.warn('[meditation-sync] 로드 실패:', e?.message || e));

// 재능나눔방 승인 상태 표시 보정
import('/room-status-fix.js').catch((e) => console.warn('[room-status-fix] 로드 실패:', e?.message || e));

// 재능나눔방 방 공지 기능
import('/talent-room-board.js').catch((e) => console.warn('[talent-room-board] 로드 실패:', e?.message || e));

// 교회정보 확장: 네이버지도 링크 + 홈 하단 연락처 카드
import('/church-contact.js').catch((e) => console.warn('[church-contact] 로드 실패:', e?.message || e));

// 관리자 Google 로그인 확장
import('/admin-google-login.js').catch((e) => console.warn('[admin-google-login] 로드 실패:', e?.message || e));

// 공용 UI 보정: 관리자 메뉴 정리 + 설치 배너 폭 보정
import('/ui-fixes.js').catch((e) => console.warn('[ui-fixes] 로드 실패:', e?.message || e));
