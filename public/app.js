/* =============================================================
 * 천안남산교회 PWA — 사용자 앱 (Firebase RTDB 연동)
 * ============================================================= */

import { db, auth, storage } from '/firebase-init.js';
import { resizeImage, humanSize } from '/img-utils.js';
import {
  ref, onValue, push, update, get, set, remove, serverTimestamp, query, orderByChild, runTransaction
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import {
  onAuthStateChanged, updateProfile, signOut, deleteUser,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  ref as sRef, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js";


// ----- 상태 -----
const state = {
  uid: null,
  isAdmin: false,
  currentTab: 'home',
  currentCategory: '전체',
  rooms: [],
  prayers: [],
  announcements: [],
  bulletins: [],
  prayedBy: {},     // {prayerId: true} for current user
  church: {},
  services: [],
  hero: null,
  events: [],
  sermonHistory: [],
  posts: [],
  postLikes: {},
  currentPostId: null,
  editingPrayerId: null,
  editingPostId: null,
  editingNoteKey: null,
  pendingPostImages: [],
  currentMonth: new Date()
};

// 인증 로직은 onAuthStateChanged에서 처리됨 — 자동 로그인 없음.
// 사용자가 로그인하기 전엔 #authScreen이 표시됨.

// 페이지 로드 시 약관 모달을 기본값으로 미리 채워둠 (회원가입 화면에서 클릭 가능)
window.addEventListener('DOMContentLoaded', () => fillLegalModals());

function showAuthScreen() {
  const el = document.getElementById('authScreen');
  if (el) el.classList.add('show');
  document.body.style.overflow = 'hidden';
  document.documentElement.removeAttribute('data-auth-pending');
  try { localStorage.removeItem('namsanHadAuth'); } catch (e) {}
}
function hideAuthScreen() {
  const el = document.getElementById('authScreen');
  if (el) el.classList.remove('show');
  document.body.style.overflow = '';
  document.documentElement.removeAttribute('data-auth-pending');
  try { localStorage.setItem('namsanHadAuth', '1'); } catch (e) {}
}

// 인증 탭 토글
document.querySelectorAll('[data-auth-tab]').forEach((b) => {
  b.addEventListener('click', () => {
    const tab = b.dataset.authTab;
    document.querySelectorAll('[data-auth-tab]').forEach((x) => x.classList.toggle('active', x === b));
    document.getElementById('authPaneLogin').classList.toggle('active', tab === 'login');
    document.getElementById('authPaneRegister').classList.toggle('active', tab === 'register');
    document.getElementById('loginErr').textContent = '';
    document.getElementById('registerErr').textContent = '';
  });
});

function authError(code) {
  return ({
    'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
    'auth/user-not-found': '등록되지 않은 계정입니다.',
    'auth/wrong-password': '비밀번호가 일치하지 않습니다.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/email-already-in-use': '이미 가입된 이메일입니다.',
    'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
    'auth/too-many-requests': '시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
    'auth/network-request-failed': '네트워크 연결을 확인해주세요.',
    'auth/popup-blocked': '팝업이 차단되었습니다. 팝업 허용 후 다시 시도하거나 브라우저를 변경해주세요.',
    'auth/account-exists-with-different-credential': '이미 다른 방법으로 가입된 이메일입니다.',
    'auth/operation-not-allowed': '이 로그인 방법이 비활성화되어 있습니다. 관리자에게 문의해주세요.',
    'auth/unauthorized-domain': '현재 도메인이 허용 목록에 없습니다. (Firebase Console 확인 필요)'
  })[code] || '오류가 발생했습니다. 다시 시도해주세요.';
}

// 로그인
document.getElementById('authPaneLogin')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginErr');
  const btn = document.getElementById('loginBtn');
  errEl.textContent = '';
  btn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged가 나머지 처리
  } catch (err) {
    console.error('[login]', err.code, err.message);
    errEl.textContent = authError(err.code);
  } finally {
    btn.disabled = false;
  }
});

// 회원가입
document.getElementById('authPaneRegister')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const role = document.getElementById('regRole').value || '성도';
  const phone = document.getElementById('regPhone').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const passwordConfirm = document.getElementById('regPasswordConfirm').value;
  const agreeTos = document.getElementById('regAgreeTos').checked;
  const agreePrivacy = document.getElementById('regAgreePrivacy').checked;
  const errEl = document.getElementById('registerErr');
  const btn = document.getElementById('registerBtn');
  errEl.textContent = '';

  if (!name) { errEl.textContent = '이름을 입력해주세요.'; return; }
  if (!phone) { errEl.textContent = '연락처를 입력해주세요.'; return; }
  if (password.length < 6) { errEl.textContent = '비밀번호는 6자 이상이어야 합니다.'; return; }
  if (password !== passwordConfirm) { errEl.textContent = '비밀번호가 일치하지 않습니다.'; return; }
  if (!agreeTos || !agreePrivacy) { errEl.textContent = '이용약관과 개인정보 처리방침에 동의해주세요.'; return; }

  btn.disabled = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await set(ref(db, `users/${cred.user.uid}`), {
      email, displayName: name, phone, role,
      memberType: '일반', status: 'approved',
      createdAt: Date.now(),
      agreedTosAt: Date.now(), agreedPrivacyAt: Date.now()
    });
    // onAuthStateChanged가 나머지 처리
  } catch (err) {
    console.error('[register]', err.code, err.message);
    errEl.textContent = authError(err.code);
  } finally {
    btn.disabled = false;
  }
});

// Google 로그인
async function ensureGoogleUserProfile(user) {
  // 첫 로그인이면 /users/{uid}를 기본값으로 생성 (이름은 Google 프로필, 직분은 성도)
  try {
    const snap = await get(ref(db, `users/${user.uid}`));
    if (!snap.exists()) {
      await set(ref(db, `users/${user.uid}`), {
        email: user.email || '',
        displayName: user.displayName || (user.email ? user.email.split('@')[0] : '성도'),
        phone: user.phoneNumber || '',
        role: '성도',
        memberType: '일반',
        status: 'approved',
        provider: 'google',
        createdAt: Date.now(),
        agreedTosAt: Date.now(),
        agreedPrivacyAt: Date.now()
      });
    }
  } catch (e) {
    console.warn('[google-signin] 프로필 생성 실패:', e.code);
  }
}

document.getElementById('googleSignInBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('googleSignInBtn');
  const errEl = document.getElementById('loginErr');
  errEl.textContent = '';
  btn.disabled = true;
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    let cred;
    try {
      cred = await signInWithPopup(auth, provider);
    } catch (e) {
      // 팝업 차단 / iOS PWA 등 → redirect 폴백
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider);
        return; // redirect → 페이지 새로 로드 후 getRedirectResult가 처리
      }
      throw e;
    }
    if (cred?.user) {
      await ensureGoogleUserProfile(cred.user);
      // onAuthStateChanged가 화면 전환 처리
    }
  } catch (e) {
    console.error('[google-signin]', e.code, e.message);
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
      // 사용자 취소는 조용히 무시
    } else {
      errEl.textContent = authError(e.code) || ('Google 로그인 실패: ' + (e.code || e.message));
    }
  } finally {
    btn.disabled = false;
  }
});

// signInWithRedirect 후 페이지 복귀 시 결과 처리
(async () => {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) await ensureGoogleUserProfile(result.user);
  } catch (e) {
    if (e.code && e.code !== 'auth/no-redirect-result') {
      console.warn('[google-redirect-result]', e.code);
    }
  }
})();

// 비밀번호 찾기
document.getElementById('forgotLink')?.addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) {
    document.getElementById('loginErr').textContent = '이메일을 먼저 입력한 뒤 "비밀번호 찾기"를 눌러주세요.';
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    document.getElementById('loginErr').style.color = 'var(--primary)';
    document.getElementById('loginErr').textContent = `${email} 으로 비밀번호 재설정 메일을 보냈습니다.`;
    setTimeout(() => { document.getElementById('loginErr').style.color = ''; }, 5000);
  } catch (err) {
    document.getElementById('loginErr').textContent = authError(err.code);
  }
});

// 약관/개인정보 모달 — 교회 정보로 채워짐
function fillLegalModals() {
  const c = state.church || {};
  const churchName = c.name || '천안남산교회';
  const phone = c.phone || '041-000-0000';
  const email = c.email || 'church@example.com';
  const address = c.address || '충남 천안시';
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  const tosBody = document.getElementById('tosBody');
  if (tosBody) tosBody.innerHTML = `
    <p>본 약관은 <b>${escapeHtml(churchName)}</b>(이하 "교회")가 제공하는 모바일 웹 앱 서비스(이하 "서비스")의 이용 조건과 운영 방침을 규정합니다.</p>

    <h4>제1조 (목적)</h4>
    <p>본 약관은 교회가 제공하는 서비스의 이용과 관련하여 교회와 이용자의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.</p>

    <h4>제2조 (서비스의 내용)</h4>
    <ul>
      <li>예배 안내, 설교 영상(이번 주·지난 설교), 주보 열람</li>
      <li>오늘의 말씀, 교회 일정(캘린더), 공지사항·행사 안내</li>
      <li>기도제목 등록·참여, 재능나눔방 개설·신청</li>
      <li>커뮤니티 게시판(작성·좋아요·댓글·다중 사진), 소모임 행사 신청</li>
      <li>행사 신청, 봉사 신청, 심방 요청, 새가족 등록</li>
      <li>예배 체크(다중 참석 가능), 갤러리, 푸시 알림</li>
      <li>의견·건의 보내기 (사용자 → 관리자)</li>
    </ul>

    <h4>제3조 (회원가입)</h4>
    <ul>
      <li>이름·연락처·이메일·비밀번호 입력으로 가입하거나, <b>Google 계정으로 간편 가입</b>할 수 있습니다.</li>
      <li>Google 가입 시에도 본 약관과 개인정보 처리방침에 동의한 것으로 간주됩니다 (가입 화면 안내문에 명시).</li>
      <li>Google 가입자도 신청 기능을 사용하려면 "내정보 → 프로필 수정"에서 연락처·직분을 등록해주세요.</li>
      <li>타인의 정보를 도용하거나 허위 정보를 등록할 수 없습니다.</li>
    </ul>

    <h4>제4조 (프로필 관리)</h4>
    <ul>
      <li>이용자는 "내정보 → 프로필 수정"에서 이름·연락처를 언제든지 변경할 수 있습니다.</li>
      <li>이메일은 보안상 변경되지 않습니다.</li>
    </ul>

    <h4>제5조 (이용자의 의무)</h4>
    <ul>
      <li>타인을 비방·모욕·공격하는 내용을 등록하지 않습니다.</li>
      <li>저작권을 침해하거나 음란·폭력적 콘텐츠를 등록하지 않습니다.</li>
      <li>부적절한 게시물은 교회가 사전 통지 없이 삭제할 수 있습니다.</li>
      <li>본인이 등록한 기도제목·신청은 본인이 직접 수정·삭제할 수 있습니다.</li>
    </ul>

    <h4>제6조 (서비스 변경 및 중단)</h4>
    <p>교회는 운영상·기술상 필요한 경우 서비스를 변경하거나 중단할 수 있으며, 사전에 공지합니다.</p>

    <h4>제7조 (탈퇴)</h4>
    <p>이용자는 언제든지 "내정보 → 탈퇴"를 통해 회원 탈퇴 및 본인 데이터(기도제목·신청·갤러리 사진·아멘 기록·프로필 등)의 영구 삭제를 요청할 수 있습니다.</p>

    <h4>제8조 (책임의 한계)</h4>
    <p>교회는 천재지변, 통신 장애 등 불가항력에 의한 서비스 중단에 대해 책임지지 않습니다.</p>

    <h4>제9조 (분쟁 해결)</h4>
    <p>본 약관과 관련된 분쟁은 교회 소재지(${escapeHtml(address)}) 관할 법원을 1심 관할 법원으로 합니다.</p>

    <p style="margin-top:14px;color:var(--muted);font-size:12px;">
      문의: ${escapeHtml(phone)} / ${escapeHtml(email)}<br/>
      시행일: ${escapeHtml(today)}
    </p>
  `;

  const privacyBody = document.getElementById('privacyBody');
  if (privacyBody) privacyBody.innerHTML = `
    <p><b>${escapeHtml(churchName)}</b>(이하 "교회")는 「개인정보 보호법」을 준수하며, 이용자의 개인정보 보호 및 권익을 위해 다음과 같이 개인정보 처리방침을 수립·공개합니다.</p>

    <h4>1. 수집하는 개인정보 항목</h4>
    <ul>
      <li><b>이메일 회원가입 시 (필수)</b>: 이름, 연락처(전화번호), 이메일, 비밀번호(암호화 저장)</li>
      <li><b>Google 간편 가입 시</b>: Google 프로필의 이름·이메일·프로필 사진(있는 경우). 비밀번호는 Google이 관리하므로 교회는 저장하지 않음. 연락처·직분은 첫 사용 시 사용자가 직접 입력.</li>
      <li><b>각 신청 시 (선택)</b>: 주소(새가족 등록 시), 희망일·메모(심방 요청 시), 참석 인원·요청사항(행사·봉사 시)</li>
      <li><b>예배 체크 시</b>: 참석 예배·날짜</li>
      <li><b>갤러리 업로드 시</b>: 사진, 캡션, 업로더 표시명</li>
      <li><b>자동 수집</b>: 접속 시각, 기기 정보, FCM 알림 토큰(알림 동의 시)</li>
    </ul>

    <h4>2. 수집·이용 목적</h4>
    <ul>
      <li>회원 식별 및 본인 확인</li>
      <li>행사·봉사·심방·새가족 등 신청 접수 및 담당자 연락 (저장된 연락처로 연락 드립니다)</li>
      <li>기도제목·재능나눔방 등록 및 참여 관리</li>
      <li>예배 출석 통계 및 사목 관리</li>
      <li>공지·행사·푸시 알림 발송 (동의자에 한함)</li>
    </ul>

    <h4>3. 보유 및 이용 기간</h4>
    <p>회원 탈퇴 시 또는 수집·이용 목적 달성 시 즉시 파기합니다. 단, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.</p>

    <h4>4. 제3자 제공</h4>
    <p>교회는 이용자의 개인정보를 외부에 제공하지 않습니다. 단, 법령에 의거하거나 수사기관의 정당한 요청이 있는 경우에는 제공할 수 있습니다.</p>

    <h4>5. 처리 위탁</h4>
    <ul>
      <li>Google Firebase (Authentication, Realtime Database, Cloud Storage, FCM) — 미국, 데이터 호스팅 및 인증 서비스 제공 목적</li>
    </ul>

    <h4>6. 이용자의 권리</h4>
    <ul>
      <li>본인 프로필(이름·연락처)을 "내정보 → 프로필 수정"에서 언제든지 열람·정정할 수 있습니다.</li>
      <li>본인이 등록한 기도제목·신청·갤러리 사진은 직접 수정·삭제할 수 있습니다.</li>
      <li>"내정보 → 탈퇴"를 통해 모든 개인정보(프로필·기도제목·신청·아멘 기록·알림 토큰·갤러리 등)를 영구 삭제할 수 있습니다.</li>
      <li>탈퇴는 비밀번호 재확인 후 진행되며, 되돌릴 수 없습니다.</li>
    </ul>

    <h4>7. 안전성 확보 조치</h4>
    <ul>
      <li>비밀번호는 Firebase Authentication에 의해 단방향 암호화되어 저장됩니다.</li>
      <li>접근 제어: 본인 데이터는 본인만, 관리자 데이터는 관리자만 접근 가능하도록 보안 규칙으로 강제합니다.</li>
      <li>전송 구간 보안: 모든 통신은 HTTPS(TLS)로 암호화됩니다.</li>
    </ul>

    <h4>8. 개인정보 보호책임자</h4>
    <p>
      ${escapeHtml(churchName)}<br/>
      주소: ${escapeHtml(address)}<br/>
      연락처: ${escapeHtml(phone)}<br/>
      이메일: ${escapeHtml(email)}
    </p>

    <h4>9. 변경 고지</h4>
    <p>본 방침은 법령 또는 서비스 변경 시 사전 공지 후 변경될 수 있습니다.</p>

    <p style="margin-top:14px;color:var(--muted);font-size:12px;">시행일: ${escapeHtml(today)}</p>
  `;

  const acn = document.getElementById('authChurchName');
  if (acn) acn.textContent = churchName;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    detachListeners();
    state.uid = null;
    state.userProfile = null;
    // 로그아웃 시 열려있는 모든 모달 닫기 (잘못된 uid로 폼 제출 방지)
    document.querySelectorAll('.modal-bg.show').forEach((m) => closeModal(m.id));
    showAuthScreen();
    return;
  }
  hideAuthScreen();
  state.uid = user.uid;
  // 프로필 정보 + 관리자 여부 확인
  try {
    const [psnap, asnap] = await Promise.all([
      get(ref(db, `users/${user.uid}`)),
      get(ref(db, `admins/${user.uid}`))
    ]);
    state.userProfile = psnap.exists() ? psnap.val() : { email: user.email, displayName: user.displayName || '' };
    state.isAdmin = asnap.exists();
  } catch {
    state.userProfile = { email: user.email, displayName: user.displayName || '' };
    state.isAdmin = false;
  }
  applyProfile();
  attachListeners();
  loadMyPrayedFlags();
  loadMyPostLikes();
});


function applyProfile() {
  const p = state.userProfile || {};
  const nameEl = document.querySelector('#profileName');
  const emailEl = document.querySelector('#profileEmail');
  const phoneEl = document.querySelector('#profilePhone');
  const rolePill = document.querySelector('#profileRolePill');
  if (nameEl) nameEl.textContent = p.displayName || '성도님';
  if (emailEl) emailEl.textContent = p.email || '';
  if (phoneEl) phoneEl.textContent = p.phone || '연락처 미등록';
  if (rolePill) {
    rolePill.textContent = p.role || '성도';
    rolePill.style.display = p.displayName ? '' : 'none';
  }
  // 새가족 등록 카드: 로그인한 모든 사용자에게 표시
  const newcomerCard = document.getElementById('newcomerCard');
  if (newcomerCard) newcomerCard.style.display = '';
}

// 다른 사용자에게 표시할 이름 라벨 — "홍길동 집사" 형태
function userLabel(name, role) {
  const n = name || '익명';
  const r = role && role !== '성도' ? ` ${role}` : '';
  return n + r;
}

// 신청 폼들에 프로필 자동 입력 (이름·연락처)
function autofillFromProfile(map) {
  const p = state.userProfile || {};
  Object.entries(map).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (key === 'name' && p.displayName && !el.value) el.value = p.displayName;
    if (key === 'phone' && p.phone && !el.value) el.value = p.phone;
  });
}

// 프로필이 미완성이면 안내 (행사·봉사 등 신청 시)
function ensureProfileComplete() {
  const p = state.userProfile || {};
  if (!p.phone) {
    if (confirm('연락처가 프로필에 등록되어 있지 않습니다.\n\n지금 등록하시겠어요? (한 번만 등록하면 다음부터는 자동 입력됩니다)')) {
      openProfileEdit();
    }
    return false;
  }
  return true;
}

// 프로필 수정 모달
function openProfileEdit() {
  const p = state.userProfile || {};
  document.getElementById('peName').value = p.displayName || '';
  document.getElementById('peRole').value = p.role || '성도';
  document.getElementById('pePhone').value = p.phone || '';
  document.getElementById('peEmail').value = p.email || auth.currentUser?.email || '';
  openModal('profileEditModal');
}

document.getElementById('profileEditBtn')?.addEventListener('click', openProfileEdit);

// ===== 의견·건의 =====
document.getElementById('fbSubmit')?.addEventListener('click', async () => {
  const title = document.getElementById('fbTitle').value.trim();
  const body = document.getElementById('fbBody').value.trim();
  const status = document.getElementById('fbStatus');
  if (!title) { status.textContent = '제목을 입력해주세요'; status.style.color = 'var(--danger)'; return; }
  if (!body) { status.textContent = '내용을 입력해주세요'; status.style.color = 'var(--danger)'; return; }
  const btn = document.getElementById('fbSubmit');
  btn.disabled = true;
  status.textContent = '💾 보내는 중...'; status.style.color = '';
  try {
    const newRef = await push(ref(db, 'feedback'), {
      title, body,
      authorUid: state.uid,
      authorName: state.userProfile?.displayName || '성도',
      authorRole: state.userProfile?.role || '성도',
      authorEmail: state.userProfile?.email || '',
      timestamp: Date.now(),
      status: 'open'
    });
    // 본인 의견 ID를 로컬에 기록 (탈퇴 시 정리용)
    try {
      const ids = JSON.parse(sessionStorage.getItem('myFeedbackIds') || '[]');
      ids.unshift(newRef.key);
      sessionStorage.setItem('myFeedbackIds', JSON.stringify(ids.slice(0, 100)));
    } catch {}
    status.textContent = '✅ 의견이 관리자에게 전달되었습니다. 감사합니다!';
    status.style.color = 'var(--primary)';
    document.getElementById('fbTitle').value = '';
    document.getElementById('fbBody').value = '';
    setTimeout(() => closeModal('feedbackModal'), 1500);
  } catch (e) {
    status.textContent = '❌ 전송 실패: ' + (e.code || e.message);
    status.style.color = 'var(--danger)';
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('peSubmit')?.addEventListener('click', async () => {
  const name = document.getElementById('peName').value.trim();
  const role = document.getElementById('peRole').value || '성도';
  const phone = document.getElementById('pePhone').value.trim();
  if (!name) { toast('이름을 입력해주세요'); return; }
  if (!phone) { toast('연락처를 입력해주세요'); return; }
  if (!state.uid) { toast('로그인 상태를 확인해주세요'); return; }
  const btn = document.getElementById('peSubmit');
  btn.disabled = true;
  btn.textContent = '저장 중...';
  try {
    await update(ref(db, `users/${state.uid}`), {
      displayName: name, role, phone, updatedAt: Date.now()
    });
    if (auth.currentUser && auth.currentUser.displayName !== name) {
      await updateProfile(auth.currentUser, { displayName: name });
    }
    state.userProfile = { ...state.userProfile, displayName: name, role, phone };
    applyProfile();
    closeModal('profileEditModal');
    toast('프로필이 저장되었습니다');
  } catch (e) {
    console.error('[profile-edit] 실패:', e.code || e.message);
    toast('저장 실패: ' + (e.code || e.message));
  } finally {
    btn.disabled = false;
    btn.textContent = '저장';
  }
});


// ===== 실시간 리스너 =====
let listenersAttached = false;
const _listenerUnsubs = [];

// http(s) URL만 허용해 javascript: / data: / vbscript: 등 위험한 스킴 차단
function safeImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url, location.href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  } catch {
    return '';
  }
}

function onValueWithError(path, handler) {
  const unsub = onValue(ref(db, path), handler, (err) => {
    console.error(`[home] ${path} 읽기 실패:`, err.code || err.message);
  });
  _listenerUnsubs.push(unsub);
  return unsub;
}

function detachListeners() {
  _listenerUnsubs.forEach((fn) => { try { fn(); } catch {} });
  _listenerUnsubs.length = 0;
  listenersAttached = false;
}

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  onValueWithError('rooms', (snap) => {
    state.rooms = [];
    snap.forEach((c) => { state.rooms.push({ id: c.key, ...c.val() }); });
    state.rooms.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (state.currentTab === 'community') renderRooms();
  });

  onValueWithError('prayers', (snap) => {
    state.prayers = [];
    snap.forEach((c) => { state.prayers.push({ id: c.key, ...c.val() }); });
    state.prayers.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderPrayers();
  });

  onValueWithError('announcements', (snap) => {
    state.announcements = [];
    snap.forEach((c) => { state.announcements.push({ id: c.key, ...c.val() }); });
    state.announcements.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderAnnouncements();
  });

  onValueWithError('sermons/current', (snap) => {
    if (!snap.exists()) return;
    renderSermon(snap.val());
  });

  onValueWithError('sermons/history', (snap) => {
    state.sermonHistory = [];
    snap.forEach((c) => { state.sermonHistory.push({ id: c.key, ...c.val() }); });
    state.sermonHistory.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderSermonHistory();
  });

  onValueWithError('bulletins', (snap) => {
    state.bulletins = [];
    snap.forEach((c) => { state.bulletins.push({ id: c.key, ...c.val() }); });
    state.bulletins.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderBulletins();
  });
  onValueWithError('config/church', (snap) => {
    state.church = snap.val() || {};
    applyChurchInfo();
  });
  _listenerUnsubs.push(onValue(ref(db, 'config/services'), (snap) => {
    state.services = [];
    snap.forEach((c) => { state.services.push({ id: c.key, ...c.val() }); });
    state.services.sort((a, b) => (serviceFirstDay(a) - serviceFirstDay(b)) || (a.time || '').localeCompare(b.time || ''));
    renderServiceTimes();
  }, (err) => {
    console.error('[home] config/services 읽기 실패:', err.code || err.message, err);
    const list = document.getElementById('serviceList');
    if (list) list.innerHTML = `<div class="service-empty">⚠️ 예배 시간을 불러오지 못했습니다 (${err.code || '권한 오류'})</div>`;
  }));
  onValueWithError('config/hero', (snap) => {
    state.hero = snap.val() || null;
    applyHero();
  });

  onValueWithError('events', (snap) => {
    state.events = [];
    snap.forEach((c) => { state.events.push({ id: c.key, ...c.val() }); });
    state.events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (state.currentTab === 'calendar') renderCalendar();
    else renderUpcomingEvents();
  });

  onValueWithError('posts', (snap) => {
    state.posts = [];
    snap.forEach((c) => { state.posts.push({ id: c.key, ...c.val() }); });
    state.posts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderPosts();
    // 상세 모달이 열려있으면 해당 글의 좋아요/댓글 수 새로고침
    if (state.currentPostId) {
      const p = state.posts.find((x) => x.id === state.currentPostId);
      if (p) {
        const lc = document.getElementById('postDetailLikeCount');
        const cc = document.getElementById('postDetailCommentCount');
        if (lc) lc.textContent = p.likeCount || 0;
        if (cc) cc.textContent = p.commentCount || 0;
      }
    }
  });
}

