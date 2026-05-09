/* =============================================================
 * 천안남산교회 — 관리자 페이지
 * ============================================================= */

import { db, auth, storage } from '/firebase-init.js';
import { resizeImage, humanSize } from '/img-utils.js';
import {
  ref, onValue, push, set, update, remove, get, query, orderByChild, limitToLast
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  ref as sRef, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js";

// ----- DOM -----
const $ = (id) => document.getElementById(id);

const loginPane = $('loginPane');
const adminPane = $('adminPane');
const loginErr = $('loginErr');

// ----- 상태 -----
const state = {
  user: null,
  isAdmin: false,
  rooms: [],
  prayers: [],
  announcements: [],
  apps: [],
  admins: {},
  sermon: null,
  bulletins: [],
  church: {},
  services: [],
  hero: null,
  gallery: [],
  events: []
};

// ===== 로그인 =====
$('loginBtn').addEventListener('click', login);
$('loginPw').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

async function login() {
  const email = $('loginEmail').value.trim();
  const pw = $('loginPw').value;
  loginErr.textContent = '';
  if (!email || !pw) { loginErr.textContent = '이메일과 비밀번호를 입력해주세요.'; return; }
  try {
    await signInWithEmailAndPassword(auth, email, pw);
  } catch (e) {
    loginErr.textContent = errorMessage(e.code);
  }
}

function errorMessage(code) {
  return ({
    'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
    'auth/user-not-found': '등록되지 않은 계정입니다.',
    'auth/wrong-password': '비밀번호가 일치하지 않습니다.',
    'auth/too-many-requests': '시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.'
  })[code] || '로그인에 실패했습니다.';
}

$('logoutBtn').addEventListener('click', () => {
  listenersAttached = false;
  signOut(auth);
});

// ===== 인증 상태 =====
onAuthStateChanged(auth, async (user) => {
  state.user = user;
  if (!user) {
    loginPane.style.display = 'grid';
    adminPane.classList.remove('show');
    return;
  }

  try {
    // 관리자 권한 확인
    const adminRef = ref(db, `admins/${user.uid}`);
    const snap = await get(adminRef);

    if (!snap.exists()) {
      // /admins 가 비어있으면 첫 로그인 유저를 자동 등록 (부트스트랩)
      const allAdmins = await get(ref(db, 'admins'));
      if (!allAdmins.exists()) {
        await set(adminRef, {
          email: user.email,
          name: user.email.split('@')[0],
          role: 'super',
          createdAt: Date.now()
        });
      } else {
        loginErr.textContent = '관리자 권한이 없는 계정입니다.';
        await signOut(auth);
        return;
      }
    }

    state.isAdmin = true;
    loginPane.style.display = 'none';
    adminPane.classList.add('show');
    $('whoAmI').textContent = user.email || user.uid;

    attachListeners();
  } catch (e) {
    console.error('Admin auth error:', e);
    loginErr.textContent = `오류: ${e.code || e.message} — Firebase 콘솔에서 데이터베이스 규칙을 확인해주세요.`;
    await signOut(auth);
  }
});

// ===== 사이드바 네비게이션 =====
document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.pane').forEach((p) => p.classList.remove('active'));
    $('pane-' + item.dataset.pane).classList.add('active');
  });
});

// ===== 실시간 데이터 리스너 =====
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
    console.error(`[admin] ${path} 읽기 실패:`, err.code || err.message);
  });
}

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  onValueWithError('rooms', (snap) => {
    state.rooms = [];
    snap.forEach((c) => { state.rooms.push({ id: c.key, ...c.val() }); });
    state.rooms.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    console.log(`[admin] rooms onValue: snap.numChildren=${snap.numChildren()} state.rooms.length=${state.rooms.length}`);
    renderApprove(); renderRooms(); renderStats();
  });
  onValueWithError('prayers', (snap) => {
    state.prayers = [];
    snap.forEach((c) => { state.prayers.push({ id: c.key, ...c.val() }); });
    state.prayers.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    console.log(`[admin] prayers onValue: snap.numChildren=${snap.numChildren()} state.prayers.length=${state.prayers.length}`);
    renderPrayers(); renderStats(); renderRecent();
  });
  onValueWithError('announcements', (snap) => {
    state.announcements = [];
    snap.forEach((c) => { state.announcements.push({ id: c.key, ...c.val() }); });
    state.announcements.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    console.log(`[admin] announcements onValue: snap.numChildren=${snap.numChildren()} state.announcements.length=${state.announcements.length}`);
    renderAnnouncements(); renderStats();
  });
  onValueWithError('applications', (snap) => {
    state.apps = [];
    snap.forEach((c) => { state.apps.push({ id: c.key, ...c.val() }); });
    state.apps.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    console.log(`[admin] applications onValue: snap.numChildren=${snap.numChildren()} state.apps.length=${state.apps.length}`);
    renderApps(); renderStats(); renderRecent();
  });
  onValueWithError('admins', (snap) => {
    state.admins = snap.val() || {};
    renderAdmins();
  });
  onValueWithError('sermons/current', (snap) => {
    state.sermon = snap.val() || null;
    fillSermonForm();
  });
  onValueWithError('bulletins', (snap) => {
    state.bulletins = [];
    snap.forEach((c) => { state.bulletins.push({ id: c.key, ...c.val() }); });
    state.bulletins.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderBulletins();
  });
  onValueWithError('config/church', (snap) => {
    state.church = snap.val() || {};
    fillChurchForm();
  });
  onValueWithError('config/services', (snap) => {
    state.services = [];
    snap.forEach((c) => { state.services.push({ id: c.key, ...c.val() }); });
    state.services.sort((a, b) => (a.day - b.day) || (a.time || '').localeCompare(b.time || ''));
    console.log('[svc] onValue →', state.services.length, '개:', state.services.map((s) => s.name).join(', '));
    renderServices();
  });
  onValueWithError('config/hero', (snap) => {
    state.hero = snap.val() || null;
    renderHeroPreview();
  });

  onValueWithError('events', (snap) => {
    state.events = [];
    snap.forEach((c) => { state.events.push({ id: c.key, ...c.val() }); });
    state.events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    renderEvents();
  });

  onValueWithError('gallery', (snap) => {
    state.gallery = [];
    snap.forEach((c) => { state.gallery.push({ id: c.key, ...c.val() }); });
    state.gallery.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderGallery();
  });
}

