import { app, auth } from '/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-functions.js';

const functions = getFunctions(app, 'asia-northeast3');
const syncAccessClaims = httpsCallable(functions, 'syncAccessClaims');
const protectedButtons = ['bulUpload', 'heroUpload', 'logoUpload'];

function setButtonsDisabled(disabled) {
  protectedButtons.forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.disabled = disabled;
  });
}

function statusElement() {
  let element = document.getElementById('adminClaimsStatus');
  if (element) return element;
  element = document.createElement('span');
  element.id = 'adminClaimsStatus';
  element.setAttribute('role', 'status');
  element.style.cssText = 'width:36px;height:36px;min-width:36px;display:inline-grid;place-items:center;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--muted);';
  document.querySelector('.topbar .row')?.prepend(element);
  return element;
}

function statusSvg(state) {
  if (state === 'ok') {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.9 8.2 7 10 4.1-1.8 7-5.4 7-10V6l-7-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m8.5 12 2.2 2.2 4.8-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  if (state === 'error') {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.9 8.2 7 10 4.1-1.8 7-5.4 7-10V6l-7-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 8v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1" fill="currentColor"/></svg>';
  }
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.9 8.2 7 10 4.1-1.8 7-5.4 7-10V6l-7-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 8v4l2.5 1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function setStatus(message, ok = false) {
  const element = statusElement();
  const state = ok ? 'ok' : /실패|없습니다/.test(message) ? 'error' : 'pending';
  element.innerHTML = statusSvg(state);
  element.title = message;
  element.setAttribute('aria-label', message);
  element.dataset.state = state;
  element.style.color = state === 'ok' ? 'var(--primary-dark)' : state === 'error' ? 'var(--danger)' : 'var(--muted)';
  element.style.background = state === 'ok' ? 'var(--primary-soft)' : state === 'error' ? 'var(--danger-soft)' : 'var(--bg)';
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setButtonsDisabled(true);
    setStatus('권한 확인 대기');
    return;
  }

  setButtonsDisabled(true);
  setStatus('관리자 권한 확인 중…');
  try {
    const result = await syncAccessClaims();
    if (!result.data?.admin) throw new Error('관리자 권한이 없습니다.');
    await user.getIdToken(true);
    setStatus('관리자 권한 확인됨', true);
    setButtonsDisabled(false);
  } catch (error) {
    console.error('[admin-claims] 권한 동기화 실패:', error);
    setStatus('Storage 권한 확인 실패');
  }
});