function applyHero() {
  const hero = document.querySelector('.hero');
  const img = document.getElementById('heroImg');
  if (!hero || !img) return;
  const url = safeImageUrl(state.hero?.url);
  if (url) {
    img.src = url;
    hero.classList.add('has-custom-img');
  } else {
    img.src = '/img/hero.jpg';
    hero.classList.remove('has-custom-img');
  }
}

function applyLogo() {
  const url = safeImageUrl(state.church?.logoUrl);
  document.querySelectorAll('.brand-mark').forEach((mark) => {
    const txt = mark.querySelector('.brand-mark-text');
    let img = mark.querySelector('img');
    if (url) {
      if (!img) {
        img = document.createElement('img');
        img.alt = '교회 로고';
        mark.appendChild(img);
      }
      img.src = url;
      if (txt) txt.style.display = 'none';
      mark.classList.add('has-logo');
    } else {
      if (img) img.remove();
      if (txt) txt.style.display = '';
      mark.classList.remove('has-logo');
    }
  });
}

function applyChurchInfo() {
  const c = state.church || {};
  document.querySelectorAll('[data-church="name"]').forEach((el) => { el.textContent = c.name || '천안남산교회'; });
  applyLogo();
  fillLegalModals();
  document.querySelectorAll('[data-church="pastor"]').forEach((el) => { el.textContent = c.pastor || ''; });
  document.querySelectorAll('[data-church="phone"]').forEach((el) => {
    el.textContent = c.phone || '';
    if (el.tagName === 'A' && c.phone) el.href = `tel:${c.phone.replace(/[^\d+]/g, '')}`;
  });
  document.querySelectorAll('[data-church="email"]').forEach((el) => {
    el.textContent = c.email || '';
    if (el.tagName === 'A' && c.email) el.href = `mailto:${c.email}`;
  });
  document.querySelectorAll('[data-church="address"]').forEach((el) => { el.textContent = c.address || ''; });
  document.querySelectorAll('[data-church="directions"]').forEach((el) => { el.textContent = c.directions || ''; });
  document.querySelectorAll('[data-church="tagline"]').forEach((el) => {
    if (c.tagline) el.textContent = c.tagline;
  });
  document.querySelectorAll('[data-church="subtitle"]').forEach((el) => {
    el.textContent = c.subtitle || '';
    el.style.display = c.subtitle ? '' : 'none';
  });
}

async function loadMyPrayedFlags() {
  if (!state.uid) return;
  // 사용자별 prayed 플래그를 한 번에 조회 (간단히 prayedBy 전체 노드)
  const prayedSnap = await get(ref(db, 'prayedBy'));
  state.prayedBy = {};
  if (prayedSnap.exists()) {
    prayedSnap.forEach((p) => {
      if (p.child(state.uid).exists()) state.prayedBy[p.key] = true;
    });
  }
  renderPrayers();
}

async function loadMyPostLikes() {
  if (!state.uid) return;
  try {
    const snap = await get(ref(db, 'postLikes'));
    state.postLikes = {};
    if (snap.exists()) {
      snap.forEach((p) => {
        if (p.child(state.uid).exists()) state.postLikes[p.key] = true;
      });
    }
    renderPosts();
  } catch (e) {
    console.warn('[posts] postLikes 조회 실패:', e.code);
  }
}