// ===== 유틸 =====
function escapeHtml(v) {
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function fmt(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function tagPill(t) {
  const map = { urgent: '중요', event: '신청', notice: '소식', praise: '감사' };
  return `<span class="pill ${t || 'notice'}">${map[t] || '소식'}</span>`;
}

// ===== 대시보드 =====
function renderStats() {
  const pendingRooms = state.rooms.filter((r) => r.approved === false).length;
  $('stats').innerHTML = `
    <div class="stat"><div class="lbl">전체 공지</div><div class="val">${state.announcements.length}</div></div>
    <div class="stat"><div class="lbl">기도제목</div><div class="val">${state.prayers.length}</div></div>
    <div class="stat"><div class="lbl">재능나눔방</div><div class="val">${state.rooms.length}</div></div>
    <div class="stat"><div class="lbl">신청 누계</div><div class="val">${state.apps.length}</div></div>
  `;
  const badge = $('badgeApprove');
  if (pendingRooms > 0) {
    badge.style.display = 'inline-block';
    badge.textContent = pendingRooms;
  } else {
    badge.style.display = 'none';
  }
}

function renderRecent() {
  const items = [
    ...state.apps.slice(0, 5).map((a) => ({ ts: a.timestamp, label: '신청', detail: `${a.kind || '재능나눔방'} · ${a.name || ''}` })),
    ...state.prayers.slice(0, 5).map((p) => ({ ts: p.timestamp, label: '기도', detail: `${p.name || '익명'} · ${(p.text || '').slice(0, 24)}…` }))
  ].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 8);

  $('recentActivity').innerHTML = items.length === 0 ? '<div class="empty">아직 활동이 없어요</div>' :
    `<table><thead><tr><th>일시</th><th>구분</th><th>내용</th></tr></thead><tbody>${
      items.map((i) => `<tr><td>${fmt(i.ts)}</td><td>${i.label}</td><td>${escapeHtml(i.detail)}</td></tr>`).join('')
    }</tbody></table>`;
}

// ===== 공지사항 =====
$('annSubmit').addEventListener('click', async () => {
  const title = $('annTitle').value.trim();
  const body = $('annBody').value.trim();
  const tag = $('annTag').value;
  if (!title) { alert('제목을 입력해주세요'); return; }
  await push(ref(db, 'announcements'), { title, body, tag, timestamp: Date.now() });
  $('annTitle').value = ''; $('annBody').value = '';
  alert('공지가 등록되었습니다');
});

function renderAnnouncements() {
  const list = $('annList');
  if (!list) return;
  if (state.announcements.length === 0) { list.innerHTML = '<div class="empty">등록된 공지가 없습니다</div>'; return; }
  list.innerHTML = `<table><thead><tr><th>분류</th><th>제목</th><th>일시</th><th></th></tr></thead><tbody>${
    state.announcements.map((a) => `
      <tr>
        <td>${tagPill(a.tag)}</td>
        <td><b>${escapeHtml(a.title)}</b><br/><span style="color: var(--muted); font-size: 12px;">${escapeHtml((a.body || '').slice(0, 60))}${(a.body || '').length > 60 ? '…' : ''}</span></td>
        <td>${fmt(a.timestamp)}</td>
        <td>
          <button class="btn btn-sm" data-edit-ann="${a.id}">수정</button>
          <button class="btn btn-sm danger" data-del-ann="${a.id}">삭제</button>
        </td>
      </tr>
    `).join('')
  }</tbody></table>`;
  list.querySelectorAll('[data-edit-ann]').forEach((b) => {
    b.addEventListener('click', () => editAnnouncement(b.dataset.editAnn));
  });
  list.querySelectorAll('[data-del-ann]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('공지를 삭제하시겠어요?')) return;
      await remove(ref(db, `announcements/${b.dataset.delAnn}`));
    });
  });
}

function editAnnouncement(id) {
  const a = state.announcements.find((x) => x.id === id);
  if (!a) return;
  openEditModal({
    title: '공지 수정',
    fields: [
      { id: 'tag', label: '분류', type: 'select', value: a.tag,
        options: [['urgent','중요'],['event','행사·신청'],['notice','일반 소식'],['praise','감사']] },
      { id: 'title', label: '제목', type: 'text', value: a.title },
      { id: 'body', label: '본문', type: 'textarea', value: a.body }
    ],
    onSave: async (vals) => {
      await update(ref(db, `announcements/${id}`), {
        tag: vals.tag, title: vals.title, body: vals.body
      });
    }
  });
}

// ===== 설교 =====
function fillSermonForm() {
  if (!state.sermon) return;
  const s = state.sermon;
  $('sermonTitle').value = s.title || '';
  $('sermonVerse').value = s.verse || '';
  $('sermonMeta').value = s.meta || '';
  $('sermonBody').value = s.body || '';
  $('sermonPractice').value = s.practice || '';
  $('sermonQ').value = s.question || '';
  $('sermonUrl').value = s.videoId || '';
  if (s.start) splitTime(s.start, 'start');
  if (s.end) splitTime(s.end, 'end');
  updatePreview();
}

function splitTime(sec, prefix) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  $(prefix + 'H').value = h || '';
  $(prefix + 'M').value = m || '';
  $(prefix + 'S').value = s || '';
}

function combineTime(prefix) {
  const h = Number($(prefix + 'H').value || 0);
  const m = Number($(prefix + 'M').value || 0);
  const s = Number($(prefix + 'S').value || 0);
  return h * 3600 + m * 60 + s;
}

function extractVideoId(input) {
  if (!input) return '';
  const v = input.trim();
  // youtu.be/ID, youtube.com/watch?v=ID, youtube.com/embed/ID, just ID
  let m;
  if ((m = v.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/))) return m[1];
  if ((m = v.match(/[?&]v=([a-zA-Z0-9_-]{6,})/))) return m[1];
  if ((m = v.match(/embed\/([a-zA-Z0-9_-]{6,})/))) return m[1];
  if (/^[a-zA-Z0-9_-]{6,}$/.test(v)) return v;
  return v;
}

function updatePreview() {
  const id = extractVideoId($('sermonUrl').value);
  const start = combineTime('start');
  const end = combineTime('end');
  if (!id) { $('sermonPreview').textContent = '유튜브 URL 또는 영상 ID 입력 필요'; return; }
  const params = new URLSearchParams({ rel: '0', modestbranding: '1' });
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  $('sermonPreview').innerHTML = `<div style="color: var(--text); font-weight: 700;">ID: ${escapeHtml(id)}</div>` +
    `시작 ${start || 0}s · 종료 ${end || '끝까지'}s`;
}

