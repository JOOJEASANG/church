// 천안남산교회 PWA - Firebase 공용 초기화
// 사용자 앱과 관리자 페이지에서 함께 import 합니다.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyD3a8RXkKaGiq4mFHCUkArLRecifU_-uFQ",
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