// ===== 탭 전환 =====
function switchTab(name) {
  state.currentTab = name;
  // 옛 라우팅 호환: prayer/share → community
  if (name === 'prayer' || name === 'share') name = 'community';
  state.currentTab = name;
  document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
  document.getElementById('tab-' + name)?.classList.add('active');
  document.querySelectorAll('.tabbar-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (name === 'community') renderRooms();
  if (name === 'calendar') renderCalendar();
  const url = new URL(location.href);
  url.searchParams.set('tab', name);
  history.replaceState(null, '', url);
}

document.querySelectorAll('.tabbar-item').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
document.querySelectorAll('[data-go]').forEach((el) => {
  el.addEventListener('click', () => switchTab(el.dataset.go));
});

// 공동체 탭 안 서브탭 (기도제목 / 재능나눔 / 교회 신청)
document.querySelectorAll('[data-ctab]').forEach((b) => {
  b.addEventListener('click', () => {
    const target = b.dataset.ctab;
    document.querySelectorAll('[data-ctab]').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('[data-cpane]').forEach((p) => p.classList.toggle('active', p.dataset.cpane === target));
  });
});

const params = new URLSearchParams(location.search);
const initTab = params.get('tab');
if (initTab && document.getElementById('tab-' + initTab)) switchTab(initTab);

// ===== 토스트 =====
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ===== 모달 =====
// 모달이 열릴 때 자동으로 프로필을 채울 폼 매핑
const PROFILE_AUTOFILL_MAP = {
  visitModal:     { name: 'vtName', phone: 'vtPhone' },
  newcomerModal:  { name: 'ncName', phone: 'ncPhone' },
  volunteerModal: { name: 'vName',  phone: 'vPhone'  },
  roomApplyModal: { name: 'raName', phone: 'raPhone' },
  eventApplyModal:{ name: 'eaName', phone: 'eaPhone' },
  checkinModal:   { name: 'ciName' }
};

// 모달이 닫힐 때 자동으로 폼/state를 정리할 항목
// (보안 + UX: 다음 사용자가 열었을 때 이전 값이 남지 않도록)
const MODAL_AUTORESET = {
  prayerModal:        () => { state.editingPrayerId = null; },
  postComposeModal:   () => { state.editingPostId = null; state.pendingPostImages = []; },
  postDetailModal:    () => { state.currentPostId = null; },
  devotionModal:      () => { state.editingNoteKey = null; },
  sermonViewerModal:  (m) => { const f = m.querySelector('iframe'); if (f) f.src = ''; }
};

let _modalStack = 0;
function openModal(id) {
  const m = document.getElementById(id);
  if (!m || m.classList.contains('show')) return;
  m.classList.add('show');
  _modalStack++;
  document.body.style.overflow = 'hidden';
  // 신청 폼이면 프로필 자동 입력
  const map = PROFILE_AUTOFILL_MAP[id];
  if (map) autofillFromProfile(map);
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (!m || !m.classList.contains('show')) return;
  m.classList.remove('show');
  _modalStack = Math.max(0, _modalStack - 1);
  if (_modalStack === 0) document.body.style.overflow = '';
  // 보안: 비밀번호 자동 초기화
  m.querySelectorAll('input[type="password"]').forEach((i) => { i.value = ''; });
  // 모달별 추가 정리 (편집 모드 해제, iframe 정지 등)
  const cleanup = MODAL_AUTORESET[id];
  if (cleanup) try { cleanup(m); } catch {}
}
document.querySelectorAll('[data-modal]').forEach((el) => {
  el.addEventListener('click', (e) => { e.preventDefault(); openModal(el.dataset.modal); });
});
document.querySelectorAll('[data-close]').forEach((el) => {
  el.addEventListener('click', () => closeModal(el.dataset.close));
});
document.querySelectorAll('.modal-bg').forEach((m) => {
  m.addEventListener('click', (e) => { if (e.target === m) closeModal(m.id); });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-bg.show').forEach((m) => closeModal(m.id));
});

// ===== 예배 시간표 =====
const DAY_NAMES_KO = ['일','월','화','수','목','금','토'];

// 접기/펼치기 토글
(function setupServiceTimesToggle() {
  const head = document.getElementById('serviceTimesToggle');
  const wrap = document.getElementById('serviceTimes');
  if (!head || !wrap) return;
  head.addEventListener('click', () => {
    const open = wrap.classList.toggle('open');
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    const label = head.querySelector('.toggle-label');
    if (label) label.textContent = open ? '접기' : '예배시간 보기';
  });
})();

function formatHM(time) {
  const [hh, mm] = (time || '11:00').split(':').map(Number);
  const ampm = hh < 12 ? '오전' : '오후';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${ampm} ${h12}:${String(mm).padStart(2, '0')}`;
}

function formatDays(s) {
  // 새 포맷: days 배열 / 옛 포맷: day 단일
  let arr = [];
  if (Array.isArray(s.days) && s.days.length) {
    arr = s.days.map(Number).filter((d) => !isNaN(d));
  } else if (typeof s.day === 'number' || typeof s.day === 'string') {
    const d = Number(s.day);
    if (!isNaN(d)) arr = [d];
  }
  if (!arr.length) return '';
  if (arr.length === 1) return `${DAY_NAMES_KO[arr[0]]}요일`;
  const sorted = [...new Set(arr)].sort((a, b) => a - b);
  // 연속 구간 검사
  let isRange = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) { isRange = false; break; }
  }
  if (isRange) return `${DAY_NAMES_KO[sorted[0]]}~${DAY_NAMES_KO[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => DAY_NAMES_KO[d]).join('·');
}

function serviceFirstDay(s) {
  if (Array.isArray(s.days) && s.days.length) return Math.min(...s.days.map(Number));
  return Number(s.day) || 0;
}

function renderServiceTimes() {
  const list = document.getElementById('serviceList');
  if (!list) return;
  const services = state.services || [];
  if (!services.length) {
    list.innerHTML = '<div class="service-empty">예배 시간이 곧 안내됩니다</div>';
    return;
  }
  list.innerHTML = `<table class="service-table">
    <thead><tr><th class="col-name">예배명</th><th class="col-day">요일</th><th class="col-time">시간</th></tr></thead>
    <tbody>${services.map((s) => `
      <tr>
        <td>
          <div class="col-name">${escapeHtml(s.name)}</div>
          ${s.place ? `<div class="col-place">${escapeHtml(s.place)}</div>` : ''}
        </td>
        <td class="col-day">${escapeHtml(formatDays(s))}</td>
        <td class="col-time">${formatHM(s.time)}</td>
      </tr>
    `).join('')}</tbody>
  </table>`;
}

// ===== 오늘의 말씀 (365개 개역개정 큐레이션) =====
const DAILY_VERSES = [
  // ===== 시편 =====
  { ref: '시편 1:1-2', text: '복 있는 사람은 악인들의 꾀를 따르지 아니하며 죄인들의 길에 서지 아니하며 오만한 자들의 자리에 앉지 아니하고 오직 여호와의 율법을 즐거워하여 그의 율법을 주야로 묵상하는도다.' },
  { ref: '시편 1:3', text: '그는 시냇가에 심은 나무가 철을 따라 열매를 맺으며 그 잎사귀가 마르지 아니함 같으니 그가 하는 모든 일이 다 형통하리로다.' },
  { ref: '시편 4:8', text: '내가 평안히 눕고 자기도 하리니 나를 안전히 살게 하시는 이는 오직 여호와이시니이다.' },
  { ref: '시편 8:4', text: '사람이 무엇이기에 주께서 그를 생각하시며 인자가 무엇이기에 주께서 그를 돌보시나이까.' },
  { ref: '시편 16:8', text: '내가 여호와를 항상 내 앞에 모심이여 그가 나의 오른쪽에 계시므로 내가 흔들리지 아니하리로다.' },
  { ref: '시편 16:11', text: '주께서 생명의 길을 내게 보이시리니 주의 앞에는 충만한 기쁨이 있고 주의 오른쪽에는 영원한 즐거움이 있나이다.' },
  { ref: '시편 18:1-2', text: '나의 힘이신 여호와여 내가 주를 사랑하나이다 여호와는 나의 반석이시요 나의 요새시요 나를 건지시는 이시요 나의 하나님이시요 내가 그 안에 피할 나의 바위시요 나의 방패시요 나의 구원의 뿔이시요 나의 산성이시로다.' },
  { ref: '시편 19:1', text: '하늘이 하나님의 영광을 선포하고 궁창이 그의 손으로 하신 일을 나타내는도다.' },
  { ref: '시편 19:7', text: '여호와의 율법은 완전하여 영혼을 소성시키며 여호와의 증거는 확실하여 우둔한 자를 지혜롭게 하며.' },
  { ref: '시편 19:14', text: '나의 반석이시요 나의 구속자이신 여호와여 내 입의 말과 마음의 묵상이 주님 앞에 열납되기를 원하나이다.' },
  { ref: '시편 23:1', text: '여호와는 나의 목자시니 내게 부족함이 없으리로다.' },
  { ref: '시편 23:3', text: '내 영혼을 소생시키시고 자기 이름을 위하여 의의 길로 인도하시는도다.' },
  { ref: '시편 23:4', text: '내가 사망의 음침한 골짜기로 다닐지라도 해를 두려워하지 않을 것은 주께서 나와 함께 하심이라 주의 지팡이와 막대기가 나를 안위하시나이다.' },
  { ref: '시편 23:6', text: '내 평생에 선하심과 인자하심이 반드시 나를 따르리니 내가 여호와의 집에 영원히 살리로다.' },
  { ref: '시편 25:4-5', text: '여호와여 주의 도를 내게 보이시고 주의 길을 내게 가르치소서 주의 진리로 나를 지도하시고 교훈하소서 주는 내 구원의 하나님이시니 내가 종일 주를 기다리나이다.' },
  { ref: '시편 27:1', text: '여호와는 나의 빛이요 나의 구원이시니 내가 누구를 두려워하리요 여호와는 내 생명의 능력이시니 내가 누구를 무서워하리요.' },
  { ref: '시편 27:4', text: '내가 여호와께 바라는 한 가지 일 그것을 구하리니 곧 내가 내 평생에 여호와의 집에 살면서 여호와의 아름다움을 바라보며 그의 성전에서 사모하는 그것이라.' },
  { ref: '시편 27:14', text: '너는 여호와를 기다릴지어다 강하고 담대하며 여호와를 기다릴지어다.' },
  { ref: '시편 28:7', text: '여호와는 나의 힘과 나의 방패이시니 내 마음이 그를 의지하여 도움을 얻었도다 그러므로 내 마음이 크게 기뻐하며 내 노래로 그를 찬송하리로다.' },
  { ref: '시편 30:5', text: '그의 노여움은 잠깐이요 그의 은총은 평생이로다 저녁에는 울음이 깃들일지라도 아침에는 기쁨이 오리로다.' },
  { ref: '시편 31:24', text: '여호와를 바라는 너희들아 강하고 담대하라.' },
  { ref: '시편 32:8', text: '내가 네 갈 길을 가르쳐 보이고 너를 주목하여 훈계하리로다.' },
  { ref: '시편 33:18', text: '여호와는 그를 경외하는 자 곧 그의 인자하심을 바라는 자를 살피사.' },
  { ref: '시편 34:8', text: '너희는 여호와의 선하심을 맛보아 알지어다 그에게 피하는 자는 복이 있도다.' },
  { ref: '시편 34:18', text: '여호와는 마음이 상한 자를 가까이 하시고 충심으로 통회하는 자를 구원하시는도다.' },
  { ref: '시편 37:4', text: '또 여호와를 기뻐하라 그가 네 마음의 소원을 네게 이루어 주시리로다.' },
  { ref: '시편 37:5', text: '네 길을 여호와께 맡기라 그를 의지하면 그가 이루시고.' },
  { ref: '시편 37:7', text: '여호와 앞에 잠잠하고 참고 기다리라 자기 길이 형통하며 악한 꾀를 이루는 자 때문에 불평하지 말지어다.' },
  { ref: '시편 37:23-24', text: '여호와께서 사람의 걸음을 정하시고 그의 길을 기뻐하시나니 그는 넘어지나 아주 엎드러지지 아니함은 여호와께서 그의 손으로 붙드심이로다.' },
  { ref: '시편 40:1-2', text: '내가 여호와를 기다리고 기다렸더니 귀를 기울이사 나의 부르짖음을 들으셨도다 나를 기가 막힐 웅덩이와 수렁에서 끌어올리시고 내 발을 반석 위에 두사 내 걸음을 견고하게 하셨도다.' },
  { ref: '시편 42:1-2', text: '하나님이여 사슴이 시냇물을 찾기에 갈급함같이 내 영혼이 주를 찾기에 갈급하니이다 내 영혼이 하나님 곧 살아 계시는 하나님을 갈망하나니 내가 어느 때에 나아가서 하나님의 얼굴을 뵈올까.' },
  { ref: '시편 42:11', text: '내 영혼아 네가 어찌하여 낙심하며 어찌하여 내 속에서 불안해 하는가 너는 하나님께 소망을 두라 그가 나타나 도우심으로 말미암아 내 하나님을 여전히 찬송하리로다.' },
  { ref: '시편 46:1', text: '하나님은 우리의 피난처시요 힘이시니 환난 중에 만날 큰 도움이시라.' },
  { ref: '시편 46:10', text: '너희는 가만히 있어 내가 하나님 됨을 알지어다 내가 뭇 나라 중에서 높임을 받으리라 내가 세계 중에서 높임을 받으리라 하시도다.' },
  { ref: '시편 51:10', text: '하나님이여 내 속에 정한 마음을 창조하시고 내 안에 정직한 영을 새롭게 하소서.' },
  { ref: '시편 51:17', text: '하나님께서 구하시는 제사는 상한 심령이라 하나님이여 상하고 통회하는 마음을 주께서 멸시하지 아니하시리이다.' },
  { ref: '시편 55:22', text: '네 짐을 여호와께 맡기라 그가 너를 붙드시고 의인의 요동함을 영원히 허락하지 아니하시리로다.' },
  { ref: '시편 56:3-4', text: '내가 두려워하는 날에는 내가 주를 의지하리이다 내가 하나님을 의지하고 그 말씀을 찬송할지라 내가 하나님을 의지하였은즉 두려워하지 아니하리니 혈육을 가진 사람이 내게 어찌하리이까.' },
  { ref: '시편 62:1-2', text: '나의 영혼이 잠잠히 하나님만 바람이여 나의 구원이 그에게서 나오는도다 오직 그만이 나의 반석이시요 나의 구원이시요 나의 요새이시니 내가 크게 흔들리지 아니하리로다.' },
  { ref: '시편 62:8', text: '백성들아 시시로 그를 의지하고 그의 앞에 마음을 토하라 하나님은 우리의 피난처시로다.' },
  { ref: '시편 63:1', text: '하나님이여 주는 나의 하나님이시라 내가 간절히 주를 찾되 물이 없어 마르고 황폐한 땅에서 내 영혼이 주를 갈망하며 내 육체가 주를 앙모하나이다.' },
  { ref: '시편 63:3', text: '주의 인자하심이 생명보다 나으므로 내 입술이 주를 찬양할 것이라.' },
  { ref: '시편 73:25-26', text: '하늘에서는 주 외에 누가 내게 있으리요 땅에서는 주 밖에 내가 사모할 이 없나이다 내 육체와 마음은 쇠약하나 하나님은 내 마음의 반석이시요 영원한 분깃이시라.' },
  { ref: '시편 84:10', text: '주의 궁정에서의 한 날이 다른 곳에서의 천 날보다 나은즉 악인의 장막에 사는 것보다 내 하나님의 성전 문지기로 있는 것이 좋사오니.' },
  { ref: '시편 86:5', text: '주는 선하사 사죄하기를 즐거워하시며 주께 부르짖는 자에게 인자함이 후하심이니이다.' },
  { ref: '시편 86:11', text: '여호와여 주의 도를 내게 가르치소서 내가 주의 진리에 행하오리니 일심으로 주의 이름을 경외하게 하소서.' },
  { ref: '시편 90:12', text: '우리에게 우리 날 계수함을 가르치사 지혜로운 마음을 얻게 하소서.' },
  { ref: '시편 90:14', text: '아침에 주의 인자하심이 우리를 만족하게 하사 우리를 일생 동안 즐겁고 기쁘게 하소서.' },
  { ref: '시편 91:1-2', text: '지존자의 은밀한 곳에 거주하며 전능자의 그늘 아래에 사는 자여 나는 여호와를 향하여 말하기를 그는 나의 피난처요 나의 요새요 내가 의뢰하는 하나님이라 하리로다.' },
  { ref: '시편 91:4', text: '그가 너를 그의 깃으로 덮으시리니 네가 그의 날개 아래에 피하리로다 그의 진실함은 방패와 손 방패가 되시나니.' },
  { ref: '시편 91:11', text: '그가 너를 위하여 그의 천사들을 명령하사 네 모든 길에서 너를 지키게 하심이라.' },
  { ref: '시편 94:19', text: '내 속에 근심이 많을 때에 주의 위안이 내 영혼을 즐겁게 하시나이다.' },
  { ref: '시편 95:6-7', text: '오라 우리가 굽혀 경배하며 우리를 지으신 여호와 앞에 무릎을 꿇자 그는 우리의 하나님이시요 우리는 그가 기르시는 백성이며 그의 손이 돌보시는 양이기 때문이라.' },
  { ref: '시편 100:2', text: '기쁨으로 여호와를 섬기며 노래하면서 그의 앞에 나아갈지어다.' },
  { ref: '시편 100:4-5', text: '감사함으로 그의 문에 들어가며 찬송함으로 그의 궁정에 들어가서 그에게 감사하며 그의 이름을 송축할지어다 여호와는 선하시니 그의 인자하심이 영원하고 그의 성실하심이 대대에 이르리로다.' },
  { ref: '시편 103:1-2', text: '내 영혼아 여호와를 송축하라 내 속에 있는 것들아 다 그의 거룩한 이름을 송축하라 내 영혼아 여호와를 송축하며 그의 모든 은택을 잊지 말지어다.' },
  { ref: '시편 103:8', text: '여호와는 긍휼이 많으시고 은혜로우시며 노하기를 더디 하시고 인자하심이 풍부하시도다.' },
  { ref: '시편 103:13', text: '아버지가 자식을 긍휼히 여김 같이 여호와께서는 자기를 경외하는 자를 긍휼히 여기시나니.' },
  { ref: '시편 116:7', text: '내 영혼아 네 평안함으로 돌아갈지어다 여호와께서 너를 후대하심이로다.' },
  { ref: '시편 118:24', text: '이 날은 여호와께서 정하신 것이라 이 날에 우리가 즐거워하고 기뻐하리로다.' },
  { ref: '시편 119:11', text: '내가 주께 범죄하지 아니하려 하여 주의 말씀을 내 마음에 두었나이다.' },
  { ref: '시편 119:18', text: '내 눈을 열어서 주의 율법에서 놀라운 것을 보게 하소서.' },
  { ref: '시편 119:50', text: '이 말씀은 나의 고난 중의 위로라 주의 말씀이 나를 살리셨기 때문이니이다.' },
  { ref: '시편 119:71', text: '고난 당한 것이 내게 유익이라 이로 말미암아 내가 주의 율례들을 배우게 되었나이다.' },
  { ref: '시편 119:89', text: '여호와여 주의 말씀은 영원히 하늘에 굳게 섰사오며.' },
  { ref: '시편 119:103', text: '주의 말씀의 맛이 내게 어찌 그리 단지요 내 입에 꿀보다 더 다니이다.' },
  { ref: '시편 119:105', text: '주의 말씀은 내 발에 등이요 내 길에 빛이니이다.' },
  { ref: '시편 121:1-2', text: '내가 산을 향하여 눈을 들리라 나의 도움이 어디서 올까 나의 도움은 천지를 지으신 여호와에게서로다.' },
  { ref: '시편 121:7-8', text: '여호와께서 너를 지켜 모든 환난을 면하게 하시며 또 네 영혼을 지키시리로다 여호와께서 너의 출입을 지금부터 영원까지 지키시리로다.' },
  { ref: '시편 126:5-6', text: '눈물을 흘리며 씨를 뿌리는 자는 기쁨으로 거두리로다 울며 씨를 뿌리러 나가는 자는 반드시 기쁨으로 그 곡식 단을 가지고 돌아오리로다.' },
  { ref: '시편 127:1', text: '여호와께서 집을 세우지 아니하시면 세우는 자의 수고가 헛되며 여호와께서 성을 지키지 아니하시면 파수꾼의 깨어 있음이 헛되도다.' },
  { ref: '시편 130:5', text: '나 곧 내 영혼은 여호와를 기다리며 나는 주의 말씀을 바라는도다.' },
  { ref: '시편 138:8', text: '여호와께서 내게 관계된 것을 완전하게 하실지라 여호와여 주의 인자하심이 영원하오니 주의 손으로 지으신 것을 버리지 마옵소서.' },
  { ref: '시편 139:1-3', text: '여호와여 주께서 나를 살펴 보셨으므로 나를 아시나이다 주께서 내가 앉고 일어섬을 아시고 멀리서도 나의 생각을 밝히 아시오며 나의 모든 길과 내가 눕는 것을 살펴 보셨으므로 나의 모든 행위를 익히 아시오니.' },
  { ref: '시편 139:14', text: '내가 주께 감사하옴은 나를 지으심이 심히 기묘하심이라 주께서 하시는 일이 기이함을 내 영혼이 잘 아나이다.' },
  { ref: '시편 139:23-24', text: '하나님이여 나를 살피사 내 마음을 아시며 나를 시험하사 내 뜻을 아옵소서 내게 무슨 악한 행위가 있나 보시고 나를 영원한 길로 인도하소서.' },
  { ref: '시편 143:8', text: '아침에 나로 하여금 주의 인자한 말씀을 듣게 하소서 내가 주를 의뢰함이니이다 내가 다닐 길을 알게 하소서 내가 내 영혼을 주께 드림이니이다.' },
  { ref: '시편 145:8-9', text: '여호와는 은혜로우시며 긍휼이 많으시며 노하기를 더디 하시며 인자하심이 크시도다 여호와께서는 모든 것을 선대하시며 그가 지으신 모든 것에 긍휼을 베푸시는도다.' },
  { ref: '시편 145:18', text: '여호와께서는 자기에게 간구하는 모든 자 곧 진실하게 간구하는 모든 자에게 가까이 하시는도다.' },
  { ref: '시편 146:5', text: '야곱의 하나님을 자기의 도움으로 삼으며 여호와 자기 하나님에게 자기의 소망을 두는 자는 복이 있도다.' },
  { ref: '시편 147:3', text: '상심한 자들을 고치시며 그들의 상처를 싸매시는도다.' },
  { ref: '시편 150:6', text: '호흡이 있는 자마다 여호와를 찬양할지어다 할렐루야.' },

  // ===== 잠언 =====
  { ref: '잠언 1:7', text: '여호와를 경외하는 것이 지식의 근본이거늘 미련한 자는 지혜와 훈계를 멸시하느니라.' },
  { ref: '잠언 3:5-6', text: '너는 마음을 다하여 여호와를 신뢰하고 네 명철을 의지하지 말라 너는 범사에 그를 인정하라 그리하면 네 길을 지도하시리라.' },
  { ref: '잠언 3:9-10', text: '네 재물과 네 소산물의 처음 익은 열매로 여호와를 공경하라 그리하면 네 창고가 가득히 차고 네 포도즙 틀에 새 포도즙이 넘치리라.' },
  { ref: '잠언 3:27', text: '네 손이 선을 베풀 힘이 있거든 마땅히 받을 자에게 베풀기를 아끼지 말며.' },
  { ref: '잠언 4:23', text: '모든 지킬 만한 것 중에 더욱 네 마음을 지키라 생명의 근원이 이에서 남이니라.' },
  { ref: '잠언 9:10', text: '여호와를 경외하는 것이 지혜의 근본이요 거룩하신 자를 아는 것이 명철이니라.' },
  { ref: '잠언 11:25', text: '구제를 좋아하는 자는 풍족하여질 것이요 남을 윤택하게 하는 자는 자기도 윤택하여지리라.' },
  { ref: '잠언 12:25', text: '근심이 사람의 마음에 있으면 그것으로 번뇌하게 되나 선한 말은 그것을 즐겁게 하느니라.' },
  { ref: '잠언 15:1', text: '유순한 대답은 분노를 쉬게 하여도 과격한 말은 노를 격동하느니라.' },
  { ref: '잠언 15:13', text: '마음의 즐거움은 얼굴을 빛나게 하여도 마음의 근심은 심령을 상하게 하느니라.' },
  { ref: '잠언 16:3', text: '너의 행사를 여호와께 맡기라 그리하면 네가 경영하는 것이 이루어지리라.' },
  { ref: '잠언 16:9', text: '사람이 마음으로 자기의 길을 계획할지라도 그의 걸음을 인도하시는 이는 여호와시니라.' },
  { ref: '잠언 16:32', text: '노하기를 더디하는 자는 용사보다 낫고 자기의 마음을 다스리는 자는 성을 빼앗는 자보다 나으니라.' },
  { ref: '잠언 17:17', text: '친구는 사랑이 끊어지지 아니하고 형제는 위급한 때를 위하여 났느니라.' },
  { ref: '잠언 18:10', text: '여호와의 이름은 견고한 망대라 의인은 그리로 달려가서 안전함을 얻느니라.' },
  { ref: '잠언 19:21', text: '사람의 마음에는 많은 계획이 있어도 오직 여호와의 뜻만이 완전히 서리라.' },
  { ref: '잠언 22:6', text: '마땅히 행할 길을 아이에게 가르치라 그리하면 늙어도 그것을 떠나지 아니하리라.' },
  { ref: '잠언 27:17', text: '철이 철을 날카롭게 하는 것 같이 사람이 그의 친구의 얼굴을 빛나게 하느니라.' },
  { ref: '잠언 28:13', text: '자기의 죄를 숨기는 자는 형통하지 못하나 죄를 자복하고 버리는 자는 불쌍히 여김을 받으리라.' },
  { ref: '잠언 31:30', text: '고운 것도 거짓되고 아름다운 것도 헛되나 오직 여호와를 경외하는 여자는 칭찬을 받을 것이라.' },

  // ===== 전도서 / 아가 / 욥기 =====
  { ref: '전도서 3:1', text: '범사에 기한이 있고 천하 만사가 다 때가 있나니.' },
  { ref: '전도서 3:11', text: '하나님이 모든 것을 지으시되 때를 따라 아름답게 하셨고 또 사람들에게는 영원을 사모하는 마음을 주셨느니라.' },
  { ref: '전도서 4:9-10', text: '두 사람이 한 사람보다 나음은 그들이 수고함으로 좋은 상을 얻을 것임이라 혹시 그들이 넘어지면 하나가 그 동무를 붙들어 일으키려니와.' },
  { ref: '전도서 11:1', text: '너는 네 떡을 물 위에 던져라 여러 날 후에 도로 찾으리라.' },
  { ref: '전도서 12:1', text: '너는 청년의 때에 너의 창조주를 기억하라.' },
  { ref: '전도서 12:13', text: '일의 결국을 다 들었으니 하나님을 경외하고 그의 명령들을 지킬지어다 이것이 모든 사람의 본분이니라.' },
  { ref: '욥기 1:21', text: '내가 모태에서 알몸으로 나왔사온즉 또한 알몸이 그리로 돌아가올지라 주신 이도 여호와시요 거두신 이도 여호와시오니 여호와의 이름이 찬송을 받으실지니이다.' },
  { ref: '욥기 19:25', text: '내가 알기에는 나의 대속자가 살아 계시니 마침내 그가 땅 위에 서실 것이라.' },
  { ref: '욥기 23:10', text: '그러나 내가 가는 길을 그가 아시나니 그가 나를 단련하신 후에는 내가 순금 같이 되어 나오리라.' },

  // ===== 이사야 =====
  { ref: '이사야 1:18', text: '여호와께서 말씀하시되 오라 우리가 서로 변론하자 너희의 죄가 주홍 같을지라도 눈과 같이 희어질 것이요 진홍 같이 붉을지라도 양털 같이 되리라.' },
  { ref: '이사야 9:6', text: '한 아기가 우리에게 났고 한 아들을 우리에게 주신 바 되었는데 그의 어깨에는 정사를 메었고 그의 이름은 기묘자라, 모사라, 전능하신 하나님이라, 영존하시는 아버지라, 평강의 왕이라 할 것임이라.' },
  { ref: '이사야 12:2', text: '보라 하나님은 나의 구원이시라 내가 신뢰하고 두려움이 없으리니 주 여호와는 나의 힘이시며 나의 노래시며 나의 구원이심이라.' },
  { ref: '이사야 26:3', text: '주께서 심지가 견고한 자를 평강하고 평강하도록 지키시리니 이는 그가 주를 신뢰함이니이다.' },
  { ref: '이사야 30:15', text: '주 여호와 이스라엘의 거룩하신 이가 이같이 말씀하시되 너희가 돌이켜 조용히 있어야 구원을 얻을 것이요 잠잠하고 신뢰하여야 힘을 얻을 것이거늘.' },
  { ref: '이사야 40:8', text: '풀은 마르고 꽃은 시드나 우리 하나님의 말씀은 영원히 서리라.' },
  { ref: '이사야 40:29', text: '피곤한 자에게는 능력을 주시며 무능한 자에게는 힘을 더하시나니.' },
  { ref: '이사야 40:31', text: '오직 여호와를 앙망하는 자는 새 힘을 얻으리니 독수리가 날개치며 올라감 같을 것이요 달음박질하여도 곤비하지 아니하겠고 걸어가도 피곤하지 아니하리로다.' },
  { ref: '이사야 41:10', text: '두려워하지 말라 내가 너와 함께 함이라 놀라지 말라 나는 네 하나님이 됨이라 내가 너를 굳세게 하리라 참으로 너를 도와 주리라 참으로 나의 의로운 오른손으로 너를 붙들리라.' },
  { ref: '이사야 41:13', text: '이는 나 여호와 너의 하나님이 네 오른손을 붙들고 네게 이르기를 두려워하지 말라 내가 너를 도우리라 할 것임이니라.' },
  { ref: '이사야 43:1', text: '너는 두려워하지 말라 내가 너를 구속하였고 내가 너를 지명하여 불렀나니 너는 내 것이라.' },
  { ref: '이사야 43:2', text: '네가 물 가운데로 지날 때에 내가 너와 함께 할 것이라 강을 건널 때에 물이 너를 침몰하지 못할 것이며 네가 불 가운데로 지날 때에 타지도 아니할 것이요 불꽃이 너를 사르지도 못하리니.' },
  { ref: '이사야 43:18-19', text: '너희는 이전 일을 기억하지 말며 옛날 일을 생각하지 말라 보라 내가 새 일을 행하리니 이제 나타낼 것이라 너희가 그것을 알지 못하겠느냐.' },
  { ref: '이사야 53:5', text: '그가 찔림은 우리의 허물 때문이요 그가 상함은 우리의 죄악 때문이라 그가 징계를 받으므로 우리는 평화를 누리고 그가 채찍에 맞으므로 우리는 나음을 받았도다.' },
  { ref: '이사야 53:6', text: '우리는 다 양 같아서 그릇 행하여 각기 제 길로 갔거늘 여호와께서는 우리 모두의 죄악을 그에게 담당시키셨도다.' },
  { ref: '이사야 55:6-7', text: '너희는 여호와를 만날 만한 때에 찾으라 가까이 계실 때에 그를 부르라 악인은 그의 길을, 불의한 자는 그의 생각을 버리고 여호와께로 돌아오라 그리하면 그가 긍휼히 여기시리라.' },
  { ref: '이사야 55:8-9', text: '내 생각이 너희의 생각과 다르며 내 길은 너희의 길과 다름이니라 이는 하늘이 땅보다 높음 같이 내 길은 너희의 길보다 높으며 내 생각은 너희의 생각보다 높음이니라.' },
  { ref: '이사야 55:11', text: '내 입에서 나가는 말도 헛되이 내게로 되돌아오지 아니하고 나의 기뻐하는 뜻을 이루며 내가 보낸 일에 형통함이니라.' },
  { ref: '이사야 60:1', text: '일어나라 빛을 발하라 이는 네 빛이 이르렀고 여호와의 영광이 네 위에 임하였음이니라.' },
  { ref: '이사야 61:1', text: '주 여호와의 영이 내게 내리셨으니 이는 여호와께서 내게 기름을 부으사 가난한 자에게 아름다운 소식을 전하게 하려 하심이라 나를 보내사 마음이 상한 자를 고치며 포로된 자에게 자유를, 갇힌 자에게 놓임을 선포하며.' },

  // ===== 예레미야 / 애가 / 다른 선지서 =====
  { ref: '예레미야 1:5', text: '내가 너를 모태에 짓기 전에 너를 알았고 네가 배에서 나오기 전에 너를 성별하였고 너를 여러 나라의 선지자로 세웠노라.' },
  { ref: '예레미야 17:7-8', text: '그러나 무릇 여호와를 의지하며 여호와를 의뢰하는 그 사람은 복을 받을 것이라 그는 물 가에 심어진 나무가 그 뿌리를 강변에 뻗치고 더위가 올지라도 두려워하지 아니하며.' },
  { ref: '예레미야 29:11', text: '여호와의 말씀이니라 너희를 향한 나의 생각을 내가 아나니 평안이요 재앙이 아니니라 너희에게 미래와 희망을 주는 것이니라.' },
  { ref: '예레미야 29:12-13', text: '너희가 내게 부르짖으며 내게 와서 기도하면 내가 너희들의 기도를 들을 것이요 너희가 온 마음으로 나를 구하면 나를 찾을 것이요 나를 만나리라.' },
  { ref: '예레미야 33:3', text: '너는 내게 부르짖으라 내가 네게 응답하겠고 네가 알지 못하는 크고 은밀한 일을 네게 보이리라.' },
  { ref: '예레미야애가 3:22-23', text: '여호와의 인자와 긍휼이 무궁하시므로 우리가 진멸되지 아니함이니이다 이것들이 아침마다 새로우니 주의 성실하심이 크시도소이다.' },
  { ref: '예레미야애가 3:25-26', text: '기다리는 자들에게나 구하는 영혼들에게 여호와는 선하시도다 사람이 여호와의 구원을 바라고 잠잠히 기다림이 좋도다.' },
  { ref: '에스겔 36:26', text: '또 새 영을 너희 속에 두고 새 마음을 너희에게 주되 너희 육신에서 굳은 마음을 제거하고 부드러운 마음을 줄 것이며.' },
  { ref: '미가 6:8', text: '사람아 주께서 선한 것이 무엇임을 네게 보이셨나니 여호와께서 네게 구하시는 것이 오직 정의를 행하며 인자를 사랑하며 겸손하게 네 하나님과 함께 행하는 것이 아니냐.' },
  { ref: '하박국 3:17-18', text: '비록 무화과나무가 무성하지 못하며 포도나무에 열매가 없으며 감람나무에 소출이 없을지라도 나는 여호와로 말미암아 즐거워하며 나의 구원의 하나님으로 말미암아 기뻐하리로다.' },
  { ref: '스바냐 3:17', text: '너의 하나님 여호와가 너의 가운데에 계시니 그는 구원을 베푸실 전능자이시라 그가 너로 말미암아 기쁨을 이기지 못하시며 너를 잠잠히 사랑하시며 너로 말미암아 즐거이 부르며 기뻐하시리라.' },
  { ref: '말라기 3:10', text: '만군의 여호와가 이르노라 너희의 온전한 십일조를 창고에 들여 나의 집에 양식이 있게 하고 그것으로 나를 시험하여 내가 하늘 문을 열고 너희에게 복을 쌓을 곳이 없도록 붓지 아니하나 보라.' },

  // ===== 모세오경 / 역사서 =====
  { ref: '창세기 1:1', text: '태초에 하나님이 천지를 창조하시니라.' },
  { ref: '창세기 1:27', text: '하나님이 자기 형상 곧 하나님의 형상대로 사람을 창조하시되 남자와 여자를 창조하시고.' },
  { ref: '창세기 12:2-3', text: '내가 너로 큰 민족을 이루고 네게 복을 주어 네 이름을 창대하게 하리니 너는 복이 될지라 너를 축복하는 자에게는 내가 복을 내리고 너를 저주하는 자에게는 내가 저주하리니 땅의 모든 족속이 너로 말미암아 복을 얻을 것이라.' },
  { ref: '창세기 28:15', text: '내가 너와 함께 있어 네가 어디로 가든지 너를 지키며 너를 이끌어 이 땅으로 돌아오게 할지라.' },
  { ref: '창세기 50:20', text: '당신들은 나를 해하려 하였으나 하나님은 그것을 선으로 바꾸사 오늘과 같이 많은 백성의 생명을 구원하게 하시려 하셨나니.' },
  { ref: '출애굽기 14:14', text: '여호와께서 너희를 위하여 싸우시리니 너희는 가만히 있을지니라.' },
  { ref: '출애굽기 15:2', text: '여호와는 나의 힘이요 노래시며 나의 구원이시로다 그는 나의 하나님이시니 내가 그를 찬송할 것이요.' },
  { ref: '출애굽기 20:12', text: '네 부모를 공경하라 그리하면 네 하나님 여호와가 네게 준 땅에서 네 생명이 길리라.' },
  { ref: '출애굽기 33:14', text: '여호와께서 이르시되 내가 친히 가리라 내가 너를 쉬게 하리라.' },
  { ref: '레위기 19:18', text: '원수를 갚지 말며 동포를 원망하지 말며 네 이웃 사랑하기를 네 자신과 같이 사랑하라 나는 여호와이니라.' },
  { ref: '민수기 6:24-26', text: '여호와는 네게 복을 주시고 너를 지키시기를 원하며 여호와는 그의 얼굴을 네게 비추사 은혜 베푸시기를 원하며 여호와는 그 얼굴을 네게로 향하여 드사 평강 주시기를 원하노라.' },
  { ref: '신명기 6:5', text: '너는 마음을 다하고 뜻을 다하고 힘을 다하여 네 하나님 여호와를 사랑하라.' },
  { ref: '신명기 6:6-7', text: '오늘 내가 네게 명하는 이 말씀을 너는 마음에 새기고 네 자녀에게 부지런히 가르치며 집에 앉았을 때에든지 길을 갈 때에든지 누워 있을 때에든지 일어날 때에든지 이 말씀을 강론할 것이며.' },
  { ref: '신명기 31:6', text: '너희는 강하고 담대하라 두려워하지 말라 그들 앞에서 떨지 말라 이는 네 하나님 여호와 그가 너와 함께 가시며 결코 너를 떠나지 아니하시며 버리지 아니하실 것임이라.' },
  { ref: '여호수아 1:8', text: '이 율법책을 네 입에서 떠나지 말게 하며 주야로 그것을 묵상하여 그 안에 기록된 대로 다 지켜 행하라 그리하면 네 길이 평탄하게 될 것이며 네가 형통하리라.' },
  { ref: '여호수아 1:9', text: '내가 네게 명령한 것이 아니냐 강하고 담대하라 두려워하지 말며 놀라지 말라 네가 어디로 가든지 네 하나님 여호와가 너와 함께 하느니라.' },
  { ref: '여호수아 24:15', text: '오직 나와 내 집은 여호와를 섬기겠노라.' },
  { ref: '룻기 1:16', text: '어머니께서 가시는 곳에 나도 가고 어머니께서 머무시는 곳에서 나도 머물겠나이다 어머니의 백성이 나의 백성이 되고 어머니의 하나님이 나의 하나님이 되시리니.' },
  { ref: '사무엘상 16:7', text: '여호와께서 보시는 것은 사람과 같지 아니하니 사람은 외모를 보거니와 나 여호와는 중심을 보느니라.' },
  { ref: '역대상 16:11', text: '여호와와 그의 능력을 구할지어다 그의 얼굴을 항상 구할지어다.' },
  { ref: '역대하 7:14', text: '내 이름으로 일컫는 내 백성이 그들의 악한 길에서 떠나 스스로 낮추고 기도하여 내 얼굴을 구하면 내가 하늘에서 듣고 그들의 죄를 사하고 그들의 땅을 고칠지라.' },
  { ref: '느헤미야 8:10', text: '여호와로 인하여 기뻐하는 것이 너희의 힘이니라.' },

  // ===== 마태복음 =====
  { ref: '마태복음 4:4', text: '사람이 떡으로만 살 것이 아니요 하나님의 입으로부터 나오는 모든 말씀으로 살 것이라.' },
  { ref: '마태복음 5:3', text: '심령이 가난한 자는 복이 있나니 천국이 그들의 것임이요.' },
  { ref: '마태복음 5:6', text: '의에 주리고 목마른 자는 복이 있나니 그들이 배부를 것임이요.' },
  { ref: '마태복음 5:7', text: '긍휼히 여기는 자는 복이 있나니 그들이 긍휼히 여김을 받을 것임이요.' },
  { ref: '마태복음 5:8', text: '마음이 청결한 자는 복이 있나니 그들이 하나님을 볼 것임이요.' },
  { ref: '마태복음 5:9', text: '화평하게 하는 자는 복이 있나니 그들이 하나님의 아들이라 일컬음을 받을 것임이요.' },
  { ref: '마태복음 5:14', text: '너희는 세상의 빛이라 산 위에 있는 동네가 숨겨지지 못할 것이요.' },
  { ref: '마태복음 5:16', text: '이같이 너희 빛이 사람 앞에 비치게 하여 그들로 너희 착한 행실을 보고 하늘에 계신 너희 아버지께 영광을 돌리게 하라.' },
  { ref: '마태복음 5:44', text: '나는 너희에게 이르노니 너희 원수를 사랑하며 너희를 박해하는 자를 위하여 기도하라.' },
  { ref: '마태복음 6:6', text: '너는 기도할 때에 네 골방에 들어가 문을 닫고 은밀한 중에 계신 네 아버지께 기도하라 은밀한 중에 보시는 네 아버지께서 갚으시리라.' },
  { ref: '마태복음 6:9-10', text: '하늘에 계신 우리 아버지여 이름이 거룩히 여김을 받으시오며 나라가 임하시오며 뜻이 하늘에서 이루어진 것 같이 땅에서도 이루어지이다.' },
  { ref: '마태복음 6:14-15', text: '너희가 사람의 잘못을 용서하면 너희 하늘 아버지께서도 너희 잘못을 용서하시려니와 너희가 사람의 잘못을 용서하지 아니하면 너희 아버지께서도 너희 잘못을 용서하지 아니하시리라.' },
  { ref: '마태복음 6:19-21', text: '너희를 위하여 보물을 땅에 쌓아 두지 말라 거기는 좀과 동록이 해하며 도둑이 구멍을 뚫고 도둑질하느니라 오직 너희를 위하여 보물을 하늘에 쌓아 두라 네 보물 있는 그 곳에는 네 마음도 있느니라.' },
  { ref: '마태복음 6:33', text: '그런즉 너희는 먼저 그의 나라와 그의 의를 구하라 그리하면 이 모든 것을 너희에게 더하시리라.' },
  { ref: '마태복음 6:34', text: '그러므로 내일 일을 위하여 염려하지 말라 내일 일은 내일이 염려할 것이요 한 날의 괴로움은 그 날로 족하니라.' },
  { ref: '마태복음 7:7-8', text: '구하라 그리하면 너희에게 주실 것이요 찾으라 그리하면 찾아낼 것이요 문을 두드리라 그리하면 너희에게 열릴 것이니 구하는 이마다 받을 것이요 찾는 이는 찾아낼 것이요 두드리는 이에게는 열릴 것이니라.' },
  { ref: '마태복음 7:12', text: '그러므로 무엇이든지 남에게 대접을 받고자 하는 대로 너희도 남을 대접하라 이것이 율법이요 선지자니라.' },
  { ref: '마태복음 11:28', text: '수고하고 무거운 짐 진 자들아 다 내게로 오라 내가 너희를 쉬게 하리라.' },
  { ref: '마태복음 11:29-30', text: '나는 마음이 온유하고 겸손하니 나의 멍에를 메고 내게 배우라 그리하면 너희 마음이 쉼을 얻으리니 이는 내 멍에는 쉽고 내 짐은 가벼움이라 하시니라.' },
  { ref: '마태복음 18:20', text: '두세 사람이 내 이름으로 모인 곳에는 나도 그들 중에 있느니라.' },
  { ref: '마태복음 19:14', text: '예수께서 이르시되 어린 아이들을 용납하고 내게 오는 것을 금하지 말라 천국이 이런 사람의 것이니라 하시고.' },
  { ref: '마태복음 19:26', text: '예수께서 그들을 보시며 이르시되 사람으로는 할 수 없으나 하나님으로서는 다 하실 수 있느니라.' },
  { ref: '마태복음 22:37-39', text: '네 마음을 다하고 목숨을 다하고 뜻을 다하여 주 너의 하나님을 사랑하라 이것이 크고 첫째 되는 계명이요 둘째도 그와 같으니 네 이웃을 네 자신 같이 사랑하라.' },
  { ref: '마태복음 25:40', text: '내가 진실로 너희에게 이르노니 너희가 여기 내 형제 중에 지극히 작은 자 하나에게 한 것이 곧 내게 한 것이니라.' },
  { ref: '마태복음 28:19-20', text: '그러므로 너희는 가서 모든 민족을 제자로 삼아 아버지와 아들과 성령의 이름으로 세례를 베풀고 내가 너희에게 분부한 모든 것을 가르쳐 지키게 하라 볼지어다 내가 세상 끝날까지 너희와 항상 함께 있으리라.' },

  // ===== 마가복음 =====
  { ref: '마가복음 9:23', text: '예수께서 이르시되 할 수 있거든이 무슨 말이냐 믿는 자에게는 능히 하지 못할 일이 없느니라.' },
  { ref: '마가복음 10:27', text: '예수께서 그들을 보시며 이르시되 사람으로는 할 수 없으되 하나님으로는 그렇지 아니하니 하나님으로서는 다 하실 수 있느니라.' },
  { ref: '마가복음 10:45', text: '인자가 온 것은 섬김을 받으려 함이 아니라 도리어 섬기려 하고 자기 목숨을 많은 사람의 대속물로 주려 함이니라.' },
  { ref: '마가복음 11:24', text: '내가 너희에게 말하노니 무엇이든지 기도하고 구하는 것은 받은 줄로 믿으라 그리하면 너희에게 그대로 되리라.' },
  { ref: '마가복음 12:30-31', text: '네 마음을 다하고 목숨을 다하고 뜻을 다하고 힘을 다하여 주 너의 하나님을 사랑하라 둘째는 이것이니 네 이웃을 네 자신과 같이 사랑하라.' },
  { ref: '마가복음 16:15', text: '너희는 온 천하에 다니며 만민에게 복음을 전파하라.' },

  // ===== 누가복음 =====
  { ref: '누가복음 1:37', text: '대저 하나님의 모든 말씀은 능하지 못하심이 없느니라.' },
  { ref: '누가복음 2:14', text: '지극히 높은 곳에서는 하나님께 영광이요 땅에서는 기뻐하심을 입은 사람들 중에 평화로다.' },
  { ref: '누가복음 6:31', text: '남에게 대접을 받고자 하는 대로 너희도 남을 대접하라.' },
  { ref: '누가복음 6:38', text: '주라 그리하면 너희에게 줄 것이니 곧 후히 되어 누르고 흔들어 넘치도록 하여 너희에게 안겨 주리라 너희가 헤아리는 그 헤아림으로 너희도 헤아림을 도로 받을 것이니라.' },
  { ref: '누가복음 12:7', text: '너희에게는 심지어 머리털까지도 다 세신 바 되었나니 두려워하지 말라 너희는 많은 참새보다 더 귀하니라.' },
  { ref: '누가복음 12:34', text: '너희 보물 있는 곳에는 너희 마음도 있으리라.' },
  { ref: '누가복음 17:21', text: '하나님의 나라는 너희 안에 있느니라.' },
  { ref: '누가복음 18:1', text: '예수께서 그들에게 항상 기도하고 낙심하지 말아야 할 것을 비유로 말씀하여.' },
  { ref: '누가복음 19:10', text: '인자가 온 것은 잃어버린 자를 찾아 구원하려 함이니라.' },

  // ===== 요한복음 =====
  { ref: '요한복음 1:1', text: '태초에 말씀이 계시니라 이 말씀이 하나님과 함께 계셨으니 이 말씀은 곧 하나님이시니라.' },
  { ref: '요한복음 1:12', text: '영접하는 자 곧 그 이름을 믿는 자들에게는 하나님의 자녀가 되는 권세를 주셨으니.' },
  { ref: '요한복음 1:14', text: '말씀이 육신이 되어 우리 가운데 거하시매 우리가 그의 영광을 보니 아버지의 독생자의 영광이요 은혜와 진리가 충만하더라.' },
  { ref: '요한복음 3:16', text: '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라.' },
  { ref: '요한복음 4:14', text: '내가 주는 물을 마시는 자는 영원히 목마르지 아니하리니 내가 주는 물은 그 속에서 영생하도록 솟아나는 샘물이 되리라.' },
  { ref: '요한복음 6:35', text: '내가 곧 생명의 떡이니 내게 오는 자는 결코 주리지 아니할 터이요 나를 믿는 자는 영원히 목마르지 아니하리라.' },
  { ref: '요한복음 8:12', text: '나는 세상의 빛이니 나를 따르는 자는 어둠에 다니지 아니하고 생명의 빛을 얻으리라.' },
  { ref: '요한복음 8:32', text: '진리를 알지니 진리가 너희를 자유롭게 하리라.' },
  { ref: '요한복음 10:10', text: '내가 온 것은 양으로 생명을 얻게 하고 더 풍성히 얻게 하려는 것이라.' },
  { ref: '요한복음 10:11', text: '나는 선한 목자라 선한 목자는 양들을 위하여 목숨을 버리거니와.' },
  { ref: '요한복음 11:25-26', text: '나는 부활이요 생명이니 나를 믿는 자는 죽어도 살겠고 무릇 살아서 나를 믿는 자는 영원히 죽지 아니하리니 이것을 네가 믿느냐.' },
  { ref: '요한복음 13:34-35', text: '새 계명을 너희에게 주노니 서로 사랑하라 내가 너희를 사랑한 것 같이 너희도 서로 사랑하라 너희가 서로 사랑하면 이로써 모든 사람이 너희가 내 제자인 줄 알리라.' },
  { ref: '요한복음 14:1', text: '너희는 마음에 근심하지 말라 하나님을 믿으니 또 나를 믿으라.' },
  { ref: '요한복음 14:2-3', text: '내 아버지 집에 거할 곳이 많도다 그렇지 않으면 너희에게 일렀으리라 내가 너희를 위하여 거처를 예비하러 가노니 가서 너희를 위하여 거처를 예비하면 내가 다시 와서 너희를 내게로 영접하여 나 있는 곳에 너희도 있게 하리라.' },
  { ref: '요한복음 14:6', text: '예수께서 이르시되 내가 곧 길이요 진리요 생명이니 나로 말미암지 않고는 아버지께로 올 자가 없느니라.' },
  { ref: '요한복음 14:13-14', text: '너희가 내 이름으로 무엇을 구하든지 내가 행하리니 이는 아버지로 하여금 아들로 말미암아 영광을 받으시게 하려 함이라 내 이름으로 무엇이든지 내게 구하면 내가 행하리라.' },
  { ref: '요한복음 14:27', text: '평안을 너희에게 끼치노니 곧 나의 평안을 너희에게 주노라 내가 너희에게 주는 것은 세상이 주는 것과 같지 아니하니라 너희는 마음에 근심하지도 말고 두려워하지도 말라.' },
  { ref: '요한복음 15:5', text: '나는 포도나무요 너희는 가지라 그가 내 안에 내가 그 안에 거하면 사람이 열매를 많이 맺나니 나를 떠나서는 너희가 아무 것도 할 수 없음이라.' },
  { ref: '요한복음 15:7', text: '너희가 내 안에 거하고 내 말이 너희 안에 거하면 무엇이든지 원하는 대로 구하라 그리하면 이루리라.' },
  { ref: '요한복음 15:13', text: '사람이 친구를 위하여 자기 목숨을 버리면 이보다 더 큰 사랑이 없나니.' },
  { ref: '요한복음 16:33', text: '이것을 너희에게 이르는 것은 너희로 내 안에서 평안을 누리게 하려 함이라 세상에서는 너희가 환난을 당하나 담대하라 내가 세상을 이기었노라.' },
  { ref: '요한복음 17:3', text: '영생은 곧 유일하신 참 하나님과 그가 보내신 자 예수 그리스도를 아는 것이니이다.' },
  { ref: '요한복음 20:29', text: '예수께서 이르시되 너는 나를 본 고로 믿느냐 보지 못하고 믿는 자들은 복되도다.' },

  // ===== 사도행전 =====
  { ref: '사도행전 1:8', text: '오직 성령이 너희에게 임하시면 너희가 권능을 받고 예루살렘과 온 유대와 사마리아와 땅 끝까지 이르러 내 증인이 되리라.' },
  { ref: '사도행전 2:38', text: '베드로가 이르되 너희가 회개하여 각각 예수 그리스도의 이름으로 세례를 받고 죄 사함을 받으라 그리하면 성령의 선물을 받으리니.' },
  { ref: '사도행전 4:12', text: '다른 이로써는 구원을 받을 수 없나니 천하 사람 중에 구원을 받을 만한 다른 이름을 우리에게 주신 일이 없음이라.' },
  { ref: '사도행전 16:31', text: '주 예수를 믿으라 그리하면 너와 네 집이 구원을 받으리라.' },
  { ref: '사도행전 17:28', text: '우리가 그를 힘입어 살며 기동하며 존재하느니라.' },
  { ref: '사도행전 20:24', text: '내가 달려갈 길과 주 예수께 받은 사명 곧 하나님의 은혜의 복음을 증언하는 일을 마치려 함에는 나의 생명조차 조금도 귀한 것으로 여기지 아니하노라.' },
  { ref: '사도행전 20:35', text: '주 예수께서 친히 말씀하신 바 주는 것이 받는 것보다 복이 있다 하심을 기억하여야 할지니라.' },

  // ===== 로마서 =====
  { ref: '로마서 1:16', text: '내가 복음을 부끄러워하지 아니하노니 이 복음은 모든 믿는 자에게 구원을 주시는 하나님의 능력이 됨이라.' },
  { ref: '로마서 1:17', text: '복음에는 하나님의 의가 나타나서 믿음으로 믿음에 이르게 하나니 기록된 바 오직 의인은 믿음으로 말미암아 살리라 함과 같으니라.' },
  { ref: '로마서 3:23-24', text: '모든 사람이 죄를 범하였으매 하나님의 영광에 이르지 못하더니 그리스도 예수 안에 있는 속량으로 말미암아 하나님의 은혜로 값 없이 의롭다 하심을 얻은 자 되었느니라.' },
  { ref: '로마서 5:1', text: '그러므로 우리가 믿음으로 의롭다 하심을 받았으니 우리 주 예수 그리스도로 말미암아 하나님과 화평을 누리자.' },
  { ref: '로마서 5:3-4', text: '환난은 인내를, 인내는 연단을, 연단은 소망을 이루는 줄 앎이로다.' },
  { ref: '로마서 5:8', text: '우리가 아직 죄인 되었을 때에 그리스도께서 우리를 위하여 죽으심으로 하나님께서 우리에 대한 자기의 사랑을 확증하셨느니라.' },
  { ref: '로마서 6:23', text: '죄의 삯은 사망이요 하나님의 은사는 그리스도 예수 우리 주 안에 있는 영생이니라.' },
  { ref: '로마서 8:1', text: '그러므로 이제 그리스도 예수 안에 있는 자에게는 결코 정죄함이 없나니.' },
  { ref: '로마서 8:18', text: '생각하건대 현재의 고난은 장차 우리에게 나타날 영광과 비교할 수 없도다.' },
  { ref: '로마서 8:26', text: '이와 같이 성령도 우리의 연약함을 도우시나니 우리는 마땅히 기도할 바를 알지 못하나 오직 성령이 말할 수 없는 탄식으로 우리를 위하여 친히 간구하시느니라.' },
  { ref: '로마서 8:28', text: '우리가 알거니와 하나님을 사랑하는 자 곧 그의 뜻대로 부르심을 입은 자들에게는 모든 것이 합력하여 선을 이루느니라.' },
  { ref: '로마서 8:31', text: '그런즉 이 일에 대하여 우리가 무슨 말 하리요 만일 하나님이 우리를 위하시면 누가 우리를 대적하리요.' },
  { ref: '로마서 8:38-39', text: '내가 확신하노니 사망이나 생명이나 천사들이나 권세자들이나 현재 일이나 장래 일이나 능력이나 어떤 피조물이라도 우리를 우리 주 그리스도 예수 안에 있는 하나님의 사랑에서 끊을 수 없으리라.' },
  { ref: '로마서 10:9-10', text: '네가 만일 네 입으로 예수를 주로 시인하며 또 하나님께서 그를 죽은 자 가운데서 살리신 것을 네 마음에 믿으면 구원을 받으리라 사람이 마음으로 믿어 의에 이르고 입으로 시인하여 구원에 이르느니라.' },
  { ref: '로마서 10:17', text: '그러므로 믿음은 들음에서 나며 들음은 그리스도의 말씀으로 말미암았느니라.' },
  { ref: '로마서 12:1', text: '그러므로 형제들아 내가 하나님의 모든 자비하심으로 너희를 권하노니 너희 몸을 하나님이 기뻐하시는 거룩한 산 제물로 드리라 이는 너희가 드릴 영적 예배니라.' },
  { ref: '로마서 12:2', text: '너희는 이 세대를 본받지 말고 오직 마음을 새롭게 함으로 변화를 받아 하나님의 선하시고 기뻐하시고 온전하신 뜻이 무엇인지 분별하도록 하라.' },
  { ref: '로마서 12:12', text: '소망 중에 즐거워하며 환난 중에 참으며 기도에 항상 힘쓰며.' },
  { ref: '로마서 12:15', text: '즐거워하는 자들과 함께 즐거워하고 우는 자들과 함께 울라.' },
  { ref: '로마서 12:18', text: '할 수 있거든 너희로서는 모든 사람과 더불어 화목하라.' },
  { ref: '로마서 12:21', text: '악에게 지지 말고 선으로 악을 이기라.' },
  { ref: '로마서 13:8', text: '피차 사랑의 빚 외에는 아무에게든지 아무 빚도 지지 말라 남을 사랑하는 자는 율법을 다 이루었느니라.' },
  { ref: '로마서 14:8', text: '우리가 살아도 주를 위하여 살고 죽어도 주를 위하여 죽나니 그러므로 사나 죽으나 우리가 주의 것이로다.' },
  { ref: '로마서 15:13', text: '소망의 하나님이 모든 기쁨과 평강을 믿음 안에서 너희에게 충만하게 하사 성령의 능력으로 소망이 넘치게 하시기를 원하노라.' },

  // ===== 고린도전·후서 =====
  { ref: '고린도전서 1:18', text: '십자가의 도가 멸망하는 자들에게는 미련한 것이요 구원을 받는 우리에게는 하나님의 능력이라.' },
  { ref: '고린도전서 6:19-20', text: '너희 몸은 너희가 하나님께로부터 받은 바 너희 가운데 계신 성령의 전인 줄을 알지 못하느냐 너희는 너희 자신의 것이 아니라 값으로 산 것이 되었으니 그런즉 너희 몸으로 하나님께 영광을 돌리라.' },
  { ref: '고린도전서 9:22', text: '약한 자들에게 내가 약한 자와 같이 된 것은 약한 자들을 얻고자 함이요 내가 여러 사람에게 여러 모습이 된 것은 아무쪼록 몇 사람이라도 구원하고자 함이니.' },
  { ref: '고린도전서 10:13', text: '사람이 감당할 시험 밖에는 너희가 당한 것이 없나니 오직 하나님은 미쁘사 너희가 감당하지 못할 시험 당함을 허락하지 아니하시고 시험 당할 즈음에 또한 피할 길을 내사 너희로 능히 감당하게 하시느니라.' },
  { ref: '고린도전서 10:31', text: '그런즉 너희가 먹든지 마시든지 무엇을 하든지 다 하나님의 영광을 위하여 하라.' },
  { ref: '고린도전서 13:4-5', text: '사랑은 오래 참고 사랑은 온유하며 시기하지 아니하며 사랑은 자랑하지 아니하며 교만하지 아니하며 무례히 행하지 아니하며 자기의 유익을 구하지 아니하며 성내지 아니하며 악한 것을 생각하지 아니하며.' },
  { ref: '고린도전서 13:7', text: '모든 것을 참으며 모든 것을 믿으며 모든 것을 바라며 모든 것을 견디느니라.' },
  { ref: '고린도전서 13:13', text: '그런즉 믿음, 소망, 사랑, 이 세 가지는 항상 있을 것인데 그 중의 제일은 사랑이라.' },
  { ref: '고린도전서 15:58', text: '내 사랑하는 형제들아 견실하며 흔들리지 말고 항상 주의 일에 더욱 힘쓰는 자들이 되라 이는 너희 수고가 주 안에서 헛되지 않은 줄 앎이라.' },
  { ref: '고린도전서 16:13-14', text: '깨어 믿음에 굳게 서서 남자답게 강건하라 너희 모든 일을 사랑으로 행하라.' },
  { ref: '고린도후서 1:3-4', text: '찬송하리로다 그는 우리 주 예수 그리스도의 하나님이시요 자비의 아버지시요 모든 위로의 하나님이시며 우리의 모든 환난 중에서 우리를 위로하사 우리로 하여금 하나님께 받는 위로로써 모든 환난 중에 있는 자들을 능히 위로하게 하시는 이시로다.' },
  { ref: '고린도후서 4:16-17', text: '그러므로 우리가 낙심하지 아니하노니 우리의 겉사람은 낡아지나 우리의 속사람은 날로 새로워지도다 우리가 잠시 받는 환난의 경한 것이 지극히 크고 영원한 영광의 중한 것을 우리에게 이루게 함이니.' },
  { ref: '고린도후서 5:7', text: '이는 우리가 믿음으로 행하고 보는 것으로 행하지 아니함이로라.' },
  { ref: '고린도후서 5:17', text: '그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라 이전 것은 지나갔으니 보라 새 것이 되었도다.' },
  { ref: '고린도후서 5:21', text: '하나님이 죄를 알지도 못하신 이를 우리를 대신하여 죄로 삼으신 것은 우리로 하여금 그 안에서 하나님의 의가 되게 하려 하심이라.' },
  { ref: '고린도후서 9:7', text: '각각 그 마음에 정한 대로 할 것이요 인색함으로나 억지로 하지 말지니 하나님은 즐겨 내는 자를 사랑하시느니라.' },
  { ref: '고린도후서 12:9', text: '내게 이르시기를 내 은혜가 네게 족하도다 이는 내 능력이 약한 데서 온전하여짐이라 하신지라.' },
  { ref: '고린도후서 13:11', text: '마지막으로 말하노니 형제들아 기뻐하라 온전하게 되며 위로를 받으며 마음을 같이 하며 평안할지어다 또 사랑과 평강의 하나님이 너희와 함께 계시리라.' },
  { ref: '고린도후서 13:13', text: '주 예수 그리스도의 은혜와 하나님의 사랑과 성령의 교통하심이 너희 무리와 함께 있을지어다.' },

  // ===== 갈라디아서·에베소서·빌립보서·골로새서 =====
  { ref: '갈라디아서 2:20', text: '내가 그리스도와 함께 십자가에 못 박혔나니 그런즉 이제는 내가 사는 것이 아니요 오직 내 안에 그리스도께서 사시는 것이라.' },
  { ref: '갈라디아서 5:1', text: '그리스도께서 우리를 자유롭게 하려고 자유를 주셨으니 그러므로 굳건하게 서서 다시는 종의 멍에를 메지 말라.' },
  { ref: '갈라디아서 5:13', text: '너희가 자유를 위하여 부르심을 입었으나 그러나 그 자유로 육체의 기회를 삼지 말고 오직 사랑으로 서로 종 노릇 하라.' },
  { ref: '갈라디아서 5:22-23', text: '오직 성령의 열매는 사랑과 희락과 화평과 오래 참음과 자비와 양선과 충성과 온유와 절제니 이 같은 것을 금지할 법이 없느니라.' },
  { ref: '갈라디아서 6:2', text: '너희가 짐을 서로 지라 그리하여 그리스도의 법을 성취하라.' },
  { ref: '갈라디아서 6:9', text: '우리가 선을 행하되 낙심하지 말지니 포기하지 아니하면 때가 이르매 거두리라.' },
  { ref: '에베소서 1:7', text: '우리는 그리스도 안에서 그의 은혜의 풍성함을 따라 그의 피로 말미암아 속량 곧 죄 사함을 받았느니라.' },
  { ref: '에베소서 2:8-9', text: '너희는 그 은혜에 의하여 믿음으로 말미암아 구원을 받았으니 이것은 너희에게서 난 것이 아니요 하나님의 선물이라 행위에서 난 것이 아니니 이는 누구든지 자랑하지 못하게 함이라.' },
  { ref: '에베소서 2:10', text: '우리는 그가 만드신 바라 그리스도 예수 안에서 선한 일을 위하여 지으심을 받은 자니 이 일은 하나님이 전에 예비하사 우리로 그 가운데서 행하게 하려 하심이니라.' },
  { ref: '에베소서 3:20', text: '우리 가운데서 역사하시는 능력대로 우리가 구하거나 생각하는 모든 것에 더 넘치도록 능히 하실 이에게.' },
  { ref: '에베소서 4:2', text: '모든 겸손과 온유로 하고 오래 참음으로 사랑 가운데서 서로 용납하고.' },
  { ref: '에베소서 4:29', text: '무릇 더러운 말은 너희 입 밖에도 내지 말고 오직 덕을 세우는 데 소용되는 대로 선한 말을 하여 듣는 자들에게 은혜를 끼치게 하라.' },
  { ref: '에베소서 4:32', text: '서로 친절하게 하며 불쌍히 여기며 서로 용서하기를 하나님이 그리스도 안에서 너희를 용서하심과 같이 하라.' },
  { ref: '에베소서 5:1-2', text: '그러므로 사랑을 받는 자녀 같이 너희는 하나님을 본받는 자가 되고 그리스도께서 너희를 사랑하신 것 같이 너희도 사랑 가운데서 행하라.' },
  { ref: '에베소서 5:20', text: '범사에 우리 주 예수 그리스도의 이름으로 항상 아버지 하나님께 감사하며.' },
  { ref: '에베소서 6:10-11', text: '끝으로 너희가 주 안에서와 그 힘의 능력으로 강건하여지고 마귀의 간계를 능히 대적하기 위하여 하나님의 전신 갑주를 입으라.' },
  { ref: '에베소서 6:18', text: '모든 기도와 간구를 하되 항상 성령 안에서 기도하고 이를 위하여 깨어 구하기를 항상 힘쓰며 여러 성도를 위하여 구하라.' },
  { ref: '빌립보서 1:6', text: '너희 안에서 착한 일을 시작하신 이가 그리스도 예수의 날까지 이루실 줄을 우리는 확신하노라.' },
  { ref: '빌립보서 1:21', text: '이는 내게 사는 것이 그리스도니 죽는 것도 유익함이라.' },
  { ref: '빌립보서 2:3-4', text: '아무 일에든지 다툼이나 허영으로 하지 말고 오직 겸손한 마음으로 각각 자기보다 남을 낫게 여기고 각각 자기 일을 돌볼 뿐더러 또한 각각 다른 사람들의 일을 돌보아 나의 기쁨을 충만하게 하라.' },
  { ref: '빌립보서 2:5-7', text: '너희 안에 이 마음을 품으라 곧 그리스도 예수의 마음이니 그는 근본 하나님의 본체시나 하나님과 동등됨을 취할 것으로 여기지 아니하시고 오히려 자기를 비워 종의 형체를 가지사 사람들과 같이 되셨고.' },
  { ref: '빌립보서 3:13-14', text: '형제들아 나는 아직 내가 잡은 줄로 여기지 아니하고 오직 한 일 즉 뒤에 있는 것은 잊어버리고 앞에 있는 것을 잡으려고 푯대를 향하여 그리스도 예수 안에서 하나님이 위에서 부르신 부름의 상을 위하여 달려가노라.' },
  { ref: '빌립보서 4:4', text: '주 안에서 항상 기뻐하라 내가 다시 말하노니 기뻐하라.' },
  { ref: '빌립보서 4:6-7', text: '아무 것도 염려하지 말고 다만 모든 일에 기도와 간구로, 너희 구할 것을 감사함으로 하나님께 아뢰라 그리하면 모든 지각에 뛰어난 하나님의 평강이 그리스도 예수 안에서 너희 마음과 생각을 지키시리라.' },
  { ref: '빌립보서 4:8', text: '무엇에든지 참되며 무엇에든지 경건하며 무엇에든지 옳으며 무엇에든지 정결하며 무엇에든지 사랑 받을 만하며 무엇에든지 칭찬 받을 만하며 무슨 덕이 있든지 무슨 기림이 있든지 이것들을 생각하라.' },
  { ref: '빌립보서 4:13', text: '내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라.' },
  { ref: '빌립보서 4:19', text: '나의 하나님이 그리스도 예수 안에서 영광 가운데 그 풍성한 대로 너희 모든 쓸 것을 채우시리라.' },
  { ref: '골로새서 1:17', text: '또한 그가 만물보다 먼저 계시고 만물이 그 안에 함께 섰느니라.' },
  { ref: '골로새서 3:1-2', text: '그러므로 너희가 그리스도와 함께 다시 살리심을 받았으면 위의 것을 찾으라 거기는 그리스도께서 하나님 우편에 앉아 계시느니라 위의 것을 생각하고 땅의 것을 생각하지 말라.' },
  { ref: '골로새서 3:13', text: '누가 누구에게 불만이 있거든 서로 용납하여 피차 용서하되 주께서 너희를 용서하신 것 같이 너희도 그리하고.' },
  { ref: '골로새서 3:14', text: '이 모든 것 위에 사랑을 더하라 이는 온전하게 매는 띠니라.' },
  { ref: '골로새서 3:15', text: '그리스도의 평강이 너희 마음을 주장하게 하라 너희는 평강을 위하여 한 몸으로 부르심을 받았나니 너희는 또한 감사하는 자가 되라.' },
  { ref: '골로새서 3:16', text: '그리스도의 말씀이 너희 속에 풍성히 거하여 모든 지혜로 피차 가르치며 권면하고 시와 찬송과 신령한 노래를 부르며 감사하는 마음으로 하나님을 찬양하고.' },
  { ref: '골로새서 3:17', text: '또 무엇을 하든지 말에나 일에나 다 주 예수의 이름으로 하고 그를 힘입어 하나님 아버지께 감사하라.' },
  { ref: '골로새서 3:23', text: '무슨 일을 하든지 마음을 다하여 주께 하듯 하고 사람에게 하듯 하지 말라.' },

  // ===== 데살로니가전·후, 디모데전·후, 디도서 =====
  { ref: '데살로니가전서 4:11-12', text: '또 너희에게 명한 것 같이 조용히 자기 일을 하고 너희 손으로 일하기를 힘쓰라 이는 외인을 대하여 단정히 행하고 또한 아무 궁핍함이 없게 하려 함이라.' },
  { ref: '데살로니가전서 5:11', text: '그러므로 피차 권면하고 서로 덕을 세우기를 너희가 하는 것 같이 하라.' },
  { ref: '데살로니가전서 5:16-18', text: '항상 기뻐하라 쉬지 말고 기도하라 범사에 감사하라 이것이 그리스도 예수 안에서 너희를 향하신 하나님의 뜻이니라.' },
  { ref: '데살로니가전서 5:21', text: '범사에 헤아려 좋은 것을 취하고.' },
  { ref: '데살로니가전서 5:24', text: '너희를 부르시는 이는 미쁘시니 그가 또한 이루시리라.' },
  { ref: '데살로니가후서 3:3', text: '주는 미쁘사 너희를 굳건하게 하시고 악한 자에게서 지키시리라.' },
  { ref: '디모데전서 4:8', text: '육체의 연단은 약간의 유익이 있으나 경건은 범사에 유익하니 금생과 내생에 약속이 있느니라.' },
  { ref: '디모데전서 4:12', text: '누구든지 네 연소함을 업신여기지 못하게 하고 오직 말과 행실과 사랑과 믿음과 정절에 있어서 믿는 자에게 본이 되어.' },
  { ref: '디모데전서 6:6', text: '그러나 자족하는 마음이 있으면 경건은 큰 이익이 되느니라.' },
  { ref: '디모데전서 6:12', text: '믿음의 선한 싸움을 싸우라 영생을 취하라 이를 위하여 네가 부르심을 받았고 많은 증인 앞에서 선한 증언을 하였도다.' },
  { ref: '디모데후서 1:7', text: '하나님이 우리에게 주신 것은 두려워하는 마음이 아니요 오직 능력과 사랑과 절제하는 마음이니.' },
  { ref: '디모데후서 2:15', text: '너는 진리의 말씀을 옳게 분별하며 부끄러울 것이 없는 일꾼으로 인정된 자로 자신을 하나님 앞에 드리기를 힘쓰라.' },
  { ref: '디모데후서 3:16-17', text: '모든 성경은 하나님의 감동으로 된 것으로 교훈과 책망과 바르게 함과 의로 교육하기에 유익하니 이는 하나님의 사람으로 온전하게 하며 모든 선한 일을 행할 능력을 갖추게 하려 함이라.' },
  { ref: '디모데후서 4:7-8', text: '나는 선한 싸움을 싸우고 나의 달려갈 길을 마치고 믿음을 지켰으니 이제 후로는 나를 위하여 의의 면류관이 예비되었으므로.' },
  { ref: '디도서 2:11-12', text: '모든 사람에게 구원을 주시는 하나님의 은혜가 나타나 우리를 양육하시되 경건하지 않은 것과 이 세상 정욕을 다 버리고 신중함과 의로움과 경건함으로 이 세상에 살고.' },

  // ===== 히브리서 =====
  { ref: '히브리서 4:12', text: '하나님의 말씀은 살아 있고 활력이 있어 좌우에 날선 어떤 검보다도 예리하여 혼과 영과 및 관절과 골수를 찔러 쪼개기까지 하며 또 마음의 생각과 뜻을 판단하나니.' },
  { ref: '히브리서 4:16', text: '그러므로 우리는 긍휼하심을 받고 때를 따라 돕는 은혜를 얻기 위하여 은혜의 보좌 앞에 담대히 나아갈 것이니라.' },
  { ref: '히브리서 10:23', text: '또 약속하신 이는 미쁘시니 우리가 믿는 도리의 소망을 움직이지 말며 굳게 잡고.' },
  { ref: '히브리서 10:24-25', text: '서로 돌아보아 사랑과 선행을 격려하며 모이기를 폐하는 어떤 사람들의 습관과 같이 하지 말고 오직 권하여 그 날이 가까움을 볼수록 더욱 그리하자.' },
  { ref: '히브리서 11:1', text: '믿음은 바라는 것들의 실상이요 보이지 않는 것들의 증거니.' },
  { ref: '히브리서 11:6', text: '믿음이 없이는 하나님을 기쁘시게 하지 못하나니 하나님께 나아가는 자는 반드시 그가 계신 것과 또한 그가 자기를 찾는 자들에게 상 주시는 이심을 믿어야 할지니라.' },
  { ref: '히브리서 12:1-2', text: '이러므로 우리에게 구름 같이 둘러싼 허다한 증인들이 있으니 모든 무거운 것과 얽매이기 쉬운 죄를 벗어 버리고 인내로써 우리 앞에 당한 경주를 하며 믿음의 주요 또 온전하게 하시는 이인 예수를 바라보자.' },
  { ref: '히브리서 12:11', text: '무릇 징계가 당시에는 즐거워 보이지 않고 슬퍼 보이나 후에 그로 말미암아 연단 받은 자들은 의와 평강의 열매를 맺느니라.' },
  { ref: '히브리서 13:5', text: '돈을 사랑하지 말고 있는 바를 족한 줄로 알라 그가 친히 말씀하시기를 내가 결코 너희를 버리지 아니하고 너희를 떠나지 아니하리라 하셨느니라.' },
  { ref: '히브리서 13:8', text: '예수 그리스도는 어제나 오늘이나 영원토록 동일하시니라.' },

  // ===== 야고보서 =====
  { ref: '야고보서 1:2-3', text: '내 형제들아 너희가 여러 가지 시험을 당하거든 온전히 기쁘게 여기라 이는 너희 믿음의 시련이 인내를 만들어 내는 줄 너희가 앎이라.' },
  { ref: '야고보서 1:5', text: '너희 중에 누구든지 지혜가 부족하거든 모든 사람에게 후히 주시고 꾸짖지 아니하시는 하나님께 구하라 그리하면 주시리라.' },
  { ref: '야고보서 1:17', text: '온갖 좋은 은사와 온전한 선물이 다 위로부터 빛들의 아버지께로부터 내려오나니 그는 변함도 없으시고 회전하는 그림자도 없으시니라.' },
  { ref: '야고보서 1:19-20', text: '내 사랑하는 형제들아 너희가 알지니 사람마다 듣기는 속히 하고 말하기는 더디 하며 성내기도 더디 하라 사람이 성내는 것이 하나님의 의를 이루지 못함이라.' },
  { ref: '야고보서 1:22', text: '너희는 말씀을 행하는 자가 되고 듣기만 하여 자신을 속이는 자가 되지 말라.' },
  { ref: '야고보서 2:17', text: '이와 같이 행함이 없는 믿음은 그 자체가 죽은 것이라.' },
  { ref: '야고보서 4:7-8', text: '그런즉 너희는 하나님께 복종할지어다 마귀를 대적하라 그리하면 너희를 피하리라 하나님을 가까이 하라 그리하면 너희를 가까이 하시리라.' },
  { ref: '야고보서 5:13', text: '너희 중에 고난 당하는 자가 있느냐 그는 기도할 것이요 즐거워하는 자가 있느냐 그는 찬송할지니라.' },
  { ref: '야고보서 5:16', text: '그러므로 너희 죄를 서로 고백하며 병이 낫기를 위하여 서로 기도하라 의인의 간구는 역사하는 힘이 큼이니라.' },

  // ===== 베드로전·후서 =====
  { ref: '베드로전서 1:6-7', text: '여러 가지 시험으로 말미암아 잠깐 근심하게 되지 않을 수 없었으나 너희 믿음의 확실함은 불로 연단하여도 없어질 금보다 더 귀하여 예수 그리스도께서 나타나실 때에 칭찬과 영광과 존귀를 얻게 할 것이니라.' },
  { ref: '베드로전서 2:9', text: '그러나 너희는 택하신 족속이요 왕 같은 제사장들이요 거룩한 나라요 그의 소유가 된 백성이니 이는 너희를 어두운 데서 불러 내어 그의 기이한 빛에 들어가게 하신 이의 아름다운 덕을 선포하게 하려 하심이라.' },
  { ref: '베드로전서 3:15', text: '너희 마음에 그리스도를 주로 삼아 거룩하게 하고 너희 속에 있는 소망에 관한 이유를 묻는 자에게는 대답할 것을 항상 준비하되 온유와 두려움으로 하고.' },
  { ref: '베드로전서 4:8', text: '무엇보다도 뜨겁게 서로 사랑할지니 사랑은 허다한 죄를 덮느니라.' },
  { ref: '베드로전서 4:10', text: '각각 은사를 받은 대로 하나님의 여러 가지 은혜를 맡은 선한 청지기 같이 서로 봉사하라.' },
  { ref: '베드로전서 5:6-7', text: '그러므로 하나님의 능하신 손 아래에서 겸손하라 때가 되면 너희를 높이시리라 너희 염려를 다 주께 맡기라 이는 그가 너희를 돌보심이라.' },
  { ref: '베드로전서 5:10', text: '모든 은혜의 하나님 곧 그리스도 안에서 너희를 부르사 자기의 영원한 영광에 들어가게 하신 이가 잠깐 고난을 당한 너희를 친히 온전하게 하시며 굳건하게 하시며 강하게 하시며 터를 견고하게 하시리라.' },
  { ref: '베드로후서 1:3', text: '그의 신기한 능력으로 생명과 경건에 속한 모든 것을 우리에게 주셨으니 이는 자기의 영광과 덕으로써 우리를 부르신 이를 앎으로 말미암음이라.' },
  { ref: '베드로후서 1:5-7', text: '너희 믿음에 덕을, 덕에 지식을, 지식에 절제를, 절제에 인내를, 인내에 경건을, 경건에 형제 우애를, 형제 우애에 사랑을 더하라.' },
  { ref: '베드로후서 3:9', text: '주의 약속은 어떤 이들이 더디다고 생각하는 것 같이 더딘 것이 아니라 오직 주께서는 너희를 대하여 오래 참으사 아무도 멸망하지 아니하고 다 회개하기에 이르기를 원하시느니라.' },

  // ===== 요한 1·2·3서 =====
  { ref: '요한일서 1:7', text: '그가 빛 가운데 계신 것 같이 우리도 빛 가운데 행하면 우리가 서로 사귐이 있고 그 아들 예수의 피가 우리를 모든 죄에서 깨끗하게 하실 것이요.' },
  { ref: '요한일서 1:9', text: '만일 우리가 우리 죄를 자백하면 그는 미쁘시고 의로우사 우리 죄를 사하시며 우리를 모든 불의에서 깨끗하게 하실 것이요.' },
  { ref: '요한일서 3:1', text: '보라 아버지께서 어떠한 사랑을 우리에게 베푸사 하나님의 자녀라 일컬음을 받게 하셨는가 우리가 그러하도다.' },
  { ref: '요한일서 3:18', text: '자녀들아 우리가 말과 혀로만 사랑하지 말고 행함과 진실함으로 하자.' },
  { ref: '요한일서 4:7-8', text: '사랑하는 자들아 우리가 서로 사랑하자 사랑은 하나님께 속한 것이니 사랑하는 자마다 하나님으로부터 나서 하나님을 알고 사랑하지 아니하는 자는 하나님을 알지 못하나니 이는 하나님은 사랑이심이라.' },
  { ref: '요한일서 4:18', text: '사랑 안에 두려움이 없고 온전한 사랑이 두려움을 내쫓나니 두려움에는 형벌이 있음이라 두려워하는 자는 사랑 안에서 온전히 이루지 못하였느니라.' },
  { ref: '요한일서 4:19', text: '우리가 사랑함은 그가 먼저 우리를 사랑하셨음이라.' },
  { ref: '요한일서 5:14', text: '그를 향하여 우리가 가진 바 담대함이 이것이니 그의 뜻대로 무엇을 구하면 들으심이라.' },

  // ===== 요한계시록 =====
  { ref: '요한계시록 3:20', text: '볼지어다 내가 문 밖에 서서 두드리노니 누구든지 내 음성을 듣고 문을 열면 내가 그에게로 들어가 그와 더불어 먹고 그는 나와 더불어 먹으리라.' },
  { ref: '요한계시록 21:4', text: '모든 눈물을 그 눈에서 닦아 주시니 다시는 사망이 없고 애통하는 것이나 곡하는 것이나 아픈 것이 다시 있지 아니하리니 처음 것들이 다 지나갔음이러라.' },
  { ref: '요한계시록 21:5', text: '보좌에 앉으신 이가 이르시되 보라 내가 만물을 새롭게 하노라.' },
  { ref: '요한계시록 22:13', text: '나는 알파와 오메가요 처음과 마지막이요 시작과 마침이라.' },
  { ref: '요한계시록 22:20', text: '이것들을 증언하신 이가 이르시되 내가 진실로 속히 오리라 하시거늘 아멘 주 예수여 오시옵소서.' }
];

function getTodaysVerse() {
  // daily-verse-final.js가 설정한 오늘의 말씀 사용, 없으면 DAILY_VERSES 폴백
  if (window.__namsanTodayVerse?.text) return window.__namsanTodayVerse;
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  let x = Math.imul((seed ^ 0xdeadbeef) >>> 0, 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  return DAILY_VERSES[((x ^ (x >>> 16)) >>> 0) % DAILY_VERSES.length];
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// ===== 묵상 노트 =====
async function openDevotionForToday() {
  if (!state.uid) { toast('로그인 후 이용 가능합니다'); return; }
  const v = await getTodaysVerse();
  document.getElementById('devotionVerseRef').textContent = v.ref;
  document.getElementById('devotionVerseText').textContent = v.text;
  document.getElementById('devTitle').value = '';
  document.getElementById('devBody').value = '';
  document.getElementById('devStatus').textContent = '';
  // 오늘 작성한 노트가 있으면 prefill
  try {
    const snap = await get(ref(db, `userNotes/${state.uid}/${todayKey()}`));
    if (snap.exists()) {
      const n = snap.val();
      document.getElementById('devTitle').value = n.title || '';
      document.getElementById('devBody').value = n.body || '';
    }
  } catch {}
  openModal('devotionModal');
}

document.getElementById('devSubmit')?.addEventListener('click', async () => {
  if (!state.uid) return;
  const title = document.getElementById('devTitle').value.trim();
  const body = document.getElementById('devBody').value.trim();
  const status = document.getElementById('devStatus');
  if (!body) { status.textContent = '묵상 내용을 입력해주세요'; status.style.color = 'var(--danger)'; return; }
  const v = await getTodaysVerse();
  const key = state.editingNoteKey || todayKey();
  const btn = document.getElementById('devSubmit');
  btn.disabled = true;
  status.textContent = '저장 중...'; status.style.color = '';
  try {
    // 옛 노트 수정 시 verse 정보는 보존 (오늘 작성·신규는 현재 verse 사용)
    const verseRef = state.editingNoteKey ? document.getElementById('devotionVerseRef').textContent : v.ref;
    const verseText = state.editingNoteKey ? document.getElementById('devotionVerseText').textContent : v.text;
    await set(ref(db, `userNotes/${state.uid}/${key}`), {
      title, body,
      verseRef, verseText,
      timestamp: Date.now()
    });
    state.editingNoteKey = null;
    status.textContent = '✅ 묵상이 저장되었습니다';
    status.style.color = 'var(--primary)';
    setTimeout(() => closeModal('devotionModal'), 1200);
  } catch (e) {
    status.textContent = '❌ 저장 실패: ' + (e.code || e.message);
    status.style.color = 'var(--danger)';
  } finally {
    btn.disabled = false;
  }
});

async function openMyNotes() {
  if (!state.uid) { toast('로그인 후 이용 가능합니다'); return; }
  const list = document.getElementById('myNotesList');
  list.innerHTML = '<div style="padding:18px;text-align:center;color:var(--muted);font-size:13px;">불러오는 중...</div>';
  openModal('myNotesModal');
  try {
    const snap = await get(ref(db, `userNotes/${state.uid}`));
    const arr = [];
    if (snap.exists()) snap.forEach((c) => { arr.push({ key: c.key, ...c.val() }); });
    arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (!arr.length) {
      list.innerHTML = '<div class="list-empty">아직 작성한 묵상이 없어요. "오늘의 말씀 → 묵상하기"로 첫 노트를 남겨보세요.</div>';
      return;
    }
    list.innerHTML = arr.map((n) => {
      const date = n.key.length === 8
        ? `${n.key.slice(0,4)}.${n.key.slice(4,6)}.${n.key.slice(6,8)}`
        : new Date(n.timestamp || 0).toLocaleDateString('ko-KR');
      return `
        <div class="note-row" data-note-key="${escapeHtml(n.key)}">
          <div class="nr-date">📅 ${escapeHtml(date)}</div>
          ${n.title ? `<div class="nr-title">${escapeHtml(n.title)}</div>` : ''}
          <div class="nr-snippet">${escapeHtml(n.body || '')}</div>
          ${n.verseRef ? `<div class="nr-verse">📖 ${escapeHtml(n.verseRef)}</div>` : ''}
          <div class="nr-actions">
            <button data-edit-note="${escapeHtml(n.key)}">수정</button>
            <button class="del" data-del-note="${escapeHtml(n.key)}">삭제</button>
          </div>
        </div>
      `;
    }).join('');
    list.querySelectorAll('[data-edit-note]').forEach((b) => {
      b.addEventListener('click', async () => {
        const key = b.dataset.editNote;
        const n = arr.find((x) => x.key === key);
        if (!n) return;
        // 노트 모달 prefill (오늘이 아니더라도 그 날짜 노트 수정)
        document.getElementById('devotionVerseRef').textContent = n.verseRef || '';
        document.getElementById('devotionVerseText').textContent = n.verseText || '';
        document.getElementById('devTitle').value = n.title || '';
        document.getElementById('devBody').value = n.body || '';
        document.getElementById('devStatus').textContent = '';
        // 저장 키를 일시적으로 해당 날짜로 (devSubmit이 todayKey()를 쓰므로 별도 처리 필요)
        state.editingNoteKey = key;
        closeModal('myNotesModal');
        setTimeout(() => openModal('devotionModal'), 250);
      });
    });
    list.querySelectorAll('[data-del-note]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('이 묵상 노트를 삭제하시겠어요?')) return;
        try {
          await remove(ref(db, `userNotes/${state.uid}/${b.dataset.delNote}`));
          openMyNotes(); // refresh
        } catch (e) { toast('삭제 실패: ' + (e.code || e.message)); }
      });
    });
  } catch (e) {
    list.innerHTML = `<div style="padding:18px;text-align:center;color:var(--danger);">불러오기 실패: ${escapeHtml(e.code || e.message)}</div>`;
  }
}

// ===== 공유 (Web Share API + 클립보드 fallback) =====
async function nativeShareOrCopy(payload) {
  if (navigator.share) {
    try { await navigator.share(payload); return true; } catch {}
  }
  // fallback: 클립보드
  const txt = [payload.title, payload.text, payload.url].filter(Boolean).join('\n\n');
  try {
    await navigator.clipboard.writeText(txt);
    toast('📋 클립보드에 복사되었습니다');
    return true;
  } catch {
    toast('공유를 지원하지 않는 브라우저입니다');
    return false;
  }
}

async function shareTodaysVerse() {
  const v = await getTodaysVerse();
  const c = state.church?.name || '천안남산교회';
  await nativeShareOrCopy({
    title: `📖 오늘의 말씀 — ${v.ref}`,
    text: `"${v.text}"\n\n— ${c}`,
    url: location.origin
  });
}

document.getElementById('postDetailShareBtn')?.addEventListener('click', async () => {
  const id = state.currentPostId;
  if (!id) return;
  const p = (state.posts || []).find((x) => x.id === id);
  if (!p) return;
  const c = state.church?.name || '천안남산교회';
  await nativeShareOrCopy({
    title: p.title,
    text: `${p.body || ''}\n\n— ${c}`,
    url: `${location.origin}/?tab=board`
  });
});


// ===== 유틸 =====
function escapeHtml(v) {
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function timeAgo(ts) {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}일 전`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// ===== 나눔글 게시판 =====
// 옛 imageUrl(단일) + 새 imageUrls(배열) 둘 다 지원
function postImages(p) {
  if (Array.isArray(p?.imageUrls) && p.imageUrls.length) return p.imageUrls.map(safeImageUrl).filter(Boolean);
  if (p?.imageUrl) return [safeImageUrl(p.imageUrl)].filter(Boolean);
  return [];
}

function renderPosts() {
  const feed = document.getElementById('postFeed');
  if (!feed) return;
  const posts = state.posts || [];
  if (!posts.length) {
    feed.innerHTML = '<div class="feed-card"><h3>아직 등록된 글이 없어요</h3><p>첫 글을 남겨주세요.</p></div>';
    return;
  }
  feed.innerHTML = posts.map((p) => {
    const liked = !!state.postLikes[p.id];
    const imgs = postImages(p);
    const shown = imgs.slice(0, 3);
    const more = imgs.length - shown.length;
    const thumbsHtml = shown.length ? `<div class="pc-thumbs n${shown.length}">${
      shown.map((u, i) => {
        const isLast = i === shown.length - 1 && more > 0;
        return `<div class="${isLast ? 'more' : ''}" ${isLast ? `data-more="+${more}"` : ''}><img src="${escapeHtml(u)}" alt="" loading="lazy"/></div>`;
      }).join('')
    }</div>` : '';
    const signupTag = p.signupEnabled ? '<span class="pc-signup-tag">📝 신청</span>' : '';
    const signupCount = p.signupCount || 0;
    const cap = p.capacity || 0;
    const signupInfo = p.signupEnabled && cap ? ` · 👥 ${signupCount}/${cap}` : '';
    return `
      <article class="post-card${p.signupEnabled ? ' has-signup' : ''}" data-post-id="${escapeHtml(p.id)}">
        <div class="post-card-head">
          <span class="pc-author">${escapeHtml(userLabel(p.authorName, p.authorRole))}</span>
          <span class="pc-time">${timeAgo(p.timestamp)}</span>
        </div>
        <h3>${escapeHtml(p.title || '')}${signupTag}</h3>
        ${thumbsHtml}
        <p class="pc-body">${escapeHtml(p.body || '')}</p>
        <div class="post-card-foot">
          <span class="${liked ? 'liked' : ''}">👍 ${p.likeCount || 0}</span>
          <span>💬 ${p.commentCount || 0}</span>
          ${signupInfo ? `<span style="margin-left:auto;color:var(--primary-dark);">${signupInfo.replace(' · ', '')}</span>` : ''}
        </div>
      </article>
    `;
  }).join('');
  feed.querySelectorAll('[data-post-id]').forEach((el) => {
    el.addEventListener('click', () => openPostDetail(el.dataset.postId));
  });
}

// 글 작성 모달
function openPostCompose(editId) {
  const titleEl = document.querySelector('#postComposeModal .modal-head h3');
  if (editId) {
    const p = state.posts.find((x) => x.id === editId);
    if (!p || p.authorUid !== state.uid) { toast('수정 권한이 없습니다'); return; }
    state.editingPostId = editId;
    document.getElementById('postTitleInput').value = p.title || '';
    document.getElementById('postBodyInput').value = p.body || '';
    document.getElementById('postSignupEnabled').checked = !!p.signupEnabled;
    document.getElementById('postCapacity').value = p.capacity || '';
    document.getElementById('postDeadline').value = p.deadline || '';
    document.getElementById('postSignupOptions').style.display = p.signupEnabled ? '' : 'none';
    document.getElementById('postSubmitBtn').textContent = '수정하기';
    if (titleEl) titleEl.textContent = '커뮤니티 글 수정';
  } else {
    state.editingPostId = null;
    document.getElementById('postTitleInput').value = '';
    document.getElementById('postBodyInput').value = '';
    document.getElementById('postSignupEnabled').checked = false;
    document.getElementById('postCapacity').value = '';
    document.getElementById('postDeadline').value = '';
    document.getElementById('postSignupOptions').style.display = 'none';
    document.getElementById('postSubmitBtn').textContent = '등록하기';
    if (titleEl) titleEl.textContent = '새 글 작성';
  }
  document.getElementById('postImageInput').value = '';
  document.getElementById('postImagePreview').style.display = 'none';
  document.getElementById('postImagePreview').innerHTML = '';
  document.getElementById('postComposeProgress').textContent = '';
  state.pendingPostImages = [];
  openModal('postComposeModal');
}

// 신청 받기 토글 → 옵션 표시
document.getElementById('postSignupEnabled')?.addEventListener('change', (e) => {
  document.getElementById('postSignupOptions').style.display = e.target.checked ? '' : 'none';
});

document.querySelector('[data-modal="postComposeModal"]')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopImmediatePropagation();
  openPostCompose(null);
});

const POST_MAX_IMAGES = 6;

function renderPostImagePreview() {
  const wrap = document.getElementById('postImagePreview');
  if (!wrap) return;
  const arr = state.pendingPostImages || [];
  if (!arr.length) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  wrap.style.display = '';
  wrap.innerHTML = arr.map((f, i) => {
    const url = URL.createObjectURL(f);
    return `<div class="preview-item"><img src="${url}" alt=""/><button type="button" data-rm="${i}" aria-label="제거">×</button></div>`;
  }).join('');
  wrap.querySelectorAll('[data-rm]').forEach((b) => {
    b.addEventListener('click', () => {
      const idx = parseInt(b.dataset.rm, 10);
      state.pendingPostImages.splice(idx, 1);
      renderPostImagePreview();
    });
  });
}

document.getElementById('postImageInput')?.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const valid = files.filter((f) => f.type.startsWith('image/'));
  if (valid.length !== files.length) toast('이미지 파일만 추가됩니다');
  const room = POST_MAX_IMAGES - (state.pendingPostImages || []).length;
  if (room <= 0) { toast(`사진은 최대 ${POST_MAX_IMAGES}장까지 가능합니다`); e.target.value = ''; return; }
  const taking = valid.slice(0, room);
  if (valid.length > room) toast(`최대 ${POST_MAX_IMAGES}장까지만 추가됩니다`);
  state.pendingPostImages = [...(state.pendingPostImages || []), ...taking];
  e.target.value = '';
  renderPostImagePreview();
});

document.getElementById('postSubmitBtn')?.addEventListener('click', async () => {
  const title = document.getElementById('postTitleInput').value.trim();
  const body = document.getElementById('postBodyInput').value.trim();
  if (!title) { toast('제목을 입력해주세요'); return; }
  if (!body) { toast('내용을 입력해주세요'); return; }

  const signupEnabled = document.getElementById('postSignupEnabled').checked;
  const capacityNum = parseInt(document.getElementById('postCapacity').value, 10);
  const deadlineVal = document.getElementById('postDeadline').value;
  if (signupEnabled && (!capacityNum || capacityNum < 1)) {
    toast('정원을 입력해주세요 (1명 이상)'); return;
  }

  const btn = document.getElementById('postSubmitBtn');
  const progress = document.getElementById('postComposeProgress');
  btn.disabled = true;
  try {
    // 다중 이미지 업로드 (각각 자동 리사이즈 → 병렬 업로드)
    const pending = (state.pendingPostImages || []).slice(0, POST_MAX_IMAGES);
    const uploaded = [];
    if (pending.length) {
      progress.textContent = `사진 ${pending.length}장 처리 중...`;
      for (let i = 0; i < pending.length; i++) {
        const orig = pending[i];
        progress.textContent = `사진 ${i + 1}/${pending.length} 처리 중...`;
        let f = orig;
        try {
          if (orig.type !== 'image/gif') {
            f = await resizeImage(orig, { maxDim: 1600, quality: 0.86 });
          }
        } catch { f = orig; }
        const ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `posts/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${i}.${ext}`;
        const task = uploadBytesResumable(sRef(storage, path), f, { contentType: f.type });
        const url = await new Promise((resolve, reject) => {
          task.on('state_changed', null, reject,
            async () => { try { resolve(await getDownloadURL(task.snapshot.ref)); } catch (e) { reject(e); } }
          );
        });
        uploaded.push({ url, path });
      }
    }
    progress.textContent = '저장 중...';

    if (state.editingPostId) {
      // 수정: title/body/signup/이미지(추가/유지)
      const old = state.posts.find((x) => x.id === state.editingPostId);
      const upd = {
        title, body,
        signupEnabled: !!signupEnabled,
        capacity: signupEnabled && capacityNum > 0 ? capacityNum : null,
        deadline: signupEnabled && deadlineVal ? deadlineVal : null,
        updatedAt: Date.now()
      };
      if (uploaded.length) {
        // 새 사진을 추가 (옛 사진은 보존)
        const oldUrls = old?.imageUrls || (old?.imageUrl ? [old.imageUrl] : []);
        const oldPaths = old?.imageStoragePaths || (old?.imageStoragePath ? [old.imageStoragePath] : []);
        upd.imageUrls = [...oldUrls, ...uploaded.map((u) => u.url)].slice(0, POST_MAX_IMAGES);
        upd.imageStoragePaths = [...oldPaths, ...uploaded.map((u) => u.path)].slice(0, POST_MAX_IMAGES);
        // 옛 단일 필드 정리
        upd.imageUrl = null; upd.imageStoragePath = null;
      }
      await update(ref(db, `posts/${state.editingPostId}`), upd);
      toast('수정되었습니다');
    } else {
      const newData = {
        title, body,
        imageUrls: uploaded.map((u) => u.url),
        imageStoragePaths: uploaded.map((u) => u.path),
        authorUid: state.uid,
        authorName: state.userProfile?.displayName || '성도',
        authorRole: state.userProfile?.role || '성도',
        likeCount: 0,
        commentCount: 0,
        signupCount: 0,
        timestamp: Date.now()
      };
      if (signupEnabled) {
        newData.signupEnabled = true;
        newData.capacity = capacityNum;
        if (deadlineVal) newData.deadline = deadlineVal;
      }
      await push(ref(db, 'posts'), newData);
      toast('등록되었습니다');
    }
    closeModal('postComposeModal');
  } catch (e) {
    console.error('[post-submit]', e);
    progress.textContent = '❌ 실패: ' + (e.code || e.message);
  } finally {
    btn.disabled = false;
  }
});

// 글 상세 모달
async function openPostDetail(id) {
  const p = state.posts.find((x) => x.id === id);
  if (!p) return;
  state.currentPostId = id;
  document.getElementById('postDetailTitle').textContent = p.title || '';
  document.getElementById('postDetailAuthor').textContent = userLabel(p.authorName, p.authorRole);
  document.getElementById('postDetailTime').textContent = p.timestamp ? new Date(p.timestamp).toLocaleString('ko-KR') : '';
  document.getElementById('postDetailBody').textContent = p.body || '';
  // 다중 이미지 표시
  const imgs = postImages(p);
  const wrap = document.getElementById('postDetailImgs');
  if (wrap) {
    if (imgs.length) {
      wrap.className = 'post-detail-imgs n' + Math.min(imgs.length, 6);
      wrap.innerHTML = imgs.map((u) => `<img src="${escapeHtml(u)}" alt="" loading="lazy"/>`).join('');
    } else {
      wrap.className = 'post-detail-imgs';
      wrap.innerHTML = '';
    }
  }
  document.getElementById('postDetailLikeCount').textContent = p.likeCount || 0;
  document.getElementById('postDetailCommentCount').textContent = p.commentCount || 0;
  // 좋아요 상태
  const likeBtn = document.getElementById('postDetailLikeBtn');
  likeBtn.classList.toggle('liked', !!state.postLikes[id]);
  // 신청 받기 박스 표시
  const signupBox = document.getElementById('postDetailSignup');
  const signupBtn = document.getElementById('postDetailSignupBtn');
  if (p.signupEnabled) {
    signupBox.style.display = '';
    const cap = p.capacity || 0;
    const cnt = p.signupCount || 0;
    const meta = [];
    if (p.deadline) meta.push(`📅 마감: ${p.deadline}`);
    if (cap) meta.push(`👥 ${cnt}/${cap}명`);
    document.getElementById('postDetailSignupMeta').textContent = meta.join(' · ') || '참여 신청을 받습니다';
    const closed = p.deadline && new Date(p.deadline + 'T23:59:59') < new Date();
    const full = cap > 0 && cnt >= cap;
    if (closed || full) {
      signupBtn.disabled = true;
      signupBtn.textContent = closed ? '마감되었습니다' : '정원이 찼습니다';
      signupBtn.classList.add('closed');
    } else {
      signupBtn.disabled = false;
      signupBtn.textContent = '📝 이 모임에 신청하기';
      signupBtn.classList.remove('closed');
    }
  } else {
    signupBox.style.display = 'none';
  }
  // 본인 글이면 수정/삭제 노출
  const mine = p.authorUid === state.uid;
  document.getElementById('postDetailEditBtn').style.display = mine ? '' : 'none';
  document.getElementById('postDetailDelBtn').style.display = mine ? '' : 'none';
  // 댓글 로드
  loadPostComments(id);
  openModal('postDetailModal');
}

async function loadPostComments(postId) {
  const list = document.getElementById('postCommentsList');
  if (!list) return;
  list.innerHTML = '<div style="font-size:12.5px;color:var(--muted);text-align:center;padding:12px;">댓글을 불러오는 중...</div>';
  try {
    const snap = await get(ref(db, `postComments/${postId}`));
    const arr = [];
    if (snap.exists()) snap.forEach((c) => { arr.push({ id: c.key, ...c.val() }); });
    arr.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    if (!arr.length) {
      list.innerHTML = '<div style="font-size:12.5px;color:var(--muted);text-align:center;padding:12px;">첫 댓글을 남겨주세요</div>';
      return;
    }
    list.innerHTML = arr.map((c) => {
      const mine = c.authorUid === state.uid;
      return `<div class="comment-item" data-comment-id="${escapeHtml(c.id)}">
        <div class="comment-meta">
          <span class="ca-author">${escapeHtml(userLabel(c.authorName, c.authorRole))}</span>
          <span class="ca-time">${timeAgo(c.timestamp)}</span>
          ${mine ? `<button class="ca-del" type="button" data-del-comment="${escapeHtml(c.id)}" title="삭제">🗑️</button>` : ''}
        </div>
        <div class="comment-body">${escapeHtml(c.body || '')}</div>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-del-comment]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('이 댓글을 삭제하시겠어요?')) return;
        try {
          await remove(ref(db, `postComments/${postId}/${b.dataset.delComment}`));
          // commentCount 감소
          const post = state.posts.find((x) => x.id === postId);
          if (post) {
            await update(ref(db, `posts/${postId}`), {
              commentCount: Math.max(0, (post.commentCount || 0) - 1)
            }).catch(() => {});
          }
          loadPostComments(postId);
        } catch (e) { toast('댓글 삭제 실패: ' + (e.code || e.message)); }
      });
    });
  } catch (e) {
    list.innerHTML = `<div style="font-size:12.5px;color:var(--danger);padding:12px;">댓글 로드 실패: ${escapeHtml(e.code || e.message)}</div>`;
  }
}