['sermonUrl', 'startH', 'startM', 'startS', 'endH', 'endM', 'endS'].forEach((id) => {
  $(id)?.addEventListener('input', updatePreview);
});

$('sermonSave').addEventListener('click', async () => {
  const data = {
    title: $('sermonTitle').value.trim(),
    verse: $('sermonVerse').value.trim(),
    meta: $('sermonMeta').value.trim(),
    body: $('sermonBody').value.trim(),
    practice: $('sermonPractice').value.trim(),
    question: $('sermonQ').value.trim(),
    videoId: extractVideoId($('sermonUrl').value),
    start: combineTime('start') || 0,
    end: combineTime('end') || 0,
    timestamp: Date.now()
  };
  if (!data.title) { alert('설교 제목을 입력해주세요'); return; }
  // 이전 설교는 history에 보관
  if (state.sermon && state.sermon.title && state.sermon.title !== data.title) {
    await push(ref(db, 'sermons/history'), state.sermon);
  }
  await set(ref(db, 'sermons/current'), data);
  alert('이번 주 설교가 저장되었습니다');
});

// ===== 승인 대기 =====
function renderApprove() {
  const list = $('approveList');
  if (!list) return;
  const pending = state.rooms.filter((r) => r.approved === false);
  if (pending.length === 0) { list.innerHTML = '<div class="empty">대기 중인 항목이 없어요</div>'; return; }
  list.innerHTML = `<table><thead><tr><th>제목</th><th>분류</th><th>대상</th><th>일시</th><th></th></tr></thead><tbody>${
    pending.map((r) => `
      <tr>
        <td><b>${escapeHtml(r.title)}</b><br/><span style="color: var(--muted); font-size: 12px;">${escapeHtml(r.desc || '')}</span></td>
        <td>${escapeHtml(r.category)}</td>
        <td>${escapeHtml(r.target)}</td>
        <td>${fmt(r.timestamp)}</td>
        <td>
          <button class="btn btn-sm primary" data-ok="${r.id}">승인</button>
          <button class="btn btn-sm danger" data-no="${r.id}">거절</button>
        </td>
      </tr>
    `).join('')
  }</tbody></table>`;
  list.querySelectorAll('[data-ok]').forEach((b) => b.addEventListener('click', () => approveRoom(b.dataset.ok)));
  list.querySelectorAll('[data-no]').forEach((b) => b.addEventListener('click', () => rejectRoom(b.dataset.no)));
}

async function approveRoom(id) {
  await update(ref(db, `rooms/${id}`), { approved: true, status: '모집중' });
  alert('승인되었습니다');
}
async function rejectRoom(id) {
  if (!confirm('거절(삭제)하시겠어요?')) return;
  await remove(ref(db, `rooms/${id}`));
}

