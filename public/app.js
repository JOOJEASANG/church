/* =============================================================
 * 천안남산교회 PWA — 사용자 앱 (Firebase RTDB 연동)
 * ============================================================= */

import { db, auth, storage } from '/firebase-init.js';
import { resizeImage, humanSize } from '/img-utils.js';
import {
  ref, onValue, push, update, get, set, remove, serverTimestamp, query, orderByChild
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import {
  onAuthStateChanged, updateProfile, signOut, deleteUser,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  ref as sRef, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js";


// ----- 상태 -----
const state = {
  uid: null,
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
  gallery: [],
  events: [],
  sermonHistory: [],
  posts: [],
  postLikes: {},
  currentPostId: null,
  editingPrayerId: null,
  editingPostId: null,
  pendingPostImage: null,
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
}
function hideAuthScreen() {
  const el = document.getElementById('authScreen');
  if (el) el.classList.remove('show');
  document.body.style.overflow = '';
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
    'auth/network-request-failed': '네트워크 연결을 확인해주세요.'
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
      email, displayName: name, phone, role, createdAt: Date.now(),
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
      <li>행사 신청, 봉사 신청, 심방 요청, 새가족 등록</li>
      <li>예배 체크(다중 참석 가능), 갤러리, 푸시 알림</li>
    </ul>

    <h4>제3조 (회원가입)</h4>
    <ul>
      <li>이름, 연락처, 이메일, 비밀번호를 입력하여 가입할 수 있습니다.</li>
      <li>회원은 본 약관과 개인정보 처리방침에 동의해야 가입이 완료됩니다.</li>
      <li>등록한 이름·연락처는 행사·봉사 등 신청 시 자동으로 사용되어 빠른 신청을 돕습니다.</li>
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
      <li><b>회원가입 시 (필수)</b>: 이름, 연락처(전화번호), 이메일, 비밀번호(암호화 저장)</li>
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
    listenersAttached = false;
    state.uid = null;
    state.userProfile = null;
    // 로그아웃 시 열려있는 모든 모달 닫기 (잘못된 uid로 폼 제출 방지)
    document.querySelectorAll('.modal-bg.show').forEach((m) => closeModal(m.id));
    showAuthScreen();
    return;
  }
  hideAuthScreen();
  state.uid = user.uid;
  // 프로필 정보 가져오기 (없어도 동작은 OK)
  try {
    const psnap = await get(ref(db, `users/${user.uid}`));
    state.userProfile = psnap.exists() ? psnap.val() : { email: user.email, displayName: user.displayName || '' };
  } catch {
    state.userProfile = { email: user.email, displayName: user.displayName || '' };
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
    await push(ref(db, 'feedback'), {
      title, body,
      authorUid: state.uid,
      authorName: state.userProfile?.displayName || '성도',
      authorRole: state.userProfile?.role || '성도',
      authorEmail: state.userProfile?.email || '',
      timestamp: Date.now(),
      status: 'open'
    });
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
    console.error('[profile-edit]', e);
    toast('저장 실패: ' + (e.code || e.message));
  }
});