document.getElementById('postDetailLikeBtn')?.addEventListener('click', async () => {
  const id = state.currentPostId;
  if (!id) return;
  const post = state.posts.find((x) => x.id === id);
  if (!post) return;
  const liked = !!state.postLikes[id];
  try {
    if (liked) {
      // 취소
      await remove(ref(db, `postLikes/${id}/${state.uid}`));
      await update(ref(db, `posts/${id}`), { likeCount: Math.max(0, (post.likeCount || 0) - 1) });
      delete state.postLikes[id];
    } else {
      await set(ref(db, `postLikes/${id}/${state.uid}`), true);
      await update(ref(db, `posts/${id}`), { likeCount: (post.likeCount || 0) + 1 });
      state.postLikes[id] = true;
    }
    document.getElementById('postDetailLikeBtn').classList.toggle('liked', !liked);
    renderPosts();
  } catch (e) { toast('실패: ' + (e.code || e.message)); }
});

document.getElementById('commentSubmit')?.addEventListener('click', async () => {
  const id = state.currentPostId;
  if (!id) return;
  const input = document.getElementById('commentInput');
  const body = input.value.trim();
  if (!body) { toast('댓글 내용을 입력해주세요'); return; }
  const post = state.posts.find((x) => x.id === id);
  if (!post) return;
  try {
    await push(ref(db, `postComments/${id}`), {
      body,
      authorUid: state.uid,
      authorName: state.userProfile?.displayName || '성도',
      authorRole: state.userProfile?.role || '성도',
      timestamp: Date.now()
    });
    await update(ref(db, `posts/${id}`), {
      commentCount: (post.commentCount || 0) + 1
    }).catch(() => {});
    input.value = '';
    loadPostComments(id);
  } catch (e) { toast('댓글 등록 실패: ' + (e.code || e.message)); }
});