// ===== 신청 내역 =====
function renderApps() {
  const tbody = document.querySelector('#appsTable tbody');
  if (!tbody) return;
  if (state.apps.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty">신청 내역이 없어요</td></tr>'; return; }
  tbody.innerHTML = state.apps.map((a) => {
    let detail = '';
    if (a.kind === '심방요청') {
      detail = [a.date ? `희망일: ${a.date}` : '', a.message || ''].filter(Boolean).join(' / ');
    } else if (a.kind === '새가족') {
      detail = [a.address || '', a.how ? `경로: ${a.how}` : ''].filter(Boolean).join(' / ');
    } else {
      detail = a.type || a.roomTitle || a.time || '';
    }
    return `
    <tr>
      <td>${fmt(a.timestamp)}</td>
      <td>${escapeHtml(a.kind || a.roomTitle || '재능나눔')}</td>
      <td>${escapeHtml(a.name || '')}</td>
      <td>${escapeHtml(a.phone || '')}</td>
      <td>${escapeHtml(detail)}</td>
      <td><button class="btn btn-sm danger" data-del-app="${a.id}">삭제</button></td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('[data-del-app]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('신청 내역을 삭제하시겠어요?')) return;
      await remove(ref(db, `applications/${b.dataset.delApp}`));
    });
  });
}

// ===== 기도제목 관리 =====
function renderPrayers() {
  const list = $('prayerList');
  if (!list) return;
  if (state.prayers.length === 0) { list.innerHTML = '<div class="empty">기도제목이 없어요</div>'; return; }
  list.innerHTML = `<table><thead><tr><th>구분</th><th>이름</th><th>내용</th><th>참여</th><th>일시</th><th></th></tr></thead><tbody>${
    state.prayers.map((p) => {
      const isPrivate = p.type === '교역자에게만 전달';
      return `
        <tr>
          <td><span class="pill ${isPrivate ? 'urgent' : ''}">${escapeHtml(p.type || '공개')}</span></td>
          <td>${escapeHtml(p.name || '')}</td>
          <td>${escapeHtml(p.text || '')}</td>
          <td>${p.count || 0}</td>
          <td>${fmt(p.timestamp)}</td>
          <td>
            <button class="btn btn-sm" data-edit-p="${p.id}">수정</button>
            <button class="btn btn-sm danger" data-del-p="${p.id}">삭제</button>
          </td>
        </tr>
      `;
    }).join('')
  }</tbody></table>`;
  list.querySelectorAll('[data-edit-p]').forEach((b) => {
    b.addEventListener('click', () => editPrayer(b.dataset.editP));
  });
  list.querySelectorAll('[data-del-p]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('기도제목을 삭제하시겠어요?')) return;
      await remove(ref(db, `prayers/${b.dataset.delP}`));
      // 함께 prayedBy 정리
      await remove(ref(db, `prayedBy/${b.dataset.delP}`)).catch(() => {});
    });
  });
}

function editPrayer(id) {
  const p = state.prayers.find((x) => x.id === id);
  if (!p) return;
  openEditModal({
    title: '기도제목 수정',
    fields: [
      { id: 'type', label: '구분', type: 'select', value: p.type,
        options: [['공개','공개'],['익명 공개','익명 공개'],['교역자에게만 전달','교역자에게만 전달'],['감사','감사']] },
      { id: 'name', label: '이름', type: 'text', value: p.name },
      { id: 'text', label: '내용', type: 'textarea', value: p.text }
    ],
    onSave: async (vals) => {
      await update(ref(db, `prayers/${id}`), {
        type: vals.type, name: vals.name, text: vals.text
      });
    }
  });
}

// ===== 재능나눔방 전체 =====
function renderRooms() {
  const list = $('roomsList');
  if (!list) return;
  if (state.rooms.length === 0) { list.innerHTML = '<div class="empty">재능나눔방이 없어요</div>'; return; }
  list.innerHTML = `<table><thead><tr><th>제목</th><th>분류</th><th>대상</th><th>현황</th><th>상태</th><th></th></tr></thead><tbody>${
    state.rooms.map((r) => `
      <tr>
        <td><b>${escapeHtml(r.title)}</b><br/><span style="color: var(--muted); font-size: 12px;">${escapeHtml(r.teacher || '')} · ${escapeHtml(r.schedule || '')}</span></td>
        <td>${escapeHtml(r.category)}</td>
        <td>${escapeHtml(r.target)}</td>
        <td>${r.joined || 0} / ${r.capacity}</td>
        <td>${r.approved === false ? '<span class="pill pending">대기</span>' : (r.status === '마감' || r.joined >= r.capacity) ? '<span class="pill">마감</span>' : '<span class="pill">모집중</span>'}</td>
        <td>
          <button class="btn btn-sm" data-edit-r="${r.id}">수정</button>
          <button class="btn btn-sm danger" data-del-r="${r.id}">삭제</button>
        </td>
      </tr>
    `).join('')
  }</tbody></table>`;
  list.querySelectorAll('[data-edit-r]').forEach((b) => {
    b.addEventListener('click', () => editRoom(b.dataset.editR));
  });
  list.querySelectorAll('[data-del-r]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('재능나눔방을 삭제하시겠어요?')) return;
      await remove(ref(db, `rooms/${b.dataset.delR}`));
    });
  });
}

function editRoom(id) {
  const r = state.rooms.find((x) => x.id === id);
  if (!r) return;
  openEditModal({
    title: '재능나눔방 수정',
    fields: [
      { id: 'title', label: '제목', type: 'text', value: r.title },
      { id: 'category', label: '분류', type: 'text', value: r.category },
      { id: 'target', label: '대상', type: 'text', value: r.target },
      { id: 'teacher', label: '인도자', type: 'text', value: r.teacher },
      { id: 'schedule', label: '일정', type: 'text', value: r.schedule },
      { id: 'place', label: '장소', type: 'text', value: r.place },
      { id: 'capacity', label: '정원', type: 'number', value: r.capacity },
      { id: 'joined', label: '현재 인원', type: 'number', value: r.joined || 0 },
      { id: 'desc', label: '소개', type: 'textarea', value: r.desc },
      { id: 'status', label: '상태', type: 'select', value: r.status,
        options: [['모집중','모집중'],['마감','마감']] },
      { id: 'approved', label: '승인 여부', type: 'select', value: r.approved !== false ? 'true' : 'false',
        options: [['true','승인됨'],['false','대기']] }
    ],
    onSave: async (vals) => {
      await update(ref(db, `rooms/${id}`), {
        title: vals.title, category: vals.category, target: vals.target,
        teacher: vals.teacher, schedule: vals.schedule, place: vals.place,
        capacity: Number(vals.capacity) || 0, joined: Number(vals.joined) || 0,
        desc: vals.desc, status: vals.status,
        approved: vals.approved === 'true'
      });
    }
  });
}

// ===== 관리자 =====
$('addAdminBtn').addEventListener('click', async () => {
  const uid = $('newAdminUid').value.trim();
  const name = $('newAdminName').value.trim();
  const role = $('newAdminRole').value;
  if (!uid || !name) { alert('UID와 이름을 입력해주세요'); return; }
  await set(ref(db, `admins/${uid}`), { name, role, addedBy: state.user.uid, addedAt: Date.now() });
  $('newAdminUid').value = ''; $('newAdminName').value = '';
  alert('관리자가 추가되었습니다');
});

function renderAdmins() {
  const list = $('adminList');
  if (!list) return;
  const arr = Object.entries(state.admins).map(([uid, info]) => ({ uid, ...info }));
  if (arr.length === 0) { list.innerHTML = '<div class="empty">관리자가 없습니다</div>'; return; }
  const roleLabel = { super: '최고관리자', content: '콘텐츠', media: '미디어' };
  list.innerHTML = `<table><thead><tr><th>이름</th><th>역할</th><th>등록일</th><th></th></tr></thead><tbody>${
    arr.map((a) => `
      <tr>
        <td>${escapeHtml(a.name || '')}</td>
        <td>
          ${escapeHtml(roleLabel[a.role] || a.role || '')}
          <button class="btn btn-sm" data-uid-toggle="${escapeHtml(a.uid)}" style="margin-left:6px;font-size:10px;">UID</button>
          <div id="uid-${escapeHtml(a.uid)}" style="display:none;font-family:monospace;font-size:11px;color:var(--muted);margin-top:4px;word-break:break-all;">${escapeHtml(a.uid)}</div>
        </td>
        <td>${fmt(a.createdAt || a.addedAt)}</td>
        <td>${a.uid === state.user.uid ? '<span class="pill">나</span>' : `<button class="btn btn-sm danger" data-del-a="${a.uid}">제거</button>`}</td>
      </tr>
    `).join('')
  }</tbody></table>`;
  list.querySelectorAll('[data-uid-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = document.getElementById('uid-' + btn.dataset.uidToggle);
      if (!el) return;
      const shown = el.style.display !== 'none';
      el.style.display = shown ? 'none' : 'block';
      btn.textContent = shown ? 'UID' : 'UID 숨기기';
    });
  });
  list.querySelectorAll('[data-del-a]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('관리자 권한을 제거하시겠어요?')) return;
      await remove(ref(db, `admins/${b.dataset.delA}`));
    });
  });
}

// ===== 주보 업로드 =====
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const bulDateInput = $('bulDate');
if (bulDateInput && !bulDateInput.value) bulDateInput.value = todayStr();

$('bulUpload').addEventListener('click', async () => {
  const title = $('bulTitle').value.trim();
  const date = $('bulDate').value || todayStr();
  const file = $('bulFile').files[0];
  if (!title) { alert('제목을 입력해주세요'); return; }
  if (!file) { alert('파일을 선택해주세요'); return; }
  if (file.size > 20 * 1024 * 1024) { alert('파일 크기는 20MB 이하만 가능합니다'); return; }

  const ext = file.name.split('.').pop().toLowerCase();
  const safeName = `${date.replaceAll('-', '')}-${Date.now()}.${ext}`;
  const path = `bulletins/${safeName}`;
  const storageRef = sRef(storage, path);
  const task = uploadBytesResumable(storageRef, file, { contentType: file.type });

  const progress = $('bulProgress');
  $('bulUpload').disabled = true;

  task.on('state_changed',
    (snap) => {
      const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
      progress.textContent = `업로드 중 ${pct}%`;
    },
    (err) => {
      progress.textContent = '';
      $('bulUpload').disabled = false;
      alert('업로드 실패: ' + err.message);
    },
    async () => {
      const url = await getDownloadURL(task.snapshot.ref);
      await push(ref(db, 'bulletins'), {
        title, date, url, storagePath: path,
        contentType: file.type,
        size: file.size,
        uploadedBy: state.user.uid,
        timestamp: Date.now()
      });
      progress.textContent = '✅ 등록 완료 — 푸시 알림이 자동 발송됩니다';
      $('bulTitle').value = '';
      $('bulFile').value = '';
      $('bulUpload').disabled = false;
      setTimeout(() => { progress.textContent = ''; }, 4000);
    }
  );
});

function renderBulletins() {
  const list = $('bulList');
  if (!list) return;
  if (state.bulletins.length === 0) { list.innerHTML = '<div class="empty">등록된 주보가 없습니다</div>'; return; }
  list.innerHTML = `<table><thead><tr><th>제목</th><th>해당 주일</th><th>등록일</th><th></th></tr></thead><tbody>${
    state.bulletins.map((b) => `
      <tr>
        <td><b>${escapeHtml(b.title)}</b><br/><span style="color: var(--muted); font-size: 11px;">${escapeHtml(b.contentType || '')} · ${b.size ? humanSize(b.size) : ''}</span></td>
        <td>${escapeHtml(b.date || '')}</td>
        <td>${fmt(b.timestamp)}</td>
        <td>
          <a class="btn btn-sm" href="${escapeHtml(b.url)}" target="_blank" rel="noopener">열기</a>
          <button class="btn btn-sm" data-edit-b="${b.id}">수정</button>
          <button class="btn btn-sm danger" data-del-b="${b.id}" data-path="${escapeHtml(b.storagePath || '')}">삭제</button>
        </td>
      </tr>
    `).join('')
  }</tbody></table>`;
  list.querySelectorAll('[data-edit-b]').forEach((btn) => {
    btn.addEventListener('click', () => editBulletin(btn.dataset.editB));
  });
  list.querySelectorAll('[data-del-b]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('주보를 삭제하시겠어요? 파일도 함께 삭제됩니다.')) return;
      try {
        if (btn.dataset.path) {
          await deleteObject(sRef(storage, btn.dataset.path)).catch(() => {});
        }
        await remove(ref(db, `bulletins/${btn.dataset.delB}`));
      } catch (e) {
        alert('삭제 중 오류: ' + e.message);
      }
    });
  });
}

// ===== 교회 정보 =====
function fillChurchForm() {
  const c = state.church || {};
  if ($('chName')) $('chName').value = c.name || '';
  if ($('chPastor')) $('chPastor').value = c.pastor || '';
  if ($('chPhone')) $('chPhone').value = c.phone || '';
  if ($('chEmail')) $('chEmail').value = c.email || '';
  if ($('chAddress')) $('chAddress').value = c.address || '';
  if ($('chDirections')) $('chDirections').value = c.directions || '';
  if ($('chTagline')) $('chTagline').value = c.tagline || '';
  if ($('chSubtitle')) $('chSubtitle').value = c.subtitle || '';
  renderLogoPreview();
}

function renderLogoPreview() {
  const wrap = $('logoPreviewWrap');
  const img = $('logoPreview');
  if (!wrap || !img) return;
  const url = safeImageUrl(state.church?.logoUrl);
  if (url) {
    img.src = url;
    wrap.style.display = '';
  } else {
    wrap.style.display = 'none';
  }
}

$('chSave')?.addEventListener('click', async () => {
  // update() preserves logoUrl/logoStoragePath that were uploaded separately
  const data = {
    name: $('chName').value.trim(),
    pastor: $('chPastor').value.trim(),
    phone: $('chPhone').value.trim(),
    email: $('chEmail').value.trim(),
    address: $('chAddress').value.trim(),
    directions: $('chDirections').value.trim(),
    tagline: $('chTagline').value.trim(),
    subtitle: $('chSubtitle').value.trim(),
    updatedAt: Date.now()
  };
  try {
    await update(ref(db, 'config/church'), data);
    flashSaved($('chSave'));
  } catch (e) {
    alert('저장 실패: ' + e.message);
  }
});

function flashSaved(btn) {
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = '✓ 저장됨';
  btn.disabled = true;
  setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
}

// ===== 예배 시간 =====
const DAY_NAMES = ['일','월','화','수','목','금','토'];

function renderServices() {
  const list = $('serviceList');
  if (!list) return;
  if (!state.services || state.services.length === 0) {
    list.innerHTML = '<div class="empty">등록된 예배 시간이 없습니다 — 아래에서 추가하세요</div>';
    return;
  }
  list.innerHTML = `<table><thead><tr><th>예배명</th><th>요일·시간</th><th>장소</th><th></th></tr></thead><tbody>${
    state.services.map((s) => `
      <tr>
        <td><b>${escapeHtml(s.name)}</b></td>
        <td>${DAY_NAMES[s.day]}요일 ${escapeHtml(s.time)}</td>
        <td>${escapeHtml(s.place || '-')}</td>
        <td>
          <button class="btn btn-sm" data-edit-sv="${s.id}">수정</button>
          <button class="btn btn-sm danger" data-del-sv="${s.id}">삭제</button>
        </td>
      </tr>
    `).join('')
  }</tbody></table>`;
  list.querySelectorAll('[data-edit-sv]').forEach((btn) => {
    btn.addEventListener('click', () => editService(btn.dataset.editSv));
  });
  list.querySelectorAll('[data-del-sv]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('예배 시간을 삭제하시겠어요?')) return;
      try {
        await remove(ref(db, `config/services/${btn.dataset.delSv}`));
      } catch (e) { alert('삭제 실패: ' + e.message); }
    });
  });
}

function editService(id) {
  const s = state.services.find((x) => x.id === id);
  if (!s) return;
  openEditModal({
    title: '예배 시간 수정',
    fields: [
      { id: 'name', label: '예배명', type: 'text', value: s.name },
      { id: 'day', label: '요일', type: 'select', value: String(s.day),
        options: [['0','일요일'],['1','월요일'],['2','화요일'],['3','수요일'],['4','목요일'],['5','금요일'],['6','토요일']] },
      { id: 'time', label: '시작 시간 (예: 11:00)', type: 'text', value: s.time },
      { id: 'place', label: '장소 (선택)', type: 'text', value: s.place || '' }
    ],
    onSave: async (vals) => {
      const time = vals.time.trim();
      if (!vals.name.trim()) throw new Error('예배명을 입력하세요');
      if (!time) throw new Error('시작 시간을 입력하세요 (예: 11:00)');
      await update(ref(db, `config/services/${id}`), {
        name: vals.name.trim(),
        day: parseInt(vals.day, 10),
        time,
        place: vals.place.trim()
      });
    }
  });
}

function setSvStatus(msg, color = 'var(--muted)') {
  const el = $('svStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color;
}

async function reloadServices() {
  console.log('[svc] reloading from /config/services ...');
  // query() forces a fresh server read even when an onValue listener is active
  const snap = await get(query(ref(db, 'config/services'), orderByChild('createdAt')));
  state.services = [];
  snap.forEach((c) => { state.services.push({ id: c.key, ...c.val() }); });
  state.services.sort((a, b) => (a.day - b.day) || (a.time || '').localeCompare(b.time || ''));
  console.log('[svc] reloaded', state.services.length, 'services:', state.services.map((s) => s.name).join(', '));
  renderServices();
  return state.services.length;
}

$('svAdd')?.addEventListener('click', async () => {
  const name = $('svName').value.trim();
  const day = parseInt($('svDay').value, 10);
  const time = $('svTime').value.trim();
  const place = $('svPlace').value.trim();
  if (!name) { setSvStatus('⚠️ 예배명을 입력하세요', 'var(--danger)'); return; }
  if (!time) { setSvStatus('⚠️ 시작 시간을 입력하세요 (예: 11:00)', 'var(--danger)'); return; }
  const btn = $('svAdd');
  btn.disabled = true;
  btn.textContent = '저장 중...';
  setSvStatus('💾 저장 중...');
  // Pre-flight: verify admin auth state at the moment of write
  console.log('[svc] === svAdd 클릭 시점 진단 ===');
  console.log('[svc] auth.currentUser:', auth.currentUser?.email, auth.currentUser?.uid);
  console.log('[svc] state.isAdmin (클라이언트 플래그):', state.isAdmin);
  try {
    const adminCheck = await get(ref(db, `admins/${auth.currentUser?.uid}`));
    console.log('[svc] /admins/{내UID} 존재 여부:', adminCheck.exists(), adminCheck.val());
    if (!adminCheck.exists()) {
      setSvStatus(`❌ 관리자 권한 없음 — /admins/${auth.currentUser?.uid} 가 비어있음`, 'var(--danger)');
      btn.disabled = false; btn.textContent = '예배 시간 추가';
      return;
    }
  } catch (e) {
    console.error('[svc] 관리자 확인 실패:', e.code, e.message);
  }
  try {
    console.log('[svc] pushing:', { name, day, time, place });
    const ts = Date.now();
    const newData = { name, day, time, place, createdAt: ts };
    const newRef = await push(ref(db, 'config/services'), newData);
    console.log('[svc] pushed key:', newRef.key, '— path:', newRef.toString());
    $('svName').value = ''; $('svTime').value = ''; $('svPlace').value = '';
    // Immediately reflect new item in UI without waiting for onValue to fire
    if (!state.services.some((s) => s.id === newRef.key)) {
      state.services.push({ id: newRef.key, ...newData });
      state.services.sort((a, b) => (a.day - b.day) || (a.time || '').localeCompare(b.time || ''));
      renderServices();
    }
    setSvStatus(`✅ "${name}" 저장됨 — 검증 중...`, 'var(--primary)');
    $('serviceList').scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Verify the data actually persisted to server (catches silent rule rejections)
    setTimeout(async () => {
      try {
        const verify = await get(newRef);
        if (!verify.exists()) {
          console.error('[svc] ❌ 서버 검증 실패 — 데이터가 서버에 없습니다:', newRef.toString());
          setSvStatus(`❌ 서버에 저장되지 않음 — 콘솔에서 PERMISSION_DENIED 등의 에러를 확인하세요`, 'var(--danger)');
          // Roll back local state so UI matches server
          state.services = state.services.filter((s) => s.id !== newRef.key);
          renderServices();
        } else {
          console.log('[svc] ✅ 서버 검증 OK:', verify.val());
          setSvStatus(`✅ "${name}" 저장 완료`, 'var(--primary)');
        }
      } catch (e) {
        console.error('[svc] 검증 중 오류:', e.code, e.message);
        setSvStatus(`⚠️ 검증 중 오류: ${e.code || e.message}`, 'var(--danger)');
      }
    }, 1500);
  } catch (e) {
    console.error('[svc] svAdd error:', e);
    setSvStatus(`❌ 저장 실패 — 잠시 후 다시 시도해주세요`, 'var(--danger)');
  } finally {
    btn.disabled = false;
    btn.textContent = '예배 시간 추가';
  }
});

$('svRefresh')?.addEventListener('click', async () => {
  setSvStatus('🔄 새로고침 중...');
  try {
    const count = await reloadServices();
    setSvStatus(`✓ 현재 총 ${count}개`, 'var(--primary)');
  } catch (e) {
    setSvStatus(`❌ ${e.code || e.message}`, 'var(--danger)');
  }
});

// ===== 메인 사진 (히어로) =====
function renderHeroPreview() {
  const wrap = $('heroPreviewWrap');
  const img = $('heroPreview');
  if (!wrap || !img) return;
  if (state.hero?.url) {
    img.src = safeImageUrl(state.hero.url);
    wrap.style.display = '';
  } else {
    wrap.style.display = 'none';
  }
}

$('heroUpload')?.addEventListener('click', () => {
  const file = $('heroFile').files[0];
  const progress = $('heroProgress');
  if (!file) { alert('이미지 파일을 선택하세요'); return; }
  if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드 가능합니다'); return; }
  if (file.size > 10 * 1024 * 1024) { alert('파일 크기가 10MB를 초과합니다'); return; }

  const ext = file.name.split('.').pop() || 'jpg';
  const path = `img/hero/${Date.now()}.${ext}`;
  const task = uploadBytesResumable(sRef(storage, path), file, { contentType: file.type });

  $('heroUpload').disabled = true;

  task.on('state_changed',
    (snap) => {
      const pct = (snap.bytesTransferred / snap.totalBytes * 100).toFixed(0);
      progress.textContent = `업로드 중... ${pct}%`;
    },
    (err) => {
      progress.textContent = '❌ 업로드 실패: ' + err.message;
      $('heroUpload').disabled = false;
    },
    async () => {
      const url = await getDownloadURL(task.snapshot.ref);
      const prevPath = state.hero?.storagePath;
      await set(ref(db, 'config/hero'), {
        url, storagePath: path,
        contentType: file.type,
        uploadedBy: state.user.uid,
        timestamp: Date.now()
      });
      if (prevPath && prevPath !== path) {
        await deleteObject(sRef(storage, prevPath)).catch(() => {});
      }
      progress.textContent = '✅ 적용 완료 — 사용자 앱 홈 화면에 즉시 반영됩니다';
      $('heroFile').value = '';
      $('heroUpload').disabled = false;
      setTimeout(() => { progress.textContent = ''; }, 4000);
    }
  );
});

$('heroRemove')?.addEventListener('click', async () => {
  if (!state.hero) return;
  if (!confirm('현재 메인 사진을 삭제하시겠어요? 기본 이미지로 돌아갑니다.')) return;
  try {
    if (state.hero.storagePath) {
      await deleteObject(sRef(storage, state.hero.storagePath)).catch(() => {});
    }
    await remove(ref(db, 'config/hero'));
  } catch (e) {
    alert('삭제 실패: ' + e.message);
  }
});

// ===== 교회 로고 업로드 =====
$('logoUpload')?.addEventListener('click', () => {
  const file = $('logoFile').files[0];
  const progress = $('logoProgress');
  if (!file) { alert('이미지 파일을 선택하세요'); return; }
  if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드 가능합니다'); return; }
  if (file.size > 3 * 1024 * 1024) { alert('파일 크기가 3MB를 초과합니다'); return; }
  const ext = file.name.split('.').pop() || 'png';
  const path = `img/logo/${Date.now()}.${ext}`;
  const task = uploadBytesResumable(sRef(storage, path), file, { contentType: file.type });
  $('logoUpload').disabled = true;
  progress.textContent = '업로드 중... 0%';
  task.on('state_changed',
    (s) => { progress.textContent = `업로드 중... ${Math.round((s.bytesTransferred / s.totalBytes) * 100)}%`; },
    (err) => { progress.textContent = '❌ 업로드 실패: ' + err.message; $('logoUpload').disabled = false; },
    async () => {
      try {
        const url = await getDownloadURL(task.snapshot.ref);
        const prevPath = state.church?.logoStoragePath;
        await update(ref(db, 'config/church'), { logoUrl: url, logoStoragePath: path, updatedAt: Date.now() });
        if (prevPath && prevPath !== path) {
          await deleteObject(sRef(storage, prevPath)).catch(() => {});
        }
        progress.textContent = '✅ 업로드 완료';
        $('logoFile').value = '';
      } catch (e) {
        progress.textContent = '❌ 저장 실패: ' + e.message;
      } finally {
        $('logoUpload').disabled = false;
      }
    }
  );
});

$('logoRemove')?.addEventListener('click', async () => {
  if (!state.church?.logoUrl) return;
  if (!confirm('교회 로고를 삭제하시겠어요? 기본 표시(이니셜)로 돌아갑니다.')) return;
  try {
    if (state.church.logoStoragePath) {
      await deleteObject(sRef(storage, state.church.logoStoragePath)).catch(() => {});
    }
    await update(ref(db, 'config/church'), { logoUrl: null, logoStoragePath: null });
  } catch (e) {
    alert('삭제 실패: ' + e.message);
  }
});

// ===== 메인 사진 업로드 시 자동 리사이즈 =====
// (위의 heroUpload는 큰 이미지를 그대로 올리므로, 여기서 가로채서 리사이즈)
const heroFileInput = $('heroFile');
if (heroFileInput) {
  heroFileInput.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f || !f.type.startsWith('image/')) return;
    try {
      const resized = await resizeImage(f, { maxDim: 2400, quality: 0.88 });
      const dt = new DataTransfer();
      dt.items.add(resized);
      heroFileInput.files = dt.files;
      const orig = humanSize(f.size);
      const now = humanSize(resized.size);
      const note = $('heroProgress');
      if (note && f !== resized) note.textContent = `📐 자동 리사이즈: ${orig} → ${now}`;
    } catch (err) { console.warn('리사이즈 실패', err); }
  });
}

// ===== 주보 편집 =====
function editBulletin(id) {
  const b = state.bulletins.find((x) => x.id === id);
  if (!b) return;
  openEditModal({
    title: '주보 수정',
    fields: [
      { id: 'title', label: '제목', type: 'text', value: b.title },
      { id: 'date', label: '해당 주일', type: 'date', value: b.date }
    ],
    onSave: async (vals) => {
      await update(ref(db, `bulletins/${id}`), { title: vals.title, date: vals.date });
    }
  });
}

// ===== 공통 편집 모달 =====
function openEditModal({ title, fields, onSave }) {
  closeEditModal();
  const overlay = document.createElement('div');
  overlay.className = 'edit-modal-bg';
  overlay.id = 'editModalBg';
  overlay.innerHTML = `
    <div class="edit-modal">
      <div class="edit-modal-head">
        <h3>${escapeHtml(title)}</h3>
        <button class="edit-modal-close" type="button" aria-label="닫기">×</button>
      </div>
      <div class="edit-modal-body">
        ${fields.map((f) => fieldHtml(f)).join('')}
      </div>
      <div class="edit-modal-foot">
        <button class="btn" id="editCancel" type="button">취소</button>
        <button class="btn primary" id="editSave" type="button">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeEditModal(); });
  overlay.querySelector('.edit-modal-close').addEventListener('click', closeEditModal);
  overlay.querySelector('#editCancel').addEventListener('click', closeEditModal);
  overlay.querySelector('#editSave').addEventListener('click', async () => {
    const vals = {};
    for (const f of fields) {
      const el = overlay.querySelector(`[name="${f.id}"]`);
      vals[f.id] = el ? el.value.trim() : '';
    }
    try {
      await onSave(vals);
      closeEditModal();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    }
  });
  setTimeout(() => overlay.classList.add('show'), 10);
}

function fieldHtml(f) {
  const v = escapeHtml(f.value ?? '');
  if (f.type === 'textarea') {
    return `<label>${escapeHtml(f.label)}</label><textarea class="field" name="${f.id}" rows="4">${v}</textarea>`;
  }
  if (f.type === 'select') {
    const opts = (f.options || []).map(([val, lab]) => `<option value="${escapeHtml(val)}" ${String(val) === String(f.value) ? 'selected' : ''}>${escapeHtml(lab)}</option>`).join('');
    return `<label>${escapeHtml(f.label)}</label><select class="field" name="${f.id}">${opts}</select>`;
  }
  const t = f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : 'text');
  return `<label>${escapeHtml(f.label)}</label><input class="field" name="${f.id}" type="${t}" value="${v}"/>`;
}

