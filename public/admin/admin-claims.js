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
  element.style.cssText = 'font-size:11px;font-weight:700;color:var(--muted);';
  document.querySelector('.topbar .row')?.prepend(element);
  return element;
}

function setStatus(message, ok = false) {
  const element = statusElement();
  element.textContent = message;
  element.style.color = ok ? 'var(--primary-dark)' : 'var(--muted)';
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