document.getElementById('postDetailEditBtn')?.addEventListener('click', () => {
  const id = state.currentPostId;
  if (!id) return;
  closeModal('postDetailModal');
  setTimeout(() => openPostCompose(id), 250);
});

document.getElementById('postDetailDelBtn')?.addEventListener('click', async () => {
  const id = state.currentPostId;
  const post = state.posts.find((x) => x.id === id);
  if (!post || post.authorUid !== state.uid) return;
  if (!confirm('이 글을 삭제하시겠어요?\n\n댓글과 좋아요 기록도 함께 삭제됩니다.')) return;
  try {
    // 첨부 사진 삭제 — 옛 단일·새 다중 형식 모두 지원
    const paths = post.imageStoragePaths || (post.imageStoragePath ? [post.imageStoragePath] : []);
    paths.forEach((path) => { deleteObject(sRef(storage, path)).catch(() => {}); });
    await remove(ref(db, `posts/${id}`));
    await remove(ref(db, `postLikes/${id}`)).catch(() => {});
    await remove(ref(db, `postComments/${id}`)).catch(() => {});
    closeModal('postDetailModal');
    state.currentPostId = null;
    toast('글이 삭제되었습니다');
  } catch (e) { toast('삭제 실패: ' + (e.code || e.message)); }
});