function closeEditModal() {
  const el = document.getElementById('editModalBg');
  if (el) el.remove();
}

// ===== 교회 일정 (캘린더) =====
function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const evDateInput = $('evDate');
if (evDateInput && !evDateInput.value) evDateInput.value = todayDateStr();

$('evSubmit')?.addEventListener('click', async () => {
  const title = $('evTitle').value.trim();
  const date = $('evDate').value;
  const category = $('evCategory').value;
  if (!title) { alert('일정 제목을 입력해주세요'); return; }
  if (!date) { alert('날짜를 선택해주세요'); return; }
  await push(ref(db, 'events'), {
    title, date, category,
    time: $('evTime').value || '',
    location: $('evLocation').value.trim(),
    desc: $('evDesc').value.trim(),
    createdBy: state.user.uid,
    createdAt: Date.now()
  });
  $('evTitle').value = ''; $('evTime').value = '';
  $('evLocation').value = ''; $('evDesc').value = '';
  alert('일정이 등록되었습니다');
});

function renderEvents() {
  const list = $('eventsList');
  if (!list) return;
  if (!state.events || state.events.length === 0) {
    list.innerHTML = '<div class="empty">등록된 일정이 없습니다</div>';
    return;
  }
  const catPill = (cat) => {
    const cls = ({행사: 'event', 교육: 'notice', 봉사: 'urgent', 기타: ''})[cat] || '';
    return `<span class="pill ${cls}">${escapeHtml(cat || '기타')}</span>`;
  };
  list.innerHTML = `<table><thead><tr><th>분류</th><th>날짜</th><th>제목</th><th>시간</th><th>장소</th><th></th></tr></thead><tbody>${
    state.events.map((e) => `
      <tr>
        <td>${catPill(e.category)}</td>
        <td>${escapeHtml(e.date)}</td>
        <td><b>${escapeHtml(e.title)}</b>${e.desc ? `<br/><span style="color:var(--muted);font-size:12px;">${escapeHtml(e.desc.slice(0,50))}${e.desc.length>50?'…':''}</span>` : ''}</td>
        <td>${escapeHtml(e.time || '-')}</td>
        <td>${escapeHtml(e.location || '-')}</td>
        <td>
          <button class="btn btn-sm" data-edit-ev="${e.id}">수정</button>
          <button class="btn btn-sm danger" data-del-ev="${e.id}">삭제</button>
        </td>
      </tr>
    `).join('')
  }</tbody></table>`;
  list.querySelectorAll('[data-edit-ev]').forEach((b) => b.addEventListener('click', () => editEvent(b.dataset.editEv)));
  list.querySelectorAll('[data-del-ev]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('일정을 삭제하시겠어요?')) return;
      await remove(ref(db, `events/${b.dataset.delEv}`));
    });
  });
}

