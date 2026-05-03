/* =============================================================
 * 천안남산교회 PWA — 사용자 앱 (Firebase RTDB 연동)
 * ============================================================= */

import { db, auth, storage } from '/firebase-init.js';
import { resizeImage, humanSize } from '/img-utils.js';
import {
  ref, onValue, push, update, get, set, remove, serverTimestamp, query, orderByChild
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import {
  signInAnonymously, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  ref as sRef, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js";

// ----- 시드 데이터 (DB 비어있을 때 1회만) -----
const SEED_ROOMS = [
  { title: '기타 기초 배우기', category: '음악', target: '중고등부', teacher: '김OO 집사',
    schedule: '토요일 오후 2시', place: '교육관 2층', capacity: 5, joined: 3, status: '모집중',
    desc: '찬양팀을 꿈꾸는 학생들을 위한 기타 기초반입니다.', approved: true },
  { title: '스마트폰 사용 도움방', category: '어르신 도움', target: '어르신', teacher: '청년부 봉사팀',
    schedule: '주일 점심 후', place: '친교실', capacity: 10, joined: 6, status: '모집중',
    desc: '카카오톡, 사진 보내기, 병원 예약 앱 사용을 함께 배웁니다.', approved: true },
  { title: '영어 숙제 도움방', category: '학습', target: '주일학교', teacher: '이OO 선생님',
    schedule: '수요일 오후 5시', place: '소그룹실 A', capacity: 6, joined: 5, status: '모집중',
    desc: '초등부 아이들의 영어 숙제와 기초 단어를 도와줍니다.', approved: true },
  { title: '영상편집 기초반', category: '디지털', target: '중고등부', teacher: '미디어팀',
    schedule: '토요일 오전 10시', place: '미디어실', capacity: 8, joined: 8, status: '마감',
    desc: '휴대폰과 무료 프로그램으로 짧은 영상을 만드는 방법을 배웁니다.', approved: true },
  { title: '토요 축구교실', category: '운동', target: '중고등부', teacher: '정OO 집사',
    schedule: '토요일 오후 4시', place: '인근 운동장', capacity: 12, joined: 7, status: '모집중',
    desc: '운동과 교제를 함께하는 중고등부 축구 모임입니다.', approved: true },
  { title: '성경 필사 모임', category: '신앙', target: '전교인', teacher: '전도회 연합',
    schedule: '매주 금요일 오전', place: '본당 로비', capacity: 20, joined: 11, status: '모집중',
    desc: '천천히 말씀을 쓰며 묵상하는 전교인 모임입니다.', approved: true }
];

const SEED_PRAYERS = [
  { name: '김OO 권사', type: '공개', text: '수술 후 회복 중인 가족을 위해 함께 기도해주세요.', count: 12 },
  { name: '익명', type: '익명 공개', text: '자녀의 진로와 믿음 생활을 위해 기도 부탁드립니다.', count: 8 },
  { name: '박OO 집사', type: '감사', text: '기도해주신 덕분에 치료 결과가 좋게 나왔습니다. 감사합니다.', count: 19 }
];

const SEED_ANNOUNCEMENTS = [
  { tag: 'urgent', title: '이번 주 예배 안내', body: '주일예배 오전 11시, 수요예배 오후 7시 30분에 드립니다.' },
  { tag: 'event', title: '야외예배 신청', body: '참석 인원과 차량 이용 여부를 함께 신청해주세요. (5월 12일 마감)' },
  { tag: 'notice', title: '식사봉사 3명 모집', body: '주일 점심 준비와 정리를 도와주실 성도를 기다립니다.' }
];

const SEED_SERMON = {
  title: '서로 사랑하라',
  verse: '요한복음 13장 34절',
  meta: '2026년 5월 첫째 주 · 담임목사 설교',
  body: '예수님이 주신 새 계명은 서로 사랑하는 삶입니다. 이번 주에는 가족, 이웃, 교회 안의 한 사람에게 먼저 연락하고 섬기는 실천을 해봅니다.',
  practice: '한 사람에게 먼저 안부 연락하기',
  question: '이번 주 내가 사랑으로 섬길 사람은 누구인가요?',
  videoId: '',
  start: 0,
  end: 0
};

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
  currentMonth: new Date()
};

// ===== 익명 로그인 =====
signInAnonymously(auth).catch((e) => {
  console.error('🚨 익명 로그인 실패 — Firebase Console → Authentication → Sign-in method → 익명 활성화 필요:', e.code, e.message);
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  state.uid = user.uid;
  await seedIfEmpty();
  attachListeners();
  loadMyPrayedFlags();
});

// ===== 시드 (최초 1회만) =====
async function seedIfEmpty() {
  try {
    const seeded = await get(ref(db, '_seed/v1'));
    if (seeded.exists()) return;

    const [roomsSnap, prayersSnap, annSnap, sermonSnap] = await Promise.all([
      get(ref(db, 'rooms')),
      get(ref(db, 'prayers')),
      get(ref(db, 'announcements')),
      get(ref(db, 'sermons/current'))
    ]);

    const writes = [];
    if (!roomsSnap.exists()) {
      SEED_ROOMS.forEach((r, i) => {
        writes.push(push(ref(db, 'rooms'), { ...r, timestamp: Date.now() - (SEED_ROOMS.length - i) * 1000, createdBy: 'system' }));
      });
    }
    if (!prayersSnap.exists()) {
      SEED_PRAYERS.forEach((p, i) => {
        writes.push(push(ref(db, 'prayers'), { ...p, timestamp: Date.now() - (SEED_PRAYERS.length - i) * 1000, createdBy: 'system' }));
      });
    }
    if (!annSnap.exists()) {
      SEED_ANNOUNCEMENTS.forEach((a, i) => {
        writes.push(push(ref(db, 'announcements'), { ...a, timestamp: Date.now() - (SEED_ANNOUNCEMENTS.length - i) * 1000 }));
      });
    }
    if (!sermonSnap.exists()) {
      writes.push(set(ref(db, 'sermons/current'), { ...SEED_SERMON, timestamp: Date.now() }));
    }
    await Promise.all(writes);
    await set(ref(db, '_seed/v1'), Date.now());
  } catch (e) {
    console.warn('시드 실패 (보안 규칙 확인 필요):', e.message);
  }
}

// ===== 실시간 리스너 =====
let listenersAttached = false;
function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  onValue(ref(db, 'rooms'), (snap) => {
    state.rooms = [];
    snap.forEach((c) => state.rooms.push({ id: c.key, ...c.val() }));
    state.rooms.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (state.currentTab === 'share') renderRooms();
  });

  onValue(ref(db, 'prayers'), (snap) => {
    state.prayers = [];
    snap.forEach((c) => state.prayers.push({ id: c.key, ...c.val() }));
    state.prayers.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderPrayers();
  });

  onValue(ref(db, 'announcements'), (snap) => {
    state.announcements = [];
    snap.forEach((c) => state.announcements.push({ id: c.key, ...c.val() }));
    state.announcements.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderAnnouncements();
  });

  onValue(ref(db, 'sermons/current'), (snap) => {
    if (!snap.exists()) return;
    renderSermon(snap.val());
  });

  onValue(ref(db, 'bulletins'), (snap) => {
    state.bulletins = [];
    snap.forEach((c) => state.bulletins.push({ id: c.key, ...c.val() }));
    state.bulletins.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderBulletins();
  });
  onValue(ref(db, 'config/church'), (snap) => {
    state.church = snap.val() || {};
    applyChurchInfo();
  });
  onValue(ref(db, 'config/services'), (snap) => {
    state.services = [];
    snap.forEach((c) => state.services.push({ id: c.key, ...c.val() }));
    state.services.sort((a, b) => (a.day - b.day) || (a.time || '').localeCompare(b.time || ''));
    console.log('[home] config/services →', state.services.length, '개:', state.services.map((s) => s.name).join(', '));
    renderServiceTimes();
  }, (err) => {
    console.error('[home] config/services 읽기 실패:', err.code || err.message, err);
    const list = document.getElementById('serviceList');
    if (list) list.innerHTML = `<div class="service-empty">⚠️ 예배 시간을 불러오지 못했습니다 (${err.code || '권한 오류'})</div>`;
  });
  onValue(ref(db, 'config/hero'), (snap) => {
    state.hero = snap.val() || null;
    applyHero();
  });

  onValue(ref(db, 'gallery'), (snap) => {
    state.gallery = [];
    snap.forEach((c) => state.gallery.push({ id: c.key, ...c.val() }));
    state.gallery.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderGallery();
  });

  onValue(ref(db, 'events'), (snap) => {
    state.events = [];
    snap.forEach((c) => state.events.push({ id: c.key, ...c.val() }));
    state.events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (state.currentTab === 'calendar') renderCalendar();
    else renderUpcomingEvents();
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
      <img src="${escapeHtml(g.url)}" alt="${escapeHtml(g.caption || '')}" loading="lazy"/>
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
  img.src = g.url;
  img.alt = g.caption || '';
  const date = g.timestamp ? new Date(g.timestamp) : null;
  const dateStr = date ? `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}` : '';
  meta.innerHTML = `<b>${escapeHtml(g.uploaderName || '익명')}</b>${g.caption ? ' · ' + escapeHtml(g.caption) : ''}${dateStr ? ' · ' + dateStr : ''}`;
  openModal('galleryViewer');
}

function applyHero() {
  const bg = document.querySelector('.hero-bg');
  if (!bg) return;
  if (state.hero?.url) {
    bg.style.backgroundImage = `url('${state.hero.url}')`;
    bg.style.opacity = '0.7';
  } else {
    bg.style.backgroundImage = "url('/img/hero.jpg'), url('/img/hero.svg')";
    bg.style.opacity = '0.55';
  }
}

function applyChurchInfo() {
  const c = state.church || {};
  document.querySelectorAll('[data-church="name"]').forEach((el) => { el.textContent = c.name || '천안남산교회'; });
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

// ===== 탭 전환 =====
function switchTab(name) {
  state.currentTab = name;
  document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
  document.getElementById('tab-' + name)?.classList.add('active');
  document.querySelectorAll('.tabbar-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (name === 'share') renderRooms();
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
function openModal(id) {
  document.getElementById(id)?.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('show');
  document.body.style.overflow = '';
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

function formatHM(time) {
  const [hh, mm] = (time || '11:00').split(':').map(Number);
  const ampm = hh < 12 ? '오전' : '오후';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${ampm} ${h12}:${String(mm).padStart(2, '0')}`;
}

function renderServiceTimes() {
  const list = document.getElementById('serviceList');
  if (!list) return;
  const services = state.services || [];
  if (!services.length) {
    list.innerHTML = '<div class="service-empty">예배 시간이 곧 안내됩니다</div>';
    return;
  }
  list.innerHTML = services.map((s) => `
    <div class="service-row">
      <div>
        <div class="service-day">${DAY_NAMES_KO[s.day]}요일</div>
        <div class="service-name">${escapeHtml(s.name)}</div>
        ${s.place ? `<div class="service-place">${escapeHtml(s.place)}</div>` : ''}
      </div>
      <div class="service-time">${formatHM(s.time)}</div>
    </div>
  `).join('');
}

// ===== 인사말 =====
function setGreeting() {
  const h = new Date().getHours();
  const greeting = h < 6 ? '평안한 새벽입니다' : h < 12 ? '좋은 아침입니다' : h < 18 ? '평안한 오후입니다' : '평안한 저녁입니다';
  const el = document.getElementById('greetingHi');
  if (el) el.textContent = greeting;
}
setGreeting();

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

// ===== 공지 (홈 피드) =====
function renderAnnouncements() {
  const feed = document.querySelector('#tab-home .feed');
  if (!feed) return;
  if (state.announcements.length === 0) {
    feed.innerHTML = '<div class="feed-card"><h3>아직 등록된 소식이 없어요</h3><p>첫 공지가 등록되면 여기에 표시됩니다.</p></div>';
    return;
  }
  feed.innerHTML = state.announcements.slice(0, 5).map((a) => `
    <article class="feed-card">
      <div class="top"><span class="tag ${escapeHtml(a.tag || 'notice')}">${tagLabel(a.tag)}</span><span class="time">${timeAgo(a.timestamp)}</span></div>
      <h3>${escapeHtml(a.title || '')}</h3>
      <p>${escapeHtml(a.body || '')}</p>
    </article>
  `).join('');
}

function tagLabel(t) {
  return ({ urgent: '중요', event: '신청중', notice: '소식', praise: '감사' })[t] || '소식';
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
  const practiceP = document.querySelector('#tab-word .practice-box:not(.q) p');
  const questionP = document.querySelector('#tab-word .practice-box.q p');
  if (meta) meta.textContent = s.meta || '';
  if (titleEl) titleEl.textContent = s.title || '';
  if (verseEl) verseEl.textContent = s.verse || '';
  if (bodyEl) bodyEl.textContent = s.body || '';
  if (practiceP) practiceP.textContent = s.practice || '';
  if (questionP) questionP.textContent = s.question || '';

  if (s.videoId) {
    const params = new URLSearchParams({ rel: '0', modestbranding: '1' });
    if (s.start) params.set('start', s.start);
    if (s.end) params.set('end', s.end);
    const iframe = document.getElementById('sermonFrame');
    const ph = document.getElementById('sermonPlaceholder');
    if (iframe) iframe.src = `https://www.youtube.com/embed/${s.videoId}?${params.toString()}`;
    if (ph) ph.style.display = 'none';
  }
}

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
      return `
        <article class="prayer-card" data-id="${p.id}">
          <div class="prayer-head">
            <span class="name">${escapeHtml(p.name || '익명')}</span>
            <span class="tag">${escapeHtml(p.type === '익명 공개' ? '익명' : p.type === '교역자에게만 전달' ? '비공개' : p.type || '공개')}</span>
            <span class="when">${timeAgo(p.timestamp)}</span>
          </div>
          <p class="body">${escapeHtml(p.text || '')}</p>
          <button class="pray-action ${done ? 'done' : ''}" data-id="${p.id}" type="button">🙏 기도했어요 <b>${p.count || 0}</b></button>
        </article>
      `;
    }).join('');

  feed.querySelectorAll('.pray-action').forEach((btn) => {
    btn.addEventListener('click', () => prayFor(btn.dataset.id));
  });
}

async function prayFor(prayerId) {
  if (!state.uid) { toast('잠시 후 다시 시도해주세요'); return; }
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

document.getElementById('pSubmit')?.addEventListener('click', async () => {
  const name = document.getElementById('pName').value.trim() || '익명';
  const type = document.getElementById('pType').value;
  const text = document.getElementById('pText').value.trim();
  if (!text) { toast('기도제목을 입력해주세요'); return; }
  try {
    await push(ref(db, 'prayers'), {
      name: type === '익명 공개' ? '익명' : name,
      type, text, count: 0,
      createdBy: state.uid, timestamp: Date.now()
    });
    document.getElementById('pName').value = '';
    document.getElementById('pText').value = '';
    closeModal('prayerModal');
    toast(type === '교역자에게만 전달' ? '교역자에게 비공개로 전달되었습니다' : '기도제목이 등록되었습니다');
  } catch (e) {
    toast('등록 중 오류가 발생했어요');
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
document.querySelectorAll('[data-action]').forEach((el) => {
  el.addEventListener('click', () => {
    const a = el.dataset.action;
    if (a === 'login') toast('전화번호 인증은 다음 업데이트에서 추가됩니다');
    else if (a === 'qr' || a === 'attendance') openCheckinModal();
    else if (a === 'install') triggerInstall();
    else if (a === 'visit') openModal('visitModal');
    else if (a === 'newcomer') openModal('newcomerModal');
    else if (a === 'info' || a === 'contact') openInfoModal();
    else if (a === 'myPrayers') openMyPrayers();
    else if (a === 'myApplications') openMyApplications();
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
  const ids = JSON.parse(localStorage.getItem('myAppIds') || '[]');
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
    return listRowHtml({
      tag: a.kind || '신청',
      title: detail,
      body: `${a.name || ''}${a.phone ? ' · ' + a.phone : ''}`,
      time: timeAgo(a.timestamp)
    });
  }).join('');
  openListModal('내 신청 내역', rows || '<div class="list-empty">신청 내역을 불러오지 못했어요</div>');
}

function recordMyApplication(id) {
  if (!id) return;
  try {
    const ids = JSON.parse(localStorage.getItem('myAppIds') || '[]');
    if (!ids.includes(id)) {
      ids.unshift(id);
      localStorage.setItem('myAppIds', JSON.stringify(ids.slice(0, 50)));
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
  const sel = document.getElementById('ciService');
  const services = state.services || [];
  if (sel) {
    sel.innerHTML = services.length
      ? services.map((s) => `<option value="${escapeHtml(s.id)}">${DAY_NAMES_KO[s.day]}요일 ${escapeHtml(s.name)} · ${formatHM(s.time)}</option>`).join('')
      : '<option value="">예배 정보가 없어요</option>';
  }
  const ciName = document.getElementById('ciName');
  if (ciName) ciName.value = localStorage.getItem('attendName') || '';
  const status = document.getElementById('ciStatus');
  if (status) { status.textContent = ''; status.style.color = ''; }
  openModal('checkinModal');
}

document.getElementById('ciSubmit')?.addEventListener('click', async () => {
  const name = document.getElementById('ciName')?.value.trim();
  const serviceId = document.getElementById('ciService')?.value;
  const status = document.getElementById('ciStatus');
  if (!name) { if (status) { status.textContent = '이름을 입력해주세요'; status.style.color = '#c44'; } return; }
  if (!serviceId) { if (status) { status.textContent = '예배를 선택해주세요'; status.style.color = '#c44'; } return; }
  const today = new Date().toISOString().slice(0, 10);
  const service = (state.services || []).find((s) => s.id === serviceId);
  try {
    const newRef = await push(ref(db, 'applications'), {
      kind: '출석', name,
      date: today,
      serviceId,
      serviceName: service ? `${DAY_NAMES_KO[service.day]}요일 ${service.name}` : '',
      userUid: state.uid, timestamp: Date.now()
    });
    recordMyApplication(newRef.key);
    localStorage.setItem('attendName', name);
    if (status) { status.textContent = `✅ ${today} 출석이 기록되었습니다`; status.style.color = 'var(--primary)'; }
    setTimeout(() => closeModal('checkinModal'), 1200);
  } catch (e) {
    if (status) { status.textContent = '저장 실패: ' + e.message; status.style.color = '#c44'; }
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