// 상세 모달이 닫히면 currentPostId 초기화
document.querySelector('[data-close="postDetailModal"]')?.addEventListener('click', () => { state.currentPostId = null; });
document.getElementById('postDetailModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'postDetailModal') state.currentPostId = null;
});

// ===== 공지 (홈 피드) =====
function renderAnnouncements() {
  const feed = document.querySelector('#tab-home .feed');
  if (!feed) return;
  if (state.announcements.length === 0) {
    feed.innerHTML = '<div class="feed-card"><h3>아직 등록된 소식이 없어요</h3><p>첫 공지가 등록되면 여기에 표시됩니다.</p></div>';
    return;
  }
  feed.innerHTML = state.announcements.slice(0, 5).map((a) => {
    const meta = [];
    if (a.deadline) meta.push(`📅 마감: ${a.deadline}`);
    if (a.capacity) meta.push(`👥 정원: ${a.capacity}명`);
    const closed = a.deadline && new Date(a.deadline + 'T23:59:59') < new Date();
    return `
    <article class="feed-card${a.signupEnabled ? ' has-signup' : ''}">
      <div class="top"><span class="tag ${escapeHtml(a.tag || 'notice')}">${tagLabel(a.tag)}</span><span class="time">${timeAgo(a.timestamp)}</span></div>
      <h3>${escapeHtml(a.title || '')}</h3>
      <p>${escapeHtml(a.body || '')}</p>
      ${meta.length ? `<div class="ann-meta">${escapeHtml(meta.join(' · '))}</div>` : ''}
      ${a.signupEnabled
        ? (closed
          ? `<button class="ann-signup-btn closed" type="button" disabled>마감되었습니다</button>`
          : `<button class="ann-signup-btn" type="button" data-event-signup="${escapeHtml(a.id)}">📝 이 행사 신청하기</button>`)
        : ''}
    </article>
  `;
  }).join('');
  feed.querySelectorAll('[data-event-signup]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEventApplyModal(btn.dataset.eventSignup);
    });
  });
}

// eventApplyModal — announcement 또는 post 모두 처리
// kind: 'announcement' | 'post'
function openEventApplyModal(targetId, kind = 'announcement') {
  const target = kind === 'post'
    ? (state.posts || []).find((x) => x.id === targetId)
    : (state.announcements || []).find((x) => x.id === targetId);
  if (!target) return;
  if (!ensureProfileComplete()) return;
  state.applyEventId = targetId;
  state.applyEventKind = kind;
  document.getElementById('eaTitle').textContent = target.title || '신청';
  document.getElementById('eaSub').textContent = [
    target.deadline ? `마감 ${target.deadline}` : '',
    // capacity는 announcements에만 사용 (posts는 무제한)
    kind === 'announcement' && target.capacity ? `정원 ${target.capacity}명` : ''
  ].filter(Boolean).join(' · ');
  document.getElementById('eaCount').value = '1';
  document.getElementById('eaNote').value = '';
  autofillFromProfile({ name: 'eaName', phone: 'eaPhone' });
  const p = state.userProfile || {};
  const nd = document.getElementById('eaName-display');
  const pd = document.getElementById('eaPhone-display');
  if (nd) nd.textContent = p.displayName || '—';
  if (pd) pd.textContent = p.phone || '—';
  openModal('eventApplyModal');
}

document.getElementById('eaSubmit')?.addEventListener('click', async () => {
  const id = state.applyEventId;
  const kind = state.applyEventKind || 'announcement';
  const target = kind === 'post'
    ? (state.posts || []).find((x) => x.id === id)
    : (state.announcements || []).find((x) => x.id === id);
  if (!target) return;
  const name = document.getElementById('eaName').value.trim();
  const phone = document.getElementById('eaPhone').value.trim();
  const count = parseInt(document.getElementById('eaCount').value, 10) || 1;
  const note = document.getElementById('eaNote').value.trim();
  if (!name) { toast('이름을 입력해주세요'); return; }
  if (!phone) { toast('연락처를 입력해주세요'); return; }
  // 정원 초과 체크 (post: 정원 필수)
  if (kind === 'post' && target.capacity) {
    const cnt = target.signupCount || 0;
    if (cnt + count > target.capacity) {
      toast(`정원이 ${target.capacity}명입니다 (현재 ${cnt}명 신청). 인원을 줄여주세요.`);
      return;
    }
  }
  try {
    const data = {
      kind: kind === 'post' ? '모임' : '행사',
      name, phone, count, note,
      eventTitle: target.title || '',
      userUid: state.uid, timestamp: Date.now()
    };
    if (kind === 'post') data.postId = id; else data.announcementId = id;
    const newRef = await push(ref(db, 'applications'), data);
    recordMyApplication(newRef.key);
    // post 신청이면 signupCount 원자적 증가 (race-safe transaction)
    if (kind === 'post') {
      try {
        await runTransaction(ref(db, `posts/${id}/signupCount`), (cur) => {
          const next = (cur || 0) + count;
          // 정원 초과 시 트랜잭션 중단 (서버 측 최종 검증)
          if (target.capacity && next > target.capacity) return;
          return next;
        });
      } catch (e) { console.warn('[signup-count]', e.code); }
    }
    closeModal('eventApplyModal');
    toast(`✅ "${target.title}" 신청이 접수되었습니다`);
  } catch (e) {
    console.error('[event-apply]', e);
    toast('신청 중 오류: ' + (e.code || e.message));
  }
});

// 나눔글 상세에서 "이 모임 신청하기" 버튼
document.getElementById('postDetailSignupBtn')?.addEventListener('click', () => {
  const id = state.currentPostId;
  if (!id) return;
  closeModal('postDetailModal');
  setTimeout(() => openEventApplyModal(id, 'post'), 250);
});

function tagLabel(t) {
  return ({
    urgent: '📌 긴급',
    event: '📝 행사 안내',
    notice: '📢 일반 안내',
    praise: '🙏 감사 나눔'
  })[t] || '📢 일반 안내';
}

// ===== 주보 (말씀 탭) =====
function renderBulletins() {
  const feed = document.getElementById('bulletinFeed');
  if (!feed) return;
  if (state.bulletins.length === 0) {
    feed.innerHTML = '<div class="feed-card"><h3>아직 등록된 주보가 없어요</h3><p>관리자 페이지에서 주보를 업로드하면 여기에 표시됩니다.</p></div>';
    return;
  }
  feed.innerHTML = state.bulletins.slice(0, 6).map((b, idx) => {
    const isPdf = (b.contentType || '').includes('pdf') || /\.pdf$/i.test(b.url || '');
    return `
      <a class="feed-card" href="${escapeHtml(b.url)}" target="_blank" rel="noopener" style="display:block;">
        <div class="top"><span class="tag ${idx === 0 ? 'urgent' : 'notice'}">${idx === 0 ? '이번 주' : '지난 주보'}</span><span class="time">${escapeHtml(b.date || timeAgo(b.timestamp))}</span></div>
        <h3>${isPdf ? '📄 ' : '🖼️ '}${escapeHtml(b.title || '주보')}</h3>
        <p>${isPdf ? 'PDF 열기' : '이미지 보기'} · ${b.size ? Math.round(b.size / 1024) + 'KB' : ''}</p>
      </a>
    `;
  }).join('');
}

// ===== 설교 =====
function renderSermon(s) {
  const meta = document.querySelector('#tab-word .meta');
  const titleEl = document.querySelector('#tab-word h3');
  const verseEl = document.querySelector('#tab-word .verse');
  const bodyEl = document.querySelector('#tab-word .video-info p:last-of-type');
  const practiceBox = document.querySelector('#tab-word .practice-box:not(.q)');
  const questionBox = document.querySelector('#tab-word .practice-box.q');
  const practiceGrid = document.querySelector('#tab-word .practice-grid');
  if (titleEl) titleEl.textContent = s.title || '';
  if (verseEl) {
    verseEl.textContent = s.verse || '';
    verseEl.style.display = s.verse ? '' : 'none';
  }
  if (meta) {
    meta.textContent = s.meta || '';
    meta.style.display = s.meta ? '' : 'none';
  }
  if (bodyEl) {
    bodyEl.textContent = s.body || '';
    bodyEl.style.display = s.body ? '' : 'none';
  }
  if (practiceBox) {
    const p = practiceBox.querySelector('p');
    if (p) p.textContent = s.practice || '';
    practiceBox.style.display = s.practice ? '' : 'none';
  }
  if (questionBox) {
    const p = questionBox.querySelector('p');
    if (p) p.textContent = s.question || '';
    questionBox.style.display = s.question ? '' : 'none';
  }
  if (practiceGrid) {
    practiceGrid.style.display = (s.practice || s.question) ? '' : 'none';
  }

  if (s.videoId && /^[a-zA-Z0-9_-]{6,}$/.test(s.videoId)) {
    const params = new URLSearchParams({ rel: '0', modestbranding: '1' });
    if (s.start) params.set('start', s.start);
    if (s.end) params.set('end', s.end);
    const iframe = document.getElementById('sermonFrame');
    const ph = document.getElementById('sermonPlaceholder');
    if (iframe) iframe.src = `https://www.youtube.com/embed/${s.videoId}?${params.toString()}`;
    if (ph) ph.style.display = 'none';
  }
}

function renderSermonHistory() {
  const feed = document.getElementById('sermonHistoryFeed');
  if (!feed) return;
  const list = state.sermonHistory || [];
  if (!list.length) {
    feed.innerHTML = '<div class="feed-card"><h3>아직 등록된 지난 설교가 없어요</h3><p>매주 새 설교가 등록되면 이전 설교가 자동으로 여기에 보관됩니다.</p></div>';
    return;
  }
  feed.innerHTML = list.map((s) => {
    const dateStr = s.timestamp ? new Date(s.timestamp).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    return `<div class="feed-card sermon-history-card" data-sermon-id="${escapeHtml(s.id)}" style="cursor:pointer;">
      <div style="font-size:11.5px;color:var(--muted);font-weight:600;margin-bottom:4px;">${escapeHtml(s.meta || dateStr)}</div>
      <h3>${escapeHtml(s.title || '제목 없음')}</h3>
      ${s.verse ? `<p style="color:var(--primary-dark);font-weight:700;font-size:13px;margin-top:4px;">${escapeHtml(s.verse)}</p>` : ''}
      ${s.body ? `<p style="margin-top:6px;font-size:13px;color:var(--muted);">${escapeHtml((s.body || '').slice(0, 90))}${s.body.length > 90 ? '…' : ''}</p>` : ''}
    </div>`;
  }).join('');
  feed.querySelectorAll('[data-sermon-id]').forEach((el) => {
    el.addEventListener('click', () => openSermonViewer(el.dataset.sermonId));
  });
}