function editEvent(id) {
  const e = state.events.find((x) => x.id === id);
  if (!e) return;
  openEditModal({
    title: '일정 수정',
    fields: [
      { id: 'title', label: '제목', type: 'text', value: e.title },
      { id: 'date', label: '날짜', type: 'date', value: e.date },
      { id: 'category', label: '분류', type: 'select', value: e.category,
        options: [['예배','예배'],['행사','행사'],['교육','교육'],['봉사','봉사'],['기타','기타']] },
      { id: 'time', label: '시간', type: 'text', value: e.time || '' },
      { id: 'location', label: '장소', type: 'text', value: e.location || '' },
      { id: 'desc', label: '설명', type: 'textarea', value: e.desc || '' }
    ],
    onSave: async (vals) => {
      if (!vals.title) throw new Error('제목을 입력하세요');
      if (!vals.date) throw new Error('날짜를 선택하세요');
      await update(ref(db, `events/${id}`), {
        title: vals.title, date: vals.date, category: vals.category,
        time: vals.time, location: vals.location, desc: vals.desc
      });
    }
  });
}

// ===== 갤러리 (관리자 모니터링) =====
function renderGallery() {
  const list = $('galleryList');
  if (!list) return;
  if (!state.gallery || state.gallery.length === 0) {
    list.innerHTML = '<div class="empty">등록된 사진이 없습니다 — 사용자 앱 갤러리 탭에서 사진을 올리면 여기에 표시됩니다</div>';
    return;
  }
  list.innerHTML = `<div class="admin-gallery-grid">${
    state.gallery.map((g) => `
      <div class="admin-gallery-item">
        <a href="${escapeHtml(safeImageUrl(g.url))}" target="_blank" rel="noopener">
          <img src="${escapeHtml(safeImageUrl(g.url))}" alt="${escapeHtml(g.caption || '')}" loading="lazy"/>
        </a>
        <div class="admin-gallery-meta">
          <div class="admin-gallery-info">
            <b>${escapeHtml(g.uploaderName || '익명')}</b>
            <span>${fmt(g.timestamp)} · ${g.size ? humanSize(g.size) : ''}</span>
            ${g.caption ? `<span class="cap">${escapeHtml(g.caption)}</span>` : ''}
          </div>
          <button class="btn btn-sm danger" data-del-g="${g.id}" data-path="${escapeHtml(g.storagePath || '')}">삭제</button>
        </div>
      </div>
    `).join('')
  }</div>`;
  list.querySelectorAll('[data-del-g]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('이 사진을 삭제하시겠어요? Storage에서도 함께 제거됩니다.')) return;
      try {
        if (btn.dataset.path) {
          await deleteObject(sRef(storage, btn.dataset.path)).catch(() => {});
        }
        await remove(ref(db, `gallery/${btn.dataset.delG}`));
      } catch (e) { alert('삭제 실패: ' + e.message); }
    });
  });
}
