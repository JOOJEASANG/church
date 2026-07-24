import { app, db, auth } from '/firebase-init.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-functions.js';

const functions = getFunctions(app, 'asia-northeast3');
const syncAccessClaims = httpsCallable(functions, 'syncAccessClaims');
const deleteMyAccount = httpsCallable(functions, 'deleteMyAccount');

let currentStatus = null;
let unsubscribeProfile = null;
let deletingAccount = false;

const protectedSelector = [
  '#pSubmit', '#rSubmit', '#vSubmit', '#vtSubmit', '#ncSubmit', '#raSubmit', '#eaSubmit', '#ciSubmit',
  '#postSubmitBtn', '#commentSubmit', '#postDetailLikeBtn', '#fbSubmit',
  '[data-modal="prayerModal"]', '[data-modal="roomCreateModal"]', '[data-modal="postComposeModal"]',
  '.apply-btn', '[data-event-signup]',
  '[data-action="attendance"]', '[data-action="visit"]', '[data-action="newcomer"]'
].join(',');

function notify(message) {
  if (typeof window.toast === 'function') window.toast(message);
  else alert(message);
}

function ensureBanner() {
  let banner = document.getElementById('memberStatusBanner');
  if (banner) return banner;
  const style = document.createElement('style');
  style.textContent = `
    #memberStatusBanner{display:none;position:sticky;top:0;z-index:950;padding:10px 16px;text-align:center;font-size:12.5px;font-weight:800;border-bottom:1px solid rgba(0,0,0,.08)}
    #memberStatusBanner.show{display:block}
    #memberStatusBanner.pending{background:#fff5cf;color:#6f5500}
    #memberStatusBanner.suspended{background:#fbefef;color:#9b3030}
  `;
  document.head.appendChild(style);
  banner = document.createElement('div');
  banner.id = 'memberStatusBanner';
  banner.setAttribute('role', 'status');
  document.body.prepend(banner);
  return banner;
}

function renderStatus(status) {
  currentStatus = status || 'pending';
  const banner = ensureBanner();
  banner.className = '';
  if (currentStatus === 'approved') {
    banner.textContent = '';
    return;
  }
  banner.classList.add('show', currentStatus === 'suspended' ? 'suspended' : 'pending');
  banner.textContent = currentStatus === 'suspended'
    ? '관리자에 의해 이용이 정지되었습니다. 교회 관리자에게 문의해주세요.'
    : '회원 승인 대기 중입니다. 열람은 가능하며, 승인 후 글쓰기·신청·업로드 기능을 사용할 수 있습니다.';
}

async function refreshClaims() {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await syncAccessClaims();
    await user.getIdToken(true);
  } catch (error) {
    console.warn('[member-status] 권한 토큰 동기화 실패:', error.code || error.message);
  }
}

document.addEventListener('click', async (event) => {
  const withdrawButton = event.target.closest?.('[data-action="withdraw"]');
  if (withdrawButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (deletingAccount) return;
    if (!confirm('정말 탈퇴하시겠습니까?\n프로필, 신청, 게시물, 댓글, 좋아요, 기도 기록과 계정이 영구 삭제됩니다.')) return;
    const confirmation = prompt('삭제를 진행하려면 아래 단어를 정확히 입력해주세요:\n\n삭제');
    if (confirmation !== '삭제') {
      notify('탈퇴가 취소되었습니다');
      return;
    }
    deletingAccount = true;
    notify('회원 데이터와 계정을 안전하게 삭제하고 있습니다…');
    try {
      await deleteMyAccount({ confirmation });
      try { await signOut(auth); } catch {}
      ['myAppIds', 'myFeedbackIds', 'attendName', 'uploaderName', 'notifEnabled']
        .forEach((key) => { localStorage.removeItem(key); sessionStorage.removeItem(key); });
      location.reload();
    } catch (error) {
      console.error('[member-status] 회원 탈퇴 실패:', error);
      notify(error.message || '회원 탈퇴 처리에 실패했습니다.');
      deletingAccount = false;
    }
    return;
  }

  if (currentStatus === 'approved') return;
  const protectedTarget = event.target.closest?.(protectedSelector);
  if (!protectedTarget) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  notify(currentStatus === 'suspended' ? '현재 이용이 정지된 계정입니다.' : '관리자 승인 후 사용할 수 있는 기능입니다.');
}, true);

onAuthStateChanged(auth, (user) => {
  unsubscribeProfile?.();
  unsubscribeProfile = null;
  currentStatus = null;
  if (!user) {
    document.getElementById('memberStatusBanner')?.classList.remove('show');
    return;
  }

  let lastStatus = Symbol('initial');
  unsubscribeProfile = onValue(ref(db, `users/${user.uid}`), async (snapshot) => {
    const status = snapshot.child('status').val() || 'pending';
    renderStatus(status);
    if (lastStatus !== status) {
      lastStatus = status;
      await refreshClaims();
    }
  }, (error) => {
    console.warn('[member-status] 프로필 상태 읽기 실패:', error.code || error.message);
    renderStatus('pending');
  });
});