function openSermonViewer(id) {
  const s = (state.sermonHistory || []).find((x) => x.id === id);
  if (!s) return;
  const titleEl = document.getElementById('sermonViewerTitle');
  const metaEl = document.getElementById('sermonViewerMeta');
  const verseEl = document.getElementById('sermonViewerVerse');
  const bodyEl = document.getElementById('sermonViewerBody');
  const iframe = document.getElementById('sermonViewerFrame');
  if (titleEl) titleEl.textContent = s.title || '설교';
  if (metaEl) metaEl.textContent = s.meta || (s.timestamp ? new Date(s.timestamp).toLocaleDateString('ko-KR') : '');
  if (verseEl) verseEl.textContent = s.verse || '';
  if (bodyEl) bodyEl.textContent = s.body || '';
  if (iframe) {
    if (s.videoId && /^[a-zA-Z0-9_-]{6,}$/.test(s.videoId)) {
      const params = new URLSearchParams({ rel: '0', modestbranding: '1' });
      if (s.start) params.set('start', s.start);
      if (s.end) params.set('end', s.end);
      iframe.src = `https://www.youtube.com/embed/${s.videoId}?${params.toString()}`;
    } else {
      iframe.src = '';
    }
  }
  openModal('sermonViewerModal');
}

// 모달 닫을 때 iframe src 비워서 영상 정지
document.querySelector('[data-close="sermonViewerModal"]')?.addEventListener('click', () => {
  const iframe = document.getElementById('sermonViewerFrame');
  if (iframe) iframe.src = '';
});
document.getElementById('sermonViewerModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'sermonViewerModal') {
    const iframe = document.getElementById('sermonViewerFrame');
    if (iframe) iframe.src = '';
  }
});

// ===== 재능나눔방 =====
function renderRooms() {
  const grid = document.getElementById('roomGrid');
  if (!grid) return;
  const cat = state.currentCategory;
  const visible = state.rooms.filter((r) => r.approved !== false && (cat === '전체' || r.category === cat));
  grid.innerHTML = visible.map((room) => {
    const percent = Math.min(100, Math.round((room.joined / room.capacity) * 100) || 0);
    const closed = room.status === '마감' || room.joined >= room.capacity;
    return `
      <article class="room-card">
        <div class="room-head">
          <h3>${escapeHtml(room.title)}</h3>
          <span class="badge ${closed ? 'closed' : ''}">${closed ? '마감' : '모집중'}</span>
        </div>
        <p class="desc">${escapeHtml(room.desc || '')}</p>
        <div class="room-meta">
          <span>${escapeHtml(room.category)}</span>
          <span>${escapeHtml(room.target)}</span>
          <span>${escapeHtml(room.schedule)}</span>
          <span>${escapeHtml(room.place)}</span>
        </div>
        <div class="progress-row">신청 현황 <b>${room.joined}/${room.capacity}명</b></div>
        <div class="progress"><span style="width:${percent}%"></span></div>
        <div class="room-foot">
          <small>담당: ${escapeHtml(room.teacher || '미정')}</small>
          <button class="apply-btn" ${closed ? 'disabled' : ''} data-room="${room.id}">${closed ? '마감' : '신청하기'}</button>
        </div>
      </article>
    `;
  }).join('') || '<div class="feed-card"><h3>해당 분야 방이 없습니다</h3><p>다른 카테고리를 선택해보세요.</p></div>';

  grid.querySelectorAll('.apply-btn').forEach((btn) => {
    btn.addEventListener('click', () => openRoomApply(btn.dataset.room));
  });
}

document.querySelectorAll('.chip').forEach((c) => {
  c.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach((x) => x.classList.remove('active'));
    c.classList.add('active');
    state.currentCategory = c.dataset.cat;
    renderRooms();
  });
});

// ===== 재능나눔방 신청 모달 =====
function openRoomApply(roomId) {
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room) return;
  state.applyRoomId = roomId;
  const title = document.getElementById('raTitle');
  if (title) title.textContent = `[${room.title}] 신청하기`;
  ['raName', 'raPhone'].forEach((id) => { const e = document.getElementById(id); if (e) e.value = ''; });
  autofillFromProfile({ name: 'raName', phone: 'raPhone' });
  openModal('roomApplyModal');
}

document.getElementById('raSubmit')?.addEventListener('click', async () => {
  const name = document.getElementById('raName').value.trim();
  if (!name) { toast('이름을 입력해주세요'); return; }
  const phone = document.getElementById('raPhone').value.trim();
  if (!phone) { toast('연락처를 입력해주세요'); return; }
  const roomId = state.applyRoomId;
  if (!roomId) return;
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room) return;
  try {
    const newRef = await push(ref(db, 'applications'), {
      kind: '재능나눔', roomId, roomTitle: room.title, name, phone,
      userUid: state.uid, timestamp: Date.now()
    });
    recordMyApplication(newRef.key);
    if (room.joined < room.capacity) {
      await update(ref(db, `rooms/${roomId}`), { joined: room.joined + 1 });
    }
    ['raName', 'raPhone'].forEach((id) => { const e = document.getElementById(id); if (e) e.value = ''; });
    closeModal('roomApplyModal');
    toast(`${room.title} 신청이 접수되었습니다`);
  } catch (e) {
    toast('신청 중 오류가 발생했어요');
    console.error(e);
  }
});

// ===== 기도제목 =====
function renderPrayers() {
  const feed = document.getElementById('prayerFeed');
  if (!feed) return;
  if (state.prayers.length === 0) {
    feed.innerHTML = '<div class="feed-card"><h3>아직 기도제목이 없어요</h3><p>첫 기도제목을 등록해보세요.</p></div>';
    return;
  }
  feed.innerHTML = state.prayers
    .filter((p) => p.type !== '교역자에게만 전달' || p.createdBy === state.uid)
    .map((p) => {
      const done = !!state.prayedBy[p.id];
      const mine = p.createdBy === state.uid;
      return `
        <article class="prayer-card" data-id="${p.id}">
          <div class="prayer-head">
            <span class="name">${escapeHtml(p.name || '익명')}</span>
            <span class="tag">${escapeHtml(p.type === '익명 공개' ? '익명' : p.type === '교역자에게만 전달' ? '비공개' : p.type || '공개')}</span>
            <span class="when">${timeAgo(p.timestamp)}</span>
          </div>
          <p class="body">${escapeHtml(p.text || '')}</p>
          <div class="prayer-actions">
            <button class="pray-action ${done ? 'done' : ''}" data-pray="${p.id}" type="button">🙏 기도했어요 <b>${p.count || 0}</b></button>
            ${mine ? `
              <button class="prayer-edit-btn" data-edit-prayer="${p.id}" type="button">✏️ 수정</button>
              <button class="prayer-del-btn" data-del-prayer="${p.id}" type="button">🗑️ 삭제</button>
            ` : ''}
          </div>
        </article>
      `;
    }).join('');

  feed.querySelectorAll('[data-pray]').forEach((btn) => {
    btn.addEventListener('click', () => prayFor(btn.dataset.pray));
  });
  feed.querySelectorAll('[data-edit-prayer]').forEach((btn) => {
    btn.addEventListener('click', () => openPrayerEdit(btn.dataset.editPrayer));
  });
  feed.querySelectorAll('[data-del-prayer]').forEach((btn) => {
    btn.addEventListener('click', () => deleteMyPrayer(btn.dataset.delPrayer));
  });
}

// 본인 기도제목 수정 — 등록 모달을 재사용
function openPrayerEdit(id) {
  const p = (state.prayers || []).find((x) => x.id === id);
  if (!p || p.createdBy !== state.uid) { toast('수정 권한이 없습니다'); return; }
  state.editingPrayerId = id;
  // 익명 공개 글은 이름이 '익명'으로 저장돼있으므로 그대로 prefill, 다른 경우만 실제 이름
  document.getElementById('pName').value = (p.type === '익명 공개') ? '' : (p.name || '');
  document.getElementById('pType').value = p.type || '공개';
  document.getElementById('pText').value = p.text || '';
  // 모달 헤더와 버튼 라벨 변경
  const titleEl = document.querySelector('#prayerModal .modal-head h3');
  const subEl = document.querySelector('#prayerModal .modal-head .sub');
  const submitBtn = document.getElementById('pSubmit');
  if (titleEl) titleEl.textContent = '기도제목 수정';
  if (subEl) subEl.textContent = '내가 등록한 기도제목을 수정합니다';
  if (submitBtn) submitBtn.textContent = '수정하기';
  openModal('prayerModal');
}

async function deleteMyPrayer(id) {
  const p = (state.prayers || []).find((x) => x.id === id);
  if (!p || p.createdBy !== state.uid) { toast('삭제 권한이 없습니다'); return; }
  if (!confirm(`기도제목을 삭제하시겠어요?\n\n"${(p.text || '').slice(0, 60)}${(p.text || '').length > 60 ? '...' : ''}"\n\n다른 분들이 누른 아멘 기록도 함께 삭제됩니다.`)) return;
  try {
    await remove(ref(db, `prayers/${id}`));
    await remove(ref(db, `prayedBy/${id}`)).catch(() => {});
    delete state.prayedBy[id];
    toast('기도제목이 삭제되었습니다');
  } catch (e) {
    console.error('[prayer] 삭제 실패:', e);
    toast('삭제 실패: ' + (e.code || e.message));
  }
}

async function prayFor(prayerId) {
  if (!state.uid) { toast('잠시 후 다시 시도해주세요'); return; }
  const prayer = (state.prayers || []).find((x) => x.id === prayerId);
  if (prayer?.createdBy === state.uid) { toast('자신이 올린 기도제목입니다'); return; }
  if (state.prayedBy[prayerId]) { toast('이미 기도에 참여하셨어요'); return; }

  try {
    const prayerRef = ref(db, `prayers/${prayerId}`);
    const snap = await get(prayerRef);
    if (!snap.exists()) return;
    const cur = snap.val();
    await update(prayerRef, { count: (cur.count || 0) + 1 });
    await set(ref(db, `prayedBy/${prayerId}/${state.uid}`), true);
    state.prayedBy[prayerId] = true;
    toast('기도 참여가 기록되었습니다');
    renderPrayers();
  } catch (e) {
    toast('처리 중 오류가 발생했어요');
    console.error(e);
  }
}

function resetPrayerModal() {
  state.editingPrayerId = null;
  document.getElementById('pName').value = '';
  document.getElementById('pText').value = '';
  document.getElementById('pType').value = '공개';
  const titleEl = document.querySelector('#prayerModal .modal-head h3');
  const subEl = document.querySelector('#prayerModal .modal-head .sub');
  const submitBtn = document.getElementById('pSubmit');
  if (titleEl) titleEl.textContent = '기도제목 등록';
  if (subEl) subEl.textContent = '공개·익명·교역자 전달 중 선택할 수 있습니다';
  if (submitBtn) submitBtn.textContent = '등록하기';
}

// 모달이 닫힐 때마다 폼/모드 초기화
document.querySelector('[data-close="prayerModal"]')?.addEventListener('click', resetPrayerModal);
document.getElementById('prayerModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'prayerModal') resetPrayerModal();
});

document.getElementById('pSubmit')?.addEventListener('click', async () => {
  const name = document.getElementById('pName').value.trim() || '익명';
  const type = document.getElementById('pType').value;
  const text = document.getElementById('pText').value.trim();
  if (!text) { toast('기도제목을 입력해주세요'); return; }
  const editingId = state.editingPrayerId;
  try {
    if (editingId) {
      // 수정: 본인 글만, 일부 필드만 갱신 (count·createdBy·timestamp는 보존)
      await update(ref(db, `prayers/${editingId}`), {
        name: type === '익명 공개' ? '익명' : name,
        type,
        text
      });
      closeModal('prayerModal');
      resetPrayerModal();
      toast('기도제목이 수정되었습니다');
    } else {
      await push(ref(db, 'prayers'), {
        name: type === '익명 공개' ? '익명' : name,
        type, text, count: 0,
        createdBy: state.uid, timestamp: Date.now()
      });
      closeModal('prayerModal');
      resetPrayerModal();
      toast(type === '교역자에게만 전달' ? '교역자에게 비공개로 전달되었습니다' : '기도제목이 등록되었습니다');
    }
  } catch (e) {
    toast((editingId ? '수정' : '등록') + ' 중 오류가 발생했어요');
    console.error(e);
  }
});

// ===== 재능나눔방 개설 =====
document.getElementById('rSubmit')?.addEventListener('click', async () => {
  const title = document.getElementById('rTitle').value.trim();
  if (!title) { toast('방 제목을 입력해주세요'); return; }
  try {
    await push(ref(db, 'rooms'), {
      title,
      category: document.getElementById('rCat').value,
      target: document.getElementById('rTarget').value,
      teacher: '승인 대기',
      schedule: document.getElementById('rWhen').value.trim() || '일정 협의',
      place: document.getElementById('rPlace').value.trim() || '장소 협의',
      capacity: Number(document.getElementById('rCap').value || 5),
      joined: 0,
      status: '승인대기',
      desc: document.getElementById('rDesc').value.trim() || '관리자 승인 후 공개됩니다.',
      approved: false,
      createdBy: state.uid,
      timestamp: Date.now()
    });
    ['rTitle','rWhen','rPlace','rDesc'].forEach((i) => { const e = document.getElementById(i); if (e) e.value = ''; });
    closeModal('roomCreateModal');
    toast('개설 신청 접수 — 관리자 승인 후 공개됩니다');
  } catch (e) {
    toast('신청 중 오류가 발생했어요');
    console.error(e);
  }
});

// ===== 봉사 신청 =====
// 종류가 '기타'면 직접 입력 필드 표시
document.getElementById('vKind')?.addEventListener('change', (e) => {
  const wrap = document.getElementById('vKindOtherWrap');
  if (wrap) wrap.style.display = e.target.value === '기타' ? '' : 'none';
});

document.getElementById('vSubmit')?.addEventListener('click', async () => {
  const name = document.getElementById('vName').value.trim();
  if (!name) { toast('이름을 입력해주세요'); return; }
  let type = document.getElementById('vKind').value;
  if (type === '기타') {
    const other = document.getElementById('vKindOther').value.trim();
    if (!other) { toast('기타 봉사 내용을 입력해주세요'); return; }
    type = `기타 (${other})`;
  }
  try {
    const newRef = await push(ref(db, 'applications'), {
      kind: '봉사', name,
      phone: document.getElementById('vPhone').value.trim(),
      type,
      time: document.getElementById('vTime').value.trim(),
      userUid: state.uid, timestamp: Date.now()
    });
    recordMyApplication(newRef.key);
    ['vName','vPhone','vTime','vKindOther'].forEach((i) => { const e = document.getElementById(i); if (e) e.value = ''; });
    document.getElementById('vKindOtherWrap').style.display = 'none';
    closeModal('volunteerModal');
    toast('봉사 신청이 접수되었습니다');
  } catch (e) {
    toast('신청 중 오류가 발생했어요');
    console.error(e);
  }
});

// ===== 심방 요청 =====
document.getElementById('vtSubmit')?.addEventListener('click', async () => {
  const name = document.getElementById('vtName').value.trim();
  if (!name) { toast('이름을 입력해주세요'); return; }
  const phone = document.getElementById('vtPhone').value.trim();
  if (!phone) { toast('연락처를 입력해주세요'); return; }
  try {
    const newRef = await push(ref(db, 'applications'), {
      kind: '심방요청', name, phone,
      date: document.getElementById('vtDate').value,
      message: document.getElementById('vtMsg').value.trim(),
      userUid: state.uid, timestamp: Date.now()
    });
    recordMyApplication(newRef.key);
    ['vtName', 'vtPhone', 'vtMsg'].forEach((id) => { const e = document.getElementById(id); if (e) e.value = ''; });
    document.getElementById('vtDate').value = '';
    closeModal('visitModal');
    toast('심방 요청이 접수되었습니다. 교역자가 연락드립니다');
  } catch (e) {
    toast('신청 중 오류가 발생했어요');
    console.error(e);
  }
});

// ===== 새가족 등록 =====
document.getElementById('ncSubmit')?.addEventListener('click', async () => {
  const name = document.getElementById('ncName').value.trim();
  if (!name) { toast('이름을 입력해주세요'); return; }
  const phone = document.getElementById('ncPhone').value.trim();
  if (!phone) { toast('연락처를 입력해주세요'); return; }
  try {
    const newRef = await push(ref(db, 'applications'), {
      kind: '새가족', name, phone,
      address: document.getElementById('ncAddress').value.trim(),
      how: document.getElementById('ncHow').value,
      userUid: state.uid, timestamp: Date.now()
    });
    recordMyApplication(newRef.key);
    ['ncName', 'ncPhone', 'ncAddress'].forEach((id) => { const e = document.getElementById(id); if (e) e.value = ''; });
    closeModal('newcomerModal');
    toast('새가족 등록이 접수되었습니다. 담당 사역자가 연락드립니다');
  } catch (e) {
    toast('신청 중 오류가 발생했어요');
    console.error(e);
  }
});

// ===== 큰글씨 모드 =====
const easySwitch = document.getElementById('easySwitch');
if (localStorage.getItem('easyMode') === '1') {
  document.body.classList.add('easy');
  easySwitch?.classList.add('on');
}
document.getElementById('easyToggle')?.addEventListener('click', () => {
  document.body.classList.toggle('easy');
  const on = document.body.classList.contains('easy');
  easySwitch?.classList.toggle('on', on);
  localStorage.setItem('easyMode', on ? '1' : '0');
  toast(on ? '큰글씨 모드 켜짐' : '기본 글씨 모드');
});

// ===== 다크 모드 =====
function applyTheme(mode) {
  // mode: 'dark' | 'light' | 'system'
  document.documentElement.setAttribute('data-theme', mode === 'system' ? 'system' : mode);
  // theme-color 메타도 함께 변경 (브라우저 상단 컬러)
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    meta.setAttribute('content', isDark ? '#16181c' : '#73926d');
  }
}
const _savedTheme = localStorage.getItem('theme') || 'light';
applyTheme(_savedTheme);
const darkSwitch = document.getElementById('darkSwitch');
if (_savedTheme === 'dark') darkSwitch?.classList.add('on');
document.getElementById('darkToggle')?.addEventListener('click', () => {
  const cur = localStorage.getItem('theme') || 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', next);
  applyTheme(next);
  darkSwitch?.classList.toggle('on', next === 'dark');
  toast(next === 'dark' ? '다크 모드' : '라이트 모드');
});
// 시스템 다크모드 변화 감지 (mode === 'system'일 때 theme-color 갱신)
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  applyTheme(localStorage.getItem('theme') || 'light');
});

// ===== 알림 토글 (FCM) =====
document.getElementById('notifToggle')?.addEventListener('click', async () => {
  const sw = document.getElementById('notifSwitch');
  if (!('Notification' in window)) { toast('이 기기는 알림을 지원하지 않아요'); return; }
  if (Notification.permission === 'granted') {
    sw?.classList.toggle('on');
    const isOn = sw?.classList.contains('on');
    localStorage.setItem('notifEnabled', isOn ? '1' : '0');
    toast(isOn ? '알림이 켜졌어요' : '알림이 꺼졌어요');
    if (isOn) registerFcmToken();
    return;
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    sw?.classList.add('on');
    localStorage.setItem('notifEnabled', '1');
    toast('알림이 켜졌어요');
    registerFcmToken();
  } else {
    toast('알림 권한이 거부되었어요');
  }
});

async function registerFcmToken() {
  if (!('serviceWorker' in navigator)) return;
  if (!state.uid) return;
  try {
    const { getMessaging, getToken, onMessage } = await import("https://www.gstatic.com/firebasejs/12.12.1/firebase-messaging.js");
    const { app } = await import('/firebase-init.js');
    const messaging = getMessaging(app);
    const VAPID_KEY = 'BGQzzUOtUMyWSULqJ3aK1AyZBi3epr1FcsAsLQsfjWuADsxzTHInCa2wABypxgsx8Bz9tuxStbDgXKdfB3zpqgs';
    if (!VAPID_KEY) { console.info('FCM: VAPID 키 미설정'); return; }
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      await set(ref(db, `fcmTokens/${state.uid}/${token}`), { ts: Date.now() });
    }
    onMessage(messaging, (payload) => {
      toast(payload.notification?.title || '새 알림');
    });
  } catch (e) {
    console.warn('FCM 등록 실패:', e.message);
  }
}

if (localStorage.getItem('notifEnabled') === '1' && Notification.permission === 'granted') {
  document.getElementById('notifSwitch')?.classList.add('on');
}

// ===== 그 외 =====
// ===== 로그아웃 =====
async function handleLogout() {
  if (!confirm('로그아웃하시겠어요?\n\n로그아웃하면 로그인 화면으로 돌아갑니다.\n(서버에 등록된 기도제목·신청 등은 다시 로그인 시 그대로 보입니다)')) return;
  try {
    sessionStorage.removeItem('myAppIds');
    await signOut(auth);
    // onAuthStateChanged가 자동으로 #authScreen을 표시
  } catch (e) {
    console.error('[logout] 실패:', e);
    toast('로그아웃 중 오류: ' + (e.code || e.message));
  }
}

// ===== 탈퇴 (내 모든 데이터 영구 삭제) =====
async function handleWithdraw() {
  if (!state.uid) { toast('로그인 정보가 없어요'); return; }

  const confirmMsg = [
    '⚠️ 정말 탈퇴하시겠어요?',
    '',
    '다음 데이터가 모두 영구 삭제됩니다:',
    '• 내가 등록한 기도제목',
    '• 내가 신청한 모든 신청 (행사·소모임·재능나눔·심방·새가족·봉사)',
    '• 내가 작성한 커뮤니티 글 + 댓글·좋아요 기록',
    '• 내가 작성한 묵상 노트 (개인 비공개)',
    '• 내가 보낸 의견·건의',
    '• 내가 참여(아멘)한 기도 기록',
    '• 프로필·알림 토큰',
    '• 회원 계정 자체',
    '',
    '이 작업은 되돌릴 수 없습니다.'
  ].join('\n');
  if (!confirm(confirmMsg)) return;

  const phrase = prompt('삭제를 진행하려면 아래 단어를 정확히 입력해주세요:\n\n삭제');
  if (phrase !== '삭제') { toast('탈퇴가 취소되었습니다'); return; }

  toast('데이터를 삭제 중입니다…');
  const uid = state.uid;
  const ops = [];

  // 1) 내가 등록한 기도제목 + 그 기도의 prayedBy 컬렉션 전체
  (state.prayers || []).filter((p) => p.createdBy === uid).forEach((p) => {
    ops.push(remove(ref(db, `prayers/${p.id}`)).catch(() => {}));
    ops.push(remove(ref(db, `prayedBy/${p.id}`)).catch(() => {}));
  });

  // 2) 내가 제출한 신청 (sessionStorage에 저장된 ID 기반)
  try {
    const myAppIds = JSON.parse(sessionStorage.getItem('myAppIds') || '[]');
    myAppIds.forEach((id) => {
      ops.push(remove(ref(db, `applications/${id}`)).catch(() => {}));
    });
  } catch {}

  // (갤러리 기능은 제거됨 — 옛 데이터는 보존됨)

  // 4) 내가 참여(아멘)한 기록
  Object.keys(state.prayedBy || {}).forEach((prayerId) => {
    ops.push(remove(ref(db, `prayedBy/${prayerId}/${uid}`)).catch(() => {}));
  });

  // 5) FCM 토큰
  ops.push(remove(ref(db, `fcmTokens/${uid}`)).catch(() => {}));

  // 6) /users/{uid} 프로필 삭제
  ops.push(remove(ref(db, `users/${uid}`)).catch(() => {}));

  // 6-1) 묵상 노트 (본인만 read/write 가능한 컬렉션)
  ops.push(remove(ref(db, `userNotes/${uid}`)).catch(() => {}));

  // 7) 내가 작성한 커뮤니티 글 + 그 글의 좋아요/댓글 컬렉션 전체 + 첨부 사진(다중)
  (state.posts || []).filter((p) => p.authorUid === uid).forEach((p) => {
    ops.push(remove(ref(db, `posts/${p.id}`)).catch(() => {}));
    ops.push(remove(ref(db, `postLikes/${p.id}`)).catch(() => {}));
    ops.push(remove(ref(db, `postComments/${p.id}`)).catch(() => {}));
    const paths = p.imageStoragePaths || (p.imageStoragePath ? [p.imageStoragePath] : []);
    paths.forEach((path) => {
      ops.push(deleteObject(sRef(storage, path)).catch(() => {}));
    });
  });

  // 8) 다른 사람 글에 내가 누른 좋아요 기록 정리
  Object.keys(state.postLikes || {}).forEach((postId) => {
    ops.push(remove(ref(db, `postLikes/${postId}/${uid}`)).catch(() => {}));
  });

  // 9) 의견·건의 (sessionStorage에 기록된 본인 ID만 — /feedback 부모는 admin 전용 read)
  try {
    const fbIds = JSON.parse(sessionStorage.getItem('myFeedbackIds') || '[]');
    fbIds.forEach((fid) => {
      ops.push(remove(ref(db, `feedback/${fid}`)).catch(() => {}));
    });
  } catch {}

  // 모든 RTDB 삭제를 한 번에 await
  await Promise.all(ops);

  // 7) 로컬 저장소 정리
  ['myAppIds', 'myFeedbackIds', 'attendName', 'uploaderName', 'easyMode', 'notifEnabled', 'installDismissed']
    .forEach((k) => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch {} });

  // 8) Firebase Auth 계정 삭제 (recent login 필요 — 실패 시 재인증 후 재시도)
  try {
    if (auth.currentUser) await deleteUser(auth.currentUser);
  } catch (e) {
    if (e.code === 'auth/requires-recent-login') {
      const password = prompt('보안 확인을 위해 비밀번호를 다시 입력해주세요:');
      if (password) {
        try {
          const cred = EmailAuthProvider.credential(auth.currentUser.email, password);
          await reauthenticateWithCredential(auth.currentUser, cred);
          await deleteUser(auth.currentUser);
        } catch (e2) {
          console.warn('[withdraw] 재인증 실패:', e2.code);
          toast('비밀번호가 올바르지 않습니다. 다시 로그인 후 시도해주세요.');
          await signOut(auth).catch(() => {});
          return;
        }
      } else {
        await signOut(auth).catch(() => {});
        return;
      }
    } else {
      console.warn('[withdraw] deleteUser 실패, signOut으로 대체:', e.code);
      try { await signOut(auth); } catch {}
    }
  }

  toast('탈퇴가 완료되었습니다');
  setTimeout(() => location.reload(), 1500);
}

