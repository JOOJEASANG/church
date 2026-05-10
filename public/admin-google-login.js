/* =============================================================
 * 관리자 페이지 Google 로그인 확장
 * - 기존 이메일/비밀번호 로그인은 유지
 * - Google 로그인 후 기존 admin.js의 onAuthStateChanged 권한 확인 흐름 사용
 * ============================================================= */

import { auth } from '/firebase-init.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

function isAdminPage() {
  return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
}

function injectStyles() {
  if (document.getElementById('adminGoogleLoginStyles')) return;
  const style = document.createElement('style');
  style.id = 'adminGoogleLoginStyles';
  style.textContent = `
    .google-login-divider {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 14px 0 12px;
      color: var(--muted, #767a83);
      font-size: 12px;
      font-weight: 800;
    }
    .google-login-divider::before,
    .google-login-divider::after {
      content: '';
      height: 1px;
      background: var(--line, #ebece8);
      flex: 1;
    }
    .google-login-btn {
      width: 100%;
      min-height: 46px;
      border-radius: 14px;
      border: 1px solid var(--line, #ebece8);
      background: var(--paper, #fff);
      color: var(--text, #15171a);
      font-size: 14px;
      font-weight: 900;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      box-shadow: var(--shadow-xs, 0 1px 2px rgba(20,22,26,.04));
    }
    .google-login-btn:active { transform: translateY(1px); }
    .google-login-btn[disabled] { opacity: .65; cursor: progress; }
    .google-login-g {
      width: 22px;
      height: 22px;
      border-radius: 999px;
      background: #fff;
      display: inline-grid;
      place-items: center;
      font-size: 16px;
      font-weight: 950;
      color: #4285f4;
      border: 1px solid #e5e7eb;
    }
  `;
  document.head.appendChild(style);
}

function setError(message) {
  const err = document.getElementById('loginErr');
  if (err) err.textContent = message || '';
}

function firebaseGoogleErrorMessage(code) {
  return ({
    'auth/popup-closed-by-user': '구글 로그인 창이 닫혔습니다.',
    'auth/cancelled-popup-request': '구글 로그인이 취소되었습니다.',
    'auth/popup-blocked': '팝업이 차단되었습니다. 리다이렉트 방식으로 다시 시도합니다.',
    'auth/operation-not-allowed': 'Firebase 콘솔에서 Google 로그인 제공업체를 먼저 사용 설정해야 합니다.',
    'auth/account-exists-with-different-credential': '같은 이메일의 기존 계정이 있습니다. 먼저 이메일/비밀번호로 로그인한 뒤 Google 계정 연동이 필요합니다.',
    'auth/network-request-failed': '네트워크 연결을 확인해주세요.'
  })[code] || '구글 로그인에 실패했습니다.';
}

async function googleLogin(button) {
  setError('');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  button.disabled = true;
  const originalText = button.querySelector('.google-login-text')?.textContent || 'Google로 로그인';
  const text = button.querySelector('.google-login-text');
  if (text) text.textContent = 'Google 로그인 중...';

  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error('[admin-google-login] 실패:', e);
    if (e.code === 'auth/popup-blocked') {
      setError(firebaseGoogleErrorMessage(e.code));
      try {
        await signInWithRedirect(auth, provider);
        return;
      } catch (redirectErr) {
        console.error('[admin-google-login] redirect 실패:', redirectErr);
        setError(firebaseGoogleErrorMessage(redirectErr.code));
      }
    } else {
      setError(firebaseGoogleErrorMessage(e.code));
    }
  } finally {
    button.disabled = false;
    if (text) text.textContent = originalText;
  }
}

function injectGoogleLoginButton() {
  if (!isAdminPage()) return;
  if (document.getElementById('googleLoginBtn')) return;

  const emailLoginBtn = document.getElementById('loginBtn');
  const loginPane = document.getElementById('loginPane');
  if (!emailLoginBtn || !loginPane) return;

  const wrap = document.createElement('div');
  wrap.id = 'googleLoginWrap';
  wrap.innerHTML = `
    <div class="google-login-divider">또는</div>
    <button class="google-login-btn" id="googleLoginBtn" type="button">
      <span class="google-login-g">G</span>
      <span class="google-login-text">Google로 로그인</span>
    </button>
  `;
  emailLoginBtn.insertAdjacentElement('afterend', wrap);
  document.getElementById('googleLoginBtn')?.addEventListener('click', (e) => googleLogin(e.currentTarget));
}

function boot() {
  if (!isAdminPage()) return;
  injectStyles();
  injectGoogleLoginButton();
  [300, 800, 1600, 3000].forEach((ms) => setTimeout(injectGoogleLoginButton, ms));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