// ===== 실시간 리스너 =====
let listenersAttached = false;

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
  return onValue(ref(db, path), handler, (err) => {
    console.error(`[home] ${path} 읽기 실패:`, err.code || err.message);
  });
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
  onValue(ref(db, 'config/services'), (snap) => {
    state.services = [];
    snap.forEach((c) => { state.services.push({ id: c.key, ...c.val() }); });
    state.services.sort((a, b) => (serviceFirstDay(a) - serviceFirstDay(b)) || (a.time || '').localeCompare(b.time || ''));
    renderServiceTimes();
  }, (err) => {
    console.error('[home] config/services 읽기 실패:', err.code || err.message, err);
    const list = document.getElementById('serviceList');
    if (list) list.innerHTML = `<div class="service-empty">⚠️ 예배 시간을 불러오지 못했습니다 (${err.code || '권한 오류'})</div>`;
  });
  onValueWithError('config/hero', (snap) => {
    state.hero = snap.val() || null;
    applyHero();
  });

  onValueWithError('gallery', (snap) => {
    state.gallery = [];
    snap.forEach((c) => { state.gallery.push({ id: c.key, ...c.val() }); });
    state.gallery.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderGallery();
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

function renderGallery() {
  const grid = document.getElementById('galleryGrid');
  if (!grid) return;
  if (!state.gallery.length) {
    grid.innerHTML = '<div class="gallery-empty">아직 등록된 사진이 없어요. 첫 사진을 올려주세요!</div>';
    return;
  }
  grid.innerHTML = state.gallery.map((g) => `
    <div class="gallery-item" data-view="${g.id}">
      <img src="${escapeHtml(safeImageUrl(g.url))}" alt="${escapeHtml(g.caption || '')}" loading="lazy"/>
    </div>
  `).join('');
  grid.querySelectorAll('[data-view]').forEach((el) => {
    el.addEventListener('click', () => openGalleryViewer(el.dataset.view));
  });
}

function openGalleryViewer(id) {
  const g = state.gallery.find((x) => x.id === id);
  if (!g) return;
  const img = document.getElementById('gvImg');
  const meta = document.getElementById('gvMeta');
  img.src = safeImageUrl(g.url);
  img.alt = g.caption || '';
  const date = g.timestamp ? new Date(g.timestamp) : null;
  const dateStr = date ? `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}` : '';
  meta.innerHTML = `<b>${escapeHtml(g.uploaderName || '익명')}</b>${g.caption ? ' · ' + escapeHtml(g.caption) : ''}${dateStr ? ' · ' + dateStr : ''}`;
  openModal('galleryViewer');
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

function openModal(id) {
  document.getElementById(id)?.classList.add('show');
  document.body.style.overflow = 'hidden';
  // 신청 폼이면 프로필 자동 입력
  const map = PROFILE_AUTOFILL_MAP[id];
  if (map) autofillFromProfile(map);
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove('show');
  document.body.style.overflow = '';
  // 보안: 비밀번호 필드 자동 초기화
  m.querySelectorAll('input[type="password"]').forEach((i) => { i.value = ''; });
  // sermon viewer는 iframe 정지
  if (id === 'sermonViewerModal') {
    const f = m.querySelector('iframe');
    if (f) f.src = '';
  }
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

// ===== 오늘의 말씀 =====
const DAILY_VERSES = [
  { ref: '시편 23:1', text: '여호와는 나의 목자시니 내게 부족함이 없으리로다.' },
  { ref: '요한복음 3:16', text: '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라.' },
  { ref: '빌립보서 4:13', text: '내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라.' },
  { ref: '잠언 3:5-6', text: '너는 마음을 다하여 여호와를 신뢰하고 네 명철을 의지하지 말라 너는 범사에 그를 인정하라 그리하면 네 길을 지도하시리라.' },
  { ref: '이사야 41:10', text: '두려워하지 말라 내가 너와 함께 함이라 놀라지 말라 나는 네 하나님이 됨이라 내가 너를 굳세게 하리라 참으로 너를 도와 주리라.' },
  { ref: '로마서 8:28', text: '우리가 알거니와 하나님을 사랑하는 자 곧 그의 뜻대로 부르심을 입은 자들에게는 모든 것이 합력하여 선을 이루느니라.' },
  { ref: '예레미야 29:11', text: '여호와의 말씀이니라 너희를 향한 나의 생각을 내가 아나니 평안이요 재앙이 아니니라 너희에게 미래와 희망을 주는 것이니라.' },
  { ref: '시편 46:1', text: '하나님은 우리의 피난처시요 힘이시니 환난 중에 만날 큰 도움이시라.' },
  { ref: '마태복음 11:28', text: '수고하고 무거운 짐 진 자들아 다 내게로 오라 내가 너희를 쉬게 하리라.' },
  { ref: '시편 119:105', text: '주의 말씀은 내 발에 등이요 내 길에 빛이니이다.' },
  { ref: '고린도전서 13:4-5', text: '사랑은 오래 참고 사랑은 온유하며 시기하지 아니하며 사랑은 자랑하지 아니하며 교만하지 아니하며.' },
  { ref: '요한복음 14:6', text: '예수께서 이르시되 내가 곧 길이요 진리요 생명이니 나로 말미암지 않고는 아버지께로 올 자가 없느니라.' },
  { ref: '시편 27:1', text: '여호와는 나의 빛이요 나의 구원이시니 내가 누구를 두려워하리요 여호와는 내 생명의 능력이시니 내가 누구를 무서워하리요.' },
  { ref: '베드로전서 5:7', text: '너희 염려를 다 주께 맡기라 이는 그가 너희를 돌보심이라.' },
  { ref: '이사야 40:31', text: '오직 여호와를 앙망하는 자는 새 힘을 얻으리니 독수리가 날개치며 올라감 같을 것이요 달음박질하여도 곤비하지 아니하겠고 걸어가도 피곤하지 아니하리로다.' },
  { ref: '로마서 12:2', text: '너희는 이 세대를 본받지 말고 오직 마음을 새롭게 함으로 변화를 받아 하나님의 선하시고 기뻐하시고 온전하신 뜻이 무엇인지 분별하도록 하라.' },
  { ref: '갈라디아서 5:22-23', text: '오직 성령의 열매는 사랑과 희락과 화평과 오래 참음과 자비와 양선과 충성과 온유와 절제니 이 같은 것을 금지할 법이 없느니라.' },
  { ref: '여호수아 1:9', text: '내가 네게 명령한 것이 아니냐 강하고 담대하라 두려워하지 말며 놀라지 말라 네가 어디로 가든지 네 하나님 여호와가 너와 함께 하느니라.' },
  { ref: '시편 121:1-2', text: '내가 산을 향하여 눈을 들리라 나의 도움이 어디서 올까 나의 도움은 천지를 지으신 여호와에게서로다.' },
  { ref: '마태복음 6:33', text: '그런즉 너희는 먼저 그의 나라와 그의 의를 구하라 그리하면 이 모든 것을 너희에게 더하시리라.' },
  { ref: '에베소서 2:8-9', text: '너희는 그 은혜에 의하여 믿음으로 말미암아 구원을 받았으니 이것은 너희에게서 난 것이 아니요 하나님의 선물이라 행위에서 난 것이 아니니 이는 누구든지 자랑하지 못하게 함이라.' },
  { ref: '요한일서 4:7', text: '사랑하는 자들아 우리가 서로 사랑하자 사랑은 하나님께 속한 것이니 사랑하는 자마다 하나님으로부터 나서 하나님을 알고.' },
  { ref: '시편 37:4', text: '또 여호와를 기뻐하라 그가 네 마음의 소원을 네게 이루어 주시리로다.' },
  { ref: '히브리서 11:1', text: '믿음은 바라는 것들의 실상이요 보이지 않는 것들의 증거니.' },
  { ref: '시편 139:14', text: '내가 주께 감사하옴은 나를 지으심이 심히 기묘하심이라 주께서 하시는 일이 기이함을 내 영혼이 잘 아나이다.' },
  { ref: '잠언 16:3', text: '너의 행사를 여호와께 맡기라 그리하면 네가 경영하는 것이 이루어지리라.' },
  { ref: '요한복음 15:5', text: '나는 포도나무요 너희는 가지라 그가 내 안에 내가 그 안에 거하면 사람이 열매를 많이 맺나니 나를 떠나서는 너희가 아무 것도 할 수 없음이라.' },
  { ref: '데살로니가전서 5:16-18', text: '항상 기뻐하라 쉬지 말고 기도하라 범사에 감사하라 이것이 그리스도 예수 안에서 너희를 향하신 하나님의 뜻이니라.' },
  { ref: '시편 91:1-2', text: '지존자의 은밀한 곳에 거주하며 전능자의 그늘 아래에 사는 자여 나는 여호와를 향하여 말하기를 그는 나의 피난처요 나의 요새요 내가 의뢰하는 하나님이라 하리로다.' },
  { ref: '마태복음 5:16', text: '이같이 너희 빛이 사람 앞에 비치게 하여 그들로 너희 착한 행실을 보고 하늘에 계신 너희 아버지께 영광을 돌리게 하라.' },
  { ref: '신명기 6:5', text: '너는 마음을 다하고 뜻을 다하고 힘을 다하여 네 하나님 여호와를 사랑하라.' }
];

function setDailyVerse() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - start.getTime()) / 86400000);
  const v = DAILY_VERSES[dayOfYear % DAILY_VERSES.length];
  const t = document.getElementById('verseText');
  const r = document.getElementById('verseRef');
  if (t) t.textContent = v.text;
  if (r) r.textContent = v.ref;
}
setDailyVerse();

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
function renderPosts() {
  const feed = document.getElementById('postFeed');
  if (!feed) return;
  const posts = state.posts || [];
  if (!posts.length) {
    feed.innerHTML = '<div class="feed-card"><h3>아직 등록된 나눔글이 없어요</h3><p>첫 글을 남겨주세요.</p></div>';
    return;
  }
  feed.innerHTML = posts.map((p) => {
    const liked = !!state.postLikes[p.id];
    const thumb = safeImageUrl(p.imageUrl);
    const signupTag = p.signupEnabled ? '<span class="pc-signup-tag">📝 신청</span>' : '';
    return `
      <article class="post-card${p.signupEnabled ? ' has-signup' : ''}" data-post-id="${escapeHtml(p.id)}">
        <div class="post-card-head">
          <span class="pc-author">${escapeHtml(userLabel(p.authorName, p.authorRole))}</span>
          <span class="pc-time">${timeAgo(p.timestamp)}</span>
        </div>
        <h3>${escapeHtml(p.title || '')}${signupTag}</h3>
        ${thumb ? `<img class="pc-thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy"/>` : ''}
        <p class="pc-body">${escapeHtml(p.body || '')}</p>
        <div class="post-card-foot">
          <span class="${liked ? 'liked' : ''}">👍 ${p.likeCount || 0}</span>
          <span>💬 ${p.commentCount || 0}</span>
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
    document.getElementById('postDeadline').value = p.deadline || '';
    document.getElementById('postSignupOptions').style.display = p.signupEnabled ? '' : 'none';
    document.getElementById('postSubmitBtn').textContent = '수정하기';
    if (titleEl) titleEl.textContent = '나눔글 수정';
  } else {
    state.editingPostId = null;
    document.getElementById('postTitleInput').value = '';
    document.getElementById('postBodyInput').value = '';
    document.getElementById('postSignupEnabled').checked = false;
    document.getElementById('postDeadline').value = '';
    document.getElementById('postSignupOptions').style.display = 'none';
    document.getElementById('postSubmitBtn').textContent = '등록하기';
    if (titleEl) titleEl.textContent = '새 나눔글';
  }
  document.getElementById('postImageInput').value = '';
  document.getElementById('postImagePreview').style.display = 'none';
  document.getElementById('postComposeProgress').textContent = '';
  state.pendingPostImage = null;
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

document.getElementById('postImageInput')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) { state.pendingPostImage = null; document.getElementById('postImagePreview').style.display = 'none'; return; }
  if (!file.type.startsWith('image/')) { toast('이미지 파일만 가능합니다'); e.target.value = ''; return; }
  if (file.size > 8 * 1024 * 1024) { toast('파일 크기가 8MB를 초과합니다'); e.target.value = ''; return; }
  state.pendingPostImage = file;
  const url = URL.createObjectURL(file);
  document.getElementById('postImagePreviewImg').src = url;
  document.getElementById('postImagePreview').style.display = '';
});
document.getElementById('postImageRemove')?.addEventListener('click', () => {
  state.pendingPostImage = null;
  document.getElementById('postImageInput').value = '';
  document.getElementById('postImagePreview').style.display = 'none';
});

document.getElementById('postSubmitBtn')?.addEventListener('click', async () => {
  const title = document.getElementById('postTitleInput').value.trim();
  const body = document.getElementById('postBodyInput').value.trim();
  if (!title) { toast('제목을 입력해주세요'); return; }
  if (!body) { toast('내용을 입력해주세요'); return; }
  const btn = document.getElementById('postSubmitBtn');
  const progress = document.getElementById('postComposeProgress');
  btn.disabled = true;
  try {
    let imageUrl = '';
    let storagePath = '';
    if (state.pendingPostImage) {
      progress.textContent = '사진 업로드 중...';
      const ext = state.pendingPostImage.name.split('.').pop() || 'jpg';
      storagePath = `posts/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      const task = uploadBytesResumable(sRef(storage, storagePath), state.pendingPostImage, { contentType: state.pendingPostImage.type });
      imageUrl = await new Promise((resolve, reject) => {
        task.on('state_changed',
          (s) => { progress.textContent = `사진 업로드 ${Math.round((s.bytesTransferred/s.totalBytes)*100)}%`; },
          reject,
          async () => { try { resolve(await getDownloadURL(task.snapshot.ref)); } catch (e) { reject(e); } }
        );
      });
    }
    progress.textContent = '저장 중...';
    const signupEnabled = document.getElementById('postSignupEnabled').checked;
    const deadlineVal = document.getElementById('postDeadline').value;

    if (state.editingPostId) {
      // 수정: title/body/image/signup만 갱신, count·timestamp·authorUid 보존
      const upd = {
        title, body,
        signupEnabled: !!signupEnabled,
        deadline: signupEnabled && deadlineVal ? deadlineVal : null,
        updatedAt: Date.now()
      };
      if (imageUrl) {
        upd.imageUrl = imageUrl;
        upd.imageStoragePath = storagePath;
        // 옛 사진 삭제
        const old = state.posts.find((x) => x.id === state.editingPostId);
        if (old?.imageStoragePath) {
          deleteObject(sRef(storage, old.imageStoragePath)).catch(() => {});
        }
      }
      await update(ref(db, `posts/${state.editingPostId}`), upd);
      toast('나눔글이 수정되었습니다');
    } else {
      const newData = {
        title, body,
        imageUrl: imageUrl || '',
        imageStoragePath: storagePath || '',
        authorUid: state.uid,
        authorName: state.userProfile?.displayName || '성도',
        authorRole: state.userProfile?.role || '성도',
        likeCount: 0,
        commentCount: 0,
        timestamp: Date.now()
      };
      if (signupEnabled) {
        newData.signupEnabled = true;
        if (deadlineVal) newData.deadline = deadlineVal;
      }
      await push(ref(db, 'posts'), newData);
      toast('나눔글이 등록되었습니다');
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
  const img = document.getElementById('postDetailImg');
  const u = safeImageUrl(p.imageUrl);
  if (u) { img.src = u; img.style.display = ''; } else { img.style.display = 'none'; img.src = ''; }
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
    document.getElementById('postDetailSignupMeta').textContent = p.deadline
      ? `📅 마감: ${p.deadline}` : '참여 신청을 받습니다';
    const closed = p.deadline && new Date(p.deadline + 'T23:59:59') < new Date();
    if (closed) {
      signupBtn.disabled = true;
      signupBtn.textContent = '마감되었습니다';
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
  if (!confirm('이 나눔글을 삭제하시겠어요?\n\n댓글과 좋아요 기록도 함께 삭제됩니다.')) return;
  try {
    if (post.imageStoragePath) {
      await deleteObject(sRef(storage, post.imageStoragePath)).catch(() => {});
    }
    await remove(ref(db, `posts/${id}`));
    await remove(ref(db, `postLikes/${id}`)).catch(() => {});
    await remove(ref(db, `postComments/${id}`)).catch(() => {});
    closeModal('postDetailModal');
    state.currentPostId = null;
    toast('나눔글이 삭제되었습니다');
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
document.getElementById('vSubmit')?.addEventListener('click', async () => {
  const name = document.getElementById('vName').value.trim();
  if (!name) { toast('이름을 입력해주세요'); return; }
  try {
    const newRef = await push(ref(db, 'applications'), {
      kind: '봉사', name,
      phone: document.getElementById('vPhone').value.trim(),
      type: document.getElementById('vKind').value,
      time: document.getElementById('vTime').value.trim(),
      userUid: state.uid, timestamp: Date.now()
    });
    recordMyApplication(newRef.key);
    ['vName','vPhone','vTime'].forEach((i) => { const e = document.getElementById(i); if (e) e.value = ''; });
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
    '• 내가 신청한 모든 신청 (재능나눔·심방·새가족·봉사)',
    '• 내가 올린 갤러리 사진 (파일 포함)',
    '• 내가 참여(아멘)한 기도 기록',
    '• 알림 토큰',
    '• 익명 계정 자체',
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

  // 3) 내가 올린 갤러리 사진 (RTDB 레코드 + Storage 파일)
  (state.gallery || []).filter((g) => g.uploaderUid === uid).forEach((g) => {
    ops.push(remove(ref(db, `gallery/${g.id}`)).catch(() => {}));
    if (g.storagePath) {
      ops.push(deleteObject(sRef(storage, g.storagePath)).catch(() => {}));
    }
  });

  // 4) 내가 참여(아멘)한 기록
  Object.keys(state.prayedBy || {}).forEach((prayerId) => {
    ops.push(remove(ref(db, `prayedBy/${prayerId}/${uid}`)).catch(() => {}));
  });

  // 5) FCM 토큰
  ops.push(remove(ref(db, `fcmTokens/${uid}`)).catch(() => {}));

  // 6) /users/{uid} 프로필 삭제
  ops.push(remove(ref(db, `users/${uid}`)).catch(() => {}));

  // 모든 RTDB 삭제를 한 번에 await
  await Promise.all(ops);

  // 7) 로컬 저장소 정리
  ['myAppIds', 'attendName', 'uploaderName', 'easyMode', 'notifEnabled', 'installDismissed']
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
function openSearch() {
  const renderResults = (q) => {
    const body = document.getElementById('listBody');
    if (!body) return;
    if (!q) { body.innerHTML = '<div class="list-empty">교회 소식·말씀·재능나눔방을 검색해보세요</div>'; return; }
    const lq = q.toLowerCase();
    const matchAnn = (state.announcements || []).filter((a) =>
      (a.title || '').toLowerCase().includes(lq) || (a.body || '').toLowerCase().includes(lq)
    ).map((a) => listRowHtml({ tag: '공지', tagClass: a.tag || 'notice', title: a.title, body: a.body, time: timeAgo(a.timestamp) }));
    const matchRoom = (state.rooms || []).filter((r) => r.approved !== false &&
      ((r.title || '').toLowerCase().includes(lq) || (r.desc || '').toLowerCase().includes(lq) || (r.category || '').toLowerCase().includes(lq))
    ).map((r) => listRowHtml({ tag: '재능나눔방', title: r.title, body: r.desc, time: r.schedule }));
    const matchPrayer = (state.prayers || []).filter((p) => p.type !== '교역자에게만 전달' &&
      (p.text || '').toLowerCase().includes(lq)
    ).map((p) => listRowHtml({ tag: '기도', title: p.text, body: p.name || '익명', time: timeAgo(p.timestamp) }));
    const matchBul = (state.bulletins || []).filter((b) => (b.title || '').toLowerCase().includes(lq))
      .map((b) => listRowHtml({ tag: '주보', tagClass: 'event', title: b.title, body: b.date, time: timeAgo(b.timestamp) }));
    const all = [...matchAnn, ...matchRoom, ...matchPrayer, ...matchBul];
    body.innerHTML = all.length ? all.join('') : `<div class="list-empty">"${escapeHtml(q)}"에 대한 결과가 없어요</div>`;
  };
  openListModal('검색', '<div class="list-empty">교회 소식·말씀·재능나눔방을 검색해보세요</div>', {
    searchPlaceholder: '예: 야외예배, 기타, 봉사',
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

// ===== 갤러리 업로드 =====
const gFileInput = document.getElementById('gFile');
const gPreviewEl = document.getElementById('gPreview');
const gNameEl = document.getElementById('gName');
const gCaptionEl = document.getElementById('gCaption');
const gProgressEl = document.getElementById('gProgress');
const gSubmitBtn = document.getElementById('gSubmit');

const MAX_GALLERY_FILES = 7;
let preparedPhotos = [];  // 리사이즈된 File 배열

if (gNameEl) {
  const saved = localStorage.getItem('uploaderName');
  if (saved) gNameEl.value = saved;
}

gFileInput?.addEventListener('change', async (e) => {
  preparedPhotos = [];
  gPreviewEl.style.display = 'none';
  gPreviewEl.innerHTML = '';
  gProgressEl.textContent = '';
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (images.length !== files.length) toast('이미지 파일만 올릴 수 있어요 (비이미지 제외됨)');
  const selected = images.slice(0, MAX_GALLERY_FILES);
  if (images.length > MAX_GALLERY_FILES) toast(`최대 ${MAX_GALLERY_FILES}장까지 가능해요. 앞 ${MAX_GALLERY_FILES}장만 선택됩니다`);
  gProgressEl.textContent = `📐 ${selected.length}장 변환 중...`;
  for (const f of selected) {
    try {
      const resized = await resizeImage(f, { maxDim: 2400, quality: 0.88 });
      preparedPhotos.push(resized);
      const item = document.createElement('div');
      item.className = 'g-preview-item';
      item.innerHTML = `<img src="${URL.createObjectURL(resized)}" alt="미리보기"/><div class="g-item-size">${humanSize(resized.size)}</div>`;
      gPreviewEl.appendChild(item);
    } catch {
      preparedPhotos.push(f);
      const item = document.createElement('div');
      item.className = 'g-preview-item';
      item.innerHTML = `<img src="${URL.createObjectURL(f)}" alt="미리보기"/><div class="g-item-size">${humanSize(f.size)}</div>`;
      gPreviewEl.appendChild(item);
    }
  }
  gPreviewEl.style.display = preparedPhotos.length ? '' : 'none';
  gProgressEl.textContent = preparedPhotos.length ? `${preparedPhotos.length}장 준비 완료` : '';
});

gSubmitBtn?.addEventListener('click', async () => {
  if (!state.uid) { toast('잠시 후 다시 시도해주세요'); return; }
  if (!preparedPhotos.length) { toast('사진을 먼저 선택해주세요'); return; }
  const name = gNameEl.value.trim() || '익명';
  const caption = gCaptionEl.value.trim();
  localStorage.setItem('uploaderName', name === '익명' ? '' : name);

  gSubmitBtn.disabled = true;
  const total = preparedPhotos.length;
  let done = 0;

  const uploadOne = (photo, idx) => new Promise((resolve, reject) => {
    const path = `gallery/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const task = uploadBytesResumable(sRef(storage, path), photo, { contentType: photo.type });
    task.on('state_changed',
      (snap) => {
        const pct = (snap.bytesTransferred / snap.totalBytes * 100).toFixed(0);
        gProgressEl.textContent = `업로드 중 ${done + 1}/${total}... ${pct}%`;
      },
      reject,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          await push(ref(db, 'gallery'), {
            url, storagePath: path,
            caption: total === 1 ? caption : (caption ? `${caption} (${idx + 1}/${total})` : ''),
            uploaderName: name,
            uploaderUid: state.uid,
            contentType: photo.type,
            size: photo.size,
            timestamp: Date.now() + idx
          });
          done++;
          resolve();
        } catch (e) { reject(e); }
      }
    );
  });

  try {
    for (let i = 0; i < preparedPhotos.length; i++) {
      await uploadOne(preparedPhotos[i], i);
    }
    gProgressEl.textContent = `✅ ${total}장 업로드 완료!`;
    gFileInput.value = '';
    if (gCaptionEl) gCaptionEl.value = '';
    gPreviewEl.style.display = 'none'; gPreviewEl.innerHTML = '';
    preparedPhotos = [];
    setTimeout(() => { gProgressEl.textContent = ''; closeModal('galleryModal'); }, 800);
  } catch (e) {
    gProgressEl.textContent = `❌ 업로드 실패 (${done}/${total} 완료): ` + e.message;
  } finally {
    gSubmitBtn.disabled = false;
  }
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
    body: [e.time ? `🕐 ${e.time}` : '', e.location ? `📍 ${escapeHtml(e.location)}` : '', e.desc || ''].filter(Boolean).join('  ')
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