document.querySelectorAll('[data-action]').forEach((el) => {
  el.addEventListener('click', () => {
    const a = el.dataset.action;
    if (a === 'attendance') openCheckinModal();
    else if (a === 'install') triggerInstall();
    else if (a === 'visit') {
      ['vtName', 'vtPhone', 'vtMsg'].forEach((id) => { const e = document.getElementById(id); if (e) e.value = ''; });
      autofillFromProfile({ name: 'vtName', phone: 'vtPhone' });
      openModal('visitModal');
    }
    else if (a === 'newcomer') {
      ['ncName', 'ncPhone', 'ncAddress'].forEach((id) => { const e = document.getElementById(id); if (e) e.value = ''; });
      autofillFromProfile({ name: 'ncName', phone: 'ncPhone' });
      openModal('newcomerModal');
    }
    else if (a === 'info' || a === 'contact') openInfoModal();
    else if (a === 'myPrayers') openMyPrayers();
    else if (a === 'myApplications') openMyApplications();
    else if (a === 'logout') handleLogout();
    else if (a === 'withdraw') handleWithdraw();
    else if (a === 'devotion') openDevotionForToday();
    else if (a === 'shareVerse') shareTodaysVerse();
    else if (a === 'myNotes') openMyNotes();
    else toast('기능 준비 중이에요');
  });
});

document.getElementById('annMore')?.addEventListener('click', (e) => { e.preventDefault(); openAnnouncementsList(); });
document.getElementById('notifBtn')?.addEventListener('click', openNotifications);
document.getElementById('searchBtn')?.addEventListener('click', openSearch);

// ===== 리스트 모달 헬퍼 =====
function openListModal(title, rowsHtml, { searchPlaceholder, onSearch } = {}) {
  const titleEl = document.getElementById('listTitle');
  const body = document.getElementById('listBody');
  const wrap = document.getElementById('listSearchWrap');
  const input = document.getElementById('listSearchInput');
  if (titleEl) titleEl.textContent = title;
  if (body) body.innerHTML = rowsHtml || '<div class="list-empty">표시할 내용이 없어요</div>';
  if (wrap && input) {
    if (onSearch) {
      wrap.style.display = '';
      input.placeholder = searchPlaceholder || '검색어를 입력하세요';
      input.value = '';
      input.oninput = () => onSearch(input.value.trim());
      setTimeout(() => input.focus(), 100);
    } else {
      wrap.style.display = 'none';
      input.oninput = null;
    }
  }
  openModal('listModal');
}

function listRowHtml({ tag, tagClass, title, body, time }) {
  return `
    <div class="list-row">
      <div class="lr-top">
        ${tag ? `<span class="lr-tag ${tagClass || ''}">${escapeHtml(tag)}</span>` : ''}
        ${time ? `<span style="margin-left:auto;">${escapeHtml(time)}</span>` : ''}
      </div>
      <h4>${escapeHtml(title || '')}</h4>
      ${body ? `<p>${escapeHtml(body)}</p>` : ''}
    </div>`;
}

// ===== 내 기도제목 =====
function openMyPrayers() {
  const mine = (state.prayers || []).filter((p) => p.createdBy === state.uid);
  const rows = mine.map((p) => listRowHtml({
    tag: p.type || '공개',
    title: p.text || '',
    body: `🙏 ${p.count || 0}명이 함께 기도`,
    time: timeAgo(p.timestamp)
  })).join('');
  openListModal('내 기도제목', rows || '<div class="list-empty">아직 등록한 기도제목이 없어요</div>');
}

// ===== 내 신청 내역 =====
async function openMyApplications() {
  // applications는 보안 규칙상 본인 것만 읽을 수 있어 직접 query 불가 → 본인 항목만 필터링 어려움.
  // 대신 사용자 자신이 만든 rooms 신청, 봉사·심방·새가족 신청을 anonymous uid로 필터.
  // 보안 규칙: data.child('userUid').val() === auth.uid 인 항목만 읽기 허용.
  // 따라서 each 항목별 get은 비효율 — applications 컬렉션 전체를 한 번에 받지 못함.
  // 대안: localStorage 캐시로 본인이 신청한 ID 보관.
  const ids = JSON.parse(sessionStorage.getItem('myAppIds') || '[]');
  if (!ids.length) {
    openListModal('내 신청 내역', '<div class="list-empty">아직 신청한 내역이 없어요</div>');
    return;
  }
  const items = [];
  for (const id of ids) {
    try {
      const snap = await get(ref(db, `applications/${id}`));
      if (snap.exists()) items.push({ id, ...snap.val() });
    } catch {}
  }
  items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const rows = items.map((a) => {
    let detail = a.roomTitle || a.type || '';
    if (a.kind === '심방요청' && a.date) detail = `희망일: ${a.date}`;
    if (a.kind === '새가족' && a.address) detail = a.address;
    return `<div class="list-row" data-app-id="${escapeHtml(a.id)}">
      <div class="list-row-main">
        <div class="list-row-head">
          <span class="tag">${escapeHtml(a.kind || '신청')}</span>
          <span class="time">${escapeHtml(timeAgo(a.timestamp))}</span>
        </div>
        <div class="list-row-title">${escapeHtml(detail)}</div>
        <div class="list-row-body">${escapeHtml(a.name || '')}${a.phone ? ' · ' + escapeHtml(a.phone) : ''}</div>
      </div>
      <button class="list-row-del" data-del-app="${escapeHtml(a.id)}" type="button" title="신청 취소">🗑️</button>
    </div>`;
  }).join('');
  openListModal('내 신청 내역', rows || '<div class="list-empty">신청 내역을 불러오지 못했어요</div>');

  // 신청 취소(삭제) — 본인 application만 (rules에서 owner 삭제 허용)
  document.querySelectorAll('#listBody [data-del-app]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.delApp;
      if (!confirm('이 신청을 취소(삭제)하시겠어요?')) return;
      try {
        await remove(ref(db, `applications/${id}`));
        // 캐시도 정리
        try {
          const cur = JSON.parse(sessionStorage.getItem('myAppIds') || '[]');
          sessionStorage.setItem('myAppIds', JSON.stringify(cur.filter((x) => x !== id)));
        } catch {}
        // 화면에서 행 제거
        btn.closest('.list-row')?.remove();
        toast('신청이 취소되었습니다');
      } catch (err) {
        console.error('[apps] 삭제 실패:', err);
        toast('삭제 실패: ' + (err.code || err.message));
      }
    });
  });
}

function recordMyApplication(id) {
  if (!id) return;
  try {
    const ids = JSON.parse(sessionStorage.getItem('myAppIds') || '[]');
    if (!ids.includes(id)) {
      ids.unshift(id);
      sessionStorage.setItem('myAppIds', JSON.stringify(ids.slice(0, 50)));
    }
  } catch {}
}

// ===== 알림 (최근 공지·주보) =====
function openNotifications() {
  const items = [
    ...(state.announcements || []).slice(0, 10).map((a) => ({
      ts: a.timestamp || 0,
      tag: tagLabel(a.tag),
      tagClass: a.tag || 'notice',
      title: a.title || '',
      body: a.body || ''
    })),
    ...(state.bulletins || []).slice(0, 5).map((b) => ({
      ts: b.timestamp || 0,
      tag: '주보',
      tagClass: 'event',
      title: b.title || '주보',
      body: b.date || ''
    }))
  ].sort((a, b) => b.ts - a.ts).slice(0, 15);
  const rows = items.map((i) => listRowHtml({
    tag: i.tag, tagClass: i.tagClass, title: i.title, body: i.body, time: timeAgo(i.ts)
  })).join('');
  openListModal('알림', rows || '<div class="list-empty">새 알림이 없어요</div>');
  document.getElementById('notifBtn')?.querySelector('.dot')?.remove();
}

// ===== 검색 =====
// 검색 결과용 — 클릭 라우팅을 위해 data-attribute를 단 listRowHtml
function searchRowHtml(opts) {
  const { tag, tagClass = 'notice', title, body, time, dataAttrs = '' } = opts;
  return `<div class="list-row" ${dataAttrs} style="cursor:pointer;">
    <div class="lr-top"><span class="lr-tag ${escapeHtml(tagClass)}">${escapeHtml(tag)}</span><span>${escapeHtml(time || '')}</span></div>
    <h4>${escapeHtml(title || '')}</h4>
    ${body ? `<p>${escapeHtml(body)}</p>` : ''}
  </div>`;
}

function openSearch() {
  const placeholderEmpty = '<div class="list-empty">교회 소식·말씀·기도제목·커뮤니티를 검색해보세요</div>';
  const renderResults = (q) => {
    const body = document.getElementById('listBody');
    if (!body) return;
    if (!q) { body.innerHTML = placeholderEmpty; return; }
    const lq = q.toLowerCase();
    const matchAnn = (state.announcements || []).filter((a) =>
      (a.title || '').toLowerCase().includes(lq) || (a.body || '').toLowerCase().includes(lq)
    ).map((a) => searchRowHtml({
      tag: '공지', tagClass: a.tag || 'notice', title: a.title, body: a.body, time: timeAgo(a.timestamp),
      dataAttrs: a.signupEnabled ? `data-search-go="ann" data-id="${escapeHtml(a.id)}"` : ''
    }));
    const matchPost = (state.posts || []).filter((p) =>
      (p.title || '').toLowerCase().includes(lq) ||
      (p.body || '').toLowerCase().includes(lq) ||
      (p.authorName || '').toLowerCase().includes(lq)
    ).map((p) => searchRowHtml({
      tag: '커뮤니티', tagClass: 'event', title: p.title, body: (p.body || '').slice(0, 80), time: timeAgo(p.timestamp),
      dataAttrs: `data-search-go="post" data-id="${escapeHtml(p.id)}"`
    }));
    const matchPrayer = (state.prayers || []).filter((p) => p.type !== '교역자에게만 전달' &&
      ((p.text || '').toLowerCase().includes(lq) || (p.name || '').toLowerCase().includes(lq))
    ).map((p) => searchRowHtml({
      tag: '기도', title: p.text, body: p.name || '익명', time: timeAgo(p.timestamp),
      dataAttrs: 'data-search-go="prayer-tab"'
    }));
    const matchRoom = (state.rooms || []).filter((r) => r.approved !== false &&
      ((r.title || '').toLowerCase().includes(lq) || (r.desc || '').toLowerCase().includes(lq) || (r.category || '').toLowerCase().includes(lq))
    ).map((r) => searchRowHtml({
      tag: '재능나눔', title: r.title, body: r.desc, time: r.schedule,
      dataAttrs: 'data-search-go="rooms-tab"'
    }));
    const matchSermon = (state.sermonHistory || []).filter((s) =>
      (s.title || '').toLowerCase().includes(lq) || (s.verse || '').toLowerCase().includes(lq)
    ).map((s) => searchRowHtml({
      tag: '설교', tagClass: 'notice', title: s.title, body: s.verse, time: timeAgo(s.timestamp),
      dataAttrs: `data-search-go="sermon" data-id="${escapeHtml(s.id)}"`
    }));
    const matchBul = (state.bulletins || []).filter((b) => (b.title || '').toLowerCase().includes(lq))
      .map((b) => searchRowHtml({
        tag: '주보', tagClass: 'notice', title: b.title, body: b.date, time: timeAgo(b.timestamp),
        dataAttrs: b.url ? `data-search-go="url" data-url="${escapeHtml(b.url)}"` : ''
      }));
    const all = [...matchAnn, ...matchPost, ...matchPrayer, ...matchRoom, ...matchSermon, ...matchBul];
    body.innerHTML = all.length ? all.join('') : `<div class="list-empty">"${escapeHtml(q)}"에 대한 결과가 없어요</div>`;

    // 클릭 라우팅
    body.querySelectorAll('[data-search-go]').forEach((el) => {
      el.addEventListener('click', () => {
        const kind = el.dataset.searchGo;
        const id = el.dataset.id;
        closeModal('listModal');
        if (kind === 'post' && id) setTimeout(() => openPostDetail(id), 250);
        else if (kind === 'sermon' && id) setTimeout(() => openSermonViewer(id), 250);
        else if (kind === 'ann' && id) setTimeout(() => openEventApplyModal(id, 'announcement'), 250);
        else if (kind === 'prayer-tab') setTimeout(() => switchTab('community'), 200);
        else if (kind === 'rooms-tab') setTimeout(() => { switchTab('community'); document.querySelector('[data-ctab="rooms"]')?.click(); }, 200);
        else if (kind === 'url' && el.dataset.url) window.open(el.dataset.url, '_blank', 'noopener');
      });
    });
  };
  openListModal('검색', placeholderEmpty, {
    searchPlaceholder: '예: 야외예배, 봉사, 감사',
    onSearch: renderResults
  });
}

// ===== 전체 공지 목록 =====
function openAnnouncementsList() {
  const rows = (state.announcements || []).map((a) => listRowHtml({
    tag: tagLabel(a.tag), tagClass: a.tag || 'notice',
    title: a.title, body: a.body, time: timeAgo(a.timestamp)
  })).join('');
  openListModal('전체 공지', rows || '<div class="list-empty">등록된 공지가 없어요</div>');
}

// ===== 출석 체크인 =====
function openCheckinModal() {
  const wrap = document.getElementById('ciServices');
  const services = state.services || [];
  if (wrap) {
    if (!services.length) {
      wrap.innerHTML = '<div style="padding:18px 12px;text-align:center;color:var(--muted);font-size:13px;">예배 정보가 아직 등록되지 않았어요</div>';
    } else {
      wrap.innerHTML = services.map((s) => `
        <label class="checkin-option">
          <input type="checkbox" value="${escapeHtml(s.id)}"/>
          <div class="co-info">
            <div class="co-name">${escapeHtml(s.name)}</div>
            <div class="co-meta">${escapeHtml(formatDays(s))} · ${escapeHtml(formatHM(s.time))}${s.place ? ' · ' + escapeHtml(s.place) : ''}</div>
          </div>
        </label>
      `).join('');
      // 체크 시각 효과
      wrap.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', () => {
          cb.closest('.checkin-option').classList.toggle('checked', cb.checked);
        });
      });
    }
  }
  const ciName = document.getElementById('ciName');
  if (ciName) ciName.value = localStorage.getItem('attendName') || '';
  const status = document.getElementById('ciStatus');
  if (status) { status.textContent = ''; status.style.color = ''; }
  openModal('checkinModal');
}

document.getElementById('ciSubmit')?.addEventListener('click', async () => {
  const name = document.getElementById('ciName')?.value.trim();
  const checked = Array.from(document.querySelectorAll('#ciServices input[type="checkbox"]:checked'))
    .map((cb) => cb.value);
  const status = document.getElementById('ciStatus');
  if (!name) { if (status) { status.textContent = '이름을 입력해주세요'; status.style.color = '#c44'; } return; }
  if (!checked.length) { if (status) { status.textContent = '예배를 1개 이상 선택해주세요'; status.style.color = '#c44'; } return; }
  const today = new Date().toISOString().slice(0, 10);
  const services = state.services || [];
  const btn = document.getElementById('ciSubmit');
  if (btn) { btn.disabled = true; btn.textContent = '체크 중...'; }
  if (status) { status.textContent = '💾 저장 중...'; status.style.color = ''; }
  try {
    // 선택한 예배별로 출석 entry를 따로 push (관리자 통계 집계 편의)
    const results = await Promise.all(checked.map((serviceId) => {
      const service = services.find((s) => s.id === serviceId);
      return push(ref(db, 'applications'), {
        kind: '출석', name,
        date: today,
        serviceId,
        serviceName: service ? `${formatDays(service)} ${service.name}` : '',
        userUid: state.uid, timestamp: Date.now()
      });
    }));
    results.forEach((r) => recordMyApplication(r.key));
    localStorage.setItem('attendName', name);
    if (status) {
      status.textContent = `✅ ${today} ${checked.length}개 예배 참석이 기록되었습니다`;
      status.style.color = 'var(--primary)';
    }
    setTimeout(() => closeModal('checkinModal'), 1500);
  } catch (e) {
    if (status) { status.textContent = '저장 실패: ' + (e.code || e.message); status.style.color = '#c44'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '체크하기'; }
  }
});

function openInfoModal() {
  const c = state.church || {};
  const services = state.services || [];
  const list = $('#infoServices');
  if (list) {
    list.innerHTML = services.length
      ? services.map((s) => `
          <div class="info-service-row">
            <div class="info-service-name">${escapeHtml(s.name)}</div>
            <div class="info-service-time">${DAY_NAMES_KO[s.day]}요일 ${escapeHtml(s.time)}${s.place ? ` · ${escapeHtml(s.place)}` : ''}</div>
          </div>`).join('')
      : `<div class="info-empty">예배 시간 정보가 아직 등록되지 않았어요</div>`;
  }
  const setText = (sel, val, fallback = '') => { const el = $(sel); if (el) el.textContent = val || fallback; };
  setText('#infoName', c.name, '천안남산교회');
  setText('#infoTagline', c.tagline, '함께 예배하고, 함께 섬깁니다');
  setText('#infoPastor', c.pastor, '담임목사 정보 등록 예정');
  setText('#infoAddress', c.address, '주소 정보 등록 예정');
  setText('#infoDirections', c.directions, '');
  setText('#infoPhoneText', c.phone, '');
  setText('#infoEmailText', c.email, '');
  const phoneA = $('#infoPhoneLink'); if (phoneA && c.phone) phoneA.href = `tel:${c.phone.replace(/[^\d+]/g, '')}`;
  const emailA = $('#infoEmailLink'); if (emailA && c.email) emailA.href = `mailto:${c.email}`;
  if ($('#infoDirRow')) $('#infoDirRow').style.display = c.directions ? '' : 'none';
  if ($('#infoPhoneRow')) $('#infoPhoneRow').style.display = c.phone ? '' : 'none';
  if ($('#infoEmailRow')) $('#infoEmailRow').style.display = c.email ? '' : 'none';
  openModal('infoModal');
}

function $(sel) { return document.querySelector(sel); }

// ===== PWA 설치 =====
let deferredPrompt = null;
const installBanner = document.getElementById('installBanner');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (localStorage.getItem('installDismissed') !== '1') installBanner?.classList.add('show');
});
document.getElementById('installBtn')?.addEventListener('click', triggerInstall);
document.getElementById('installClose')?.addEventListener('click', () => {
  installBanner?.classList.remove('show');
  localStorage.setItem('installDismissed', '1');
});
async function triggerInstall() {
  if (!deferredPrompt) {
    toast('이미 설치되어 있거나, Safari 는 공유 → "홈 화면에 추가"로 설치하세요');
    return;
  }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') toast('설치되었습니다');
  deferredPrompt = null;
  installBanner?.classList.remove('show');
}
window.addEventListener('appinstalled', () => {
  installBanner?.classList.remove('show');
  toast('홈화면에 앱이 추가되었어요');
});

// ===== 교회 캘린더 =====
const MONTHS_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function renderCalendar() {
  const container = document.getElementById('calendarGrid');
  if (!container) return;
  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();
  const monthLabel = document.getElementById('calMonthLabel');
  if (monthLabel) monthLabel.textContent = `${year}년 ${MONTHS_KO[month]}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthEvents = (state.events || []).filter((e) => (e.date || '').startsWith(monthStr));

  const eventsByDate = {};
  monthEvents.forEach((e) => {
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(e);
  });

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  let html = '';
  let day = 1;
  for (let i = 0; i < totalCells; i++) {
    if (i >= firstDay && day <= daysInMonth) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const isToday = dateStr === todayStr;
      const dayEvents = eventsByDate[dateStr] || [];
      const col = i % 7;
      const isSun = col === 0, isSat = col === 6;
      html += `<div class="cal-cell${isToday ? ' today' : ''}" data-date="${dateStr}">
        <div class="cal-day${isSun ? ' sun' : isSat ? ' sat' : ''}">${day}</div>
        <div class="cal-events">${dayEvents.slice(0,3).map((e) =>
          `<div class="cal-dot cat-${escapeHtml(e.category || '기타')}" title="${escapeHtml(e.title)}"></div>`
        ).join('')}</div>
      </div>`;
      day++;
    } else {
      html += '<div class="cal-cell empty"></div>';
    }
  }
  container.innerHTML = html;
  container.querySelectorAll('.cal-cell:not(.empty)').forEach((cell) => {
    cell.addEventListener('click', () => openDayEvents(cell.dataset.date));
  });
  renderUpcomingEvents();
}

function openDayEvents(dateStr) {
  const dayEvents = (state.events || []).filter((e) => e.date === dateStr);
  if (!dayEvents.length) { toast('이 날은 등록된 일정이 없어요'); return; }
  const [, m, d] = dateStr.split('-');
  const rows = dayEvents.map((e) => listRowHtml({
    tag: e.category || '기타',
    tagClass: calCatClass(e.category),
    title: e.title,
    body: [e.time ? `🕐 ${e.time}` : '', e.location ? `📍 ${e.location}` : '', e.desc || ''].filter(Boolean).join('  ')
  })).join('');
  openListModal(`${parseInt(m)}월 ${parseInt(d)}일 일정`, rows);
}

function calCatClass(cat) {
  return ({예배: '', 행사: 'event', 교육: 'notice', 봉사: 'urgent'})[cat] || '';
}

function renderUpcomingEvents() {
  const list = document.getElementById('upcomingEvents');
  if (!list) return;
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = (state.events || [])
    .filter((e) => (e.date || '') >= todayStr)
    .slice(0, 8);
  if (!upcoming.length) {
    list.innerHTML = '<div class="list-empty">예정된 일정이 없어요. 관리자 페이지에서 일정을 등록하세요.</div>';
    return;
  }
  list.innerHTML = upcoming.map((e) => {
    const [, m, d] = (e.date || '').split('-');
    return listRowHtml({
      tag: e.category || '기타',
      tagClass: calCatClass(e.category),
      title: e.title,
      body: [e.time ? `🕐 ${e.time}` : '', e.location ? `📍 ${e.location}` : ''].filter(Boolean).join('  ') || e.desc || '',
      time: e.date ? `${parseInt(m)}/${parseInt(d)}` : ''
    });
  }).join('');
}

document.getElementById('calPrev')?.addEventListener('click', () => {
  state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() - 1, 1);
  renderCalendar();
});
document.getElementById('calNext')?.addEventListener('click', () => {
  state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 1);
  renderCalendar();
});

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      // 30분마다 SW 업데이트 체크
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
      // 새 SW 설치 감지 시 즉시 활성화 요청
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            sw.postMessage('SKIP_WAITING');
          }
        });
      });
      // controller 변경(새 SW 활성화) 시 페이지 새로고침
      let refreshed = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshed) return;
        refreshed = true;
        location.reload();
      });
    } catch (e) { console.warn('SW register fail:', e); }
  });
}
