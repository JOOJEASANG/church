/* =============================================================
 * 천안남산교회 PWA — 사용자 앱 (Firebase RTDB 연동)
 * ============================================================= */

import { db, auth } from '/firebase-init.js';
import {
  ref, onValue, push, update, get, set, remove, serverTimestamp, query, orderByChild
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import {
  signInAnonymously, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

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
  prayedBy: {}     // {prayerId: true} for current user
};

// ===== 익명 로그인 =====
signInAnonymously(auth).catch((e) => console.warn('익명 로그인 실패', e));

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
function attachListeners() {
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

// ===== 카운트다운 =====
function nextSunday11() {
  const now = new Date();
  const d = new Date(now);
  const day = d.getDay();
  const daysUntilSun = (7 - day) % 7;
  d.setDate(d.getDate() + daysUntilSun);
  d.setHours(11, 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 7);
  return d;
}
function updateCountdown() {
  const target = nextSunday11();
  const now = new Date();
  const diffMs = target - now;
  const cdNum = document.getElementById('cdNum');
  const cdUnit = document.getElementById('cdUnit');
  const cdWhen = document.getElementById('cdWhen');
  if (!cdNum) return;
  const totalH = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalH / 24);
  const hours = totalH % 24;
  const mins = Math.floor((diffMs / (1000 * 60)) % 60);
  if (days > 0) { cdNum.textContent = days; cdUnit.textContent = `일 ${hours}시간 남음`; }
  else if (totalH > 0) { cdNum.textContent = totalH; cdUnit.textContent = `시간 ${mins}분 남음`; }
  else if (mins > 0) { cdNum.textContent = mins; cdUnit.textContent = '분 남음'; }
  else { cdNum.textContent = '예배'; cdUnit.textContent = '드릴 시간!'; }
  cdWhen.textContent = `${target.getMonth()+1}월 ${target.getDate()}일 주일 오전 11시`;
}
updateCountdown();
setInterval(updateCountdown, 60 * 1000);

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
  return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
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

// ===== 재능나눔방 신청 모달 (간단 인라인) =====
async function openRoomApply(roomId) {
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room) return;
  const name = prompt(`[${room.title}] 신청자 이름을 입력해주세요`);
  if (!name) return;
  const phone = prompt('연락처를 입력해주세요 (010-0000-0000)') || '';
  try {
    await push(ref(db, 'applications'), {
      roomId, roomTitle: room.title, name, phone,
      userUid: state.uid, timestamp: Date.now()
    });
    if (room.joined < room.capacity) {
      await update(ref(db, `rooms/${roomId}`), { joined: room.joined + 1 });
    }
    toast(`${room.title} 신청이 접수되었습니다`);
  } catch (e) {
    toast('신청 중 오류가 발생했어요');
    console.error(e);
  }
}

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
    await push(ref(db, 'applications'), {
      kind: '봉사', name,
      phone: document.getElementById('vPhone').value.trim(),
      type: document.getElementById('vKind').value,
      time: document.getElementById('vTime').value.trim(),
      userUid: state.uid, timestamp: Date.now()
    });
    ['vName','vPhone','vTime'].forEach((i) => { const e = document.getElementById(i); if (e) e.value = ''; });
    closeModal('volunteerModal');
    toast('봉사 신청이 접수되었습니다');
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
    const VAPID_KEY = ''; // ← Firebase 콘솔 → Cloud Messaging → 웹 푸시 인증서 → VAPID 키 입력
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
    else if (a === 'qr') toast('QR 출석체크는 다음 단계에서 열립니다');
    else if (a === 'install') triggerInstall();
    else if (a === 'visit') toast('심방 요청은 교역자 전용 화면으로 비공개 전달됩니다');
    else if (a === 'newcomer') toast('새가족 등록 화면을 곧 열어드려요');
    else if (a === 'info') toast('교회 위치·연락처는 곧 추가됩니다');
    else if (a === 'contact') toast('교회 연락처는 곧 추가됩니다');
    else toast('기능 준비 중이에요');
  });
});

document.getElementById('notifBtn')?.addEventListener('click', () => toast('새 알림이 없습니다'));
document.getElementById('searchBtn')?.addEventListener('click', () => toast('검색은 다음 업데이트에서 추가됩니다'));

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

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
