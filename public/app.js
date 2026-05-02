/* ============================================================
 * 천안남산교회 PWA — 앱 셸 로직 (Phase 1: 정적 데이터 / 로컬 저장)
 * Phase 2 에서 Firebase RTDB 연동으로 교체 예정
 * ============================================================ */

// ----- 시드 데이터 (Phase 2 에서 RTDB 로 이동) -----
const SEED_ROOMS = [
  { id: 1, title: '기타 기초 배우기', category: '음악', target: '중고등부', teacher: '김OO 집사',
    schedule: '토요일 오후 2시', place: '교육관 2층', capacity: 5, joined: 3, status: '모집중',
    desc: '찬양팀을 꿈꾸는 학생들을 위한 기타 기초반입니다.' },
  { id: 2, title: '스마트폰 사용 도움방', category: '어르신 도움', target: '어르신', teacher: '청년부 봉사팀',
    schedule: '주일 점심 후', place: '친교실', capacity: 10, joined: 6, status: '모집중',
    desc: '카카오톡, 사진 보내기, 병원 예약 앱 사용을 함께 배웁니다.' },
  { id: 3, title: '영어 숙제 도움방', category: '학습', target: '주일학교', teacher: '이OO 선생님',
    schedule: '수요일 오후 5시', place: '소그룹실 A', capacity: 6, joined: 5, status: '모집중',
    desc: '초등부 아이들의 영어 숙제와 기초 단어를 도와줍니다.' },
  { id: 4, title: '영상편집 기초반', category: '디지털', target: '중고등부', teacher: '미디어팀',
    schedule: '토요일 오전 10시', place: '미디어실', capacity: 8, joined: 8, status: '마감',
    desc: '휴대폰과 무료 프로그램으로 짧은 영상을 만드는 방법을 배웁니다.' },
  { id: 5, title: '토요 축구교실', category: '운동', target: '중고등부', teacher: '정OO 집사',
    schedule: '토요일 오후 4시', place: '인근 운동장', capacity: 12, joined: 7, status: '모집중',
    desc: '운동과 교제를 함께하는 중고등부 축구 모임입니다.' },
  { id: 6, title: '성경 필사 모임', category: '신앙', target: '전교인', teacher: '전도회 연합',
    schedule: '매주 금요일 오전', place: '본당 로비', capacity: 20, joined: 11, status: '모집중',
    desc: '천천히 말씀을 쓰며 묵상하는 전교인 모임입니다.' }
];

const state = {
  currentTab: 'home',
  currentCategory: '전체',
  rooms: [...SEED_ROOMS],
  prayers: []
};

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

// 진입 시 ?tab=xxx 처리 (PWA shortcuts 용)
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
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove('show');
  document.body.style.overflow = '';
}

document.querySelectorAll('[data-modal]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    openModal(el.dataset.modal);
  });
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

// ===== 카운트다운: 다음 주일 오전 11시 =====
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

  if (days > 0) {
    cdNum.textContent = days;
    cdUnit.textContent = `일 ${hours}시간 남음`;
  } else if (totalH > 0) {
    cdNum.textContent = totalH;
    cdUnit.textContent = `시간 ${mins}분 남음`;
  } else if (mins > 0) {
    cdNum.textContent = mins;
    cdUnit.textContent = '분 남음';
  } else {
    cdNum.textContent = '예배';
    cdUnit.textContent = '드릴 시간!';
  }

  const m = target.getMonth() + 1;
  const d = target.getDate();
  cdWhen.textContent = `${m}월 ${d}일 주일 오전 11시`;
}
updateCountdown();
setInterval(updateCountdown, 60 * 1000);

// ===== 인사말 (시간대) =====
function setGreeting() {
  const h = new Date().getHours();
  const greeting = h < 6 ? '평안한 새벽입니다' :
                   h < 12 ? '좋은 아침입니다' :
                   h < 18 ? '평안한 오후입니다' : '평안한 저녁입니다';
  const el = document.getElementById('greetingHi');
  if (el) el.textContent = greeting;
}
setGreeting();

// ===== 재능나눔방 렌더 =====
function escapeHtml(v) {
  return String(v)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function renderRooms() {
  const grid = document.getElementById('roomGrid');
  if (!grid) return;
  const cat = state.currentCategory;
  const filtered = state.rooms.filter((r) => cat === '전체' || r.category === cat);

  grid.innerHTML = filtered.map((room) => {
    const percent = Math.min(100, Math.round((room.joined / room.capacity) * 100));
    const closed = room.status === '마감' || room.joined >= room.capacity;
    const pending = room.status === '승인대기';
    return `
      <article class="room-card">
        <div class="room-head">
          <h3>${escapeHtml(room.title)}</h3>
          <span class="badge ${closed ? 'closed' : pending ? 'urgent' : ''}">${pending ? '승인대기' : closed ? '마감' : '모집중'}</span>
        </div>
        <p class="desc">${escapeHtml(room.desc)}</p>
        <div class="room-meta">
          <span>${escapeHtml(room.category)}</span>
          <span>${escapeHtml(room.target)}</span>
          <span>${escapeHtml(room.schedule)}</span>
          <span>${escapeHtml(room.place)}</span>
        </div>
        <div class="progress-row">신청 현황 <b>${room.joined}/${room.capacity}명</b></div>
        <div class="progress"><span style="width:${percent}%"></span></div>
        <div class="room-foot">
          <small>담당: ${escapeHtml(room.teacher)}</small>
          <button class="apply-btn" ${closed || pending ? 'disabled' : ''} data-room="${room.id}">${pending ? '승인대기' : closed ? '마감' : '신청하기'}</button>
        </div>
      </article>
    `;
  }).join('') || '<div class="feed-card"><h3>해당 분야 방이 없습니다</h3><p>다른 카테고리를 선택해보세요.</p></div>';

  grid.querySelectorAll('.apply-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.room);
      const room = state.rooms.find((r) => r.id === id);
      if (!room || room.joined >= room.capacity) return;
      room.joined += 1;
      renderRooms();
      toast(`${room.title} 신청이 접수되었습니다`);
    });
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

renderRooms();

// ===== 기도제목 등록 =====
document.getElementById('pSubmit')?.addEventListener('click', () => {
  const name = document.getElementById('pName').value.trim() || '익명';
  const type = document.getElementById('pType').value;
  const text = document.getElementById('pText').value.trim();
  if (!text) { toast('기도제목을 입력해주세요'); return; }

  const feed = document.getElementById('prayerFeed');
  const card = document.createElement('article');
  card.className = 'prayer-card';
  const displayName = type === '익명 공개' ? '익명' : escapeHtml(name);
  const tag = type === '교역자에게만 전달' ? '비공개' : type === '익명 공개' ? '익명' : '공개';
  card.innerHTML = `
    <div class="prayer-head">
      <span class="name">${displayName}</span>
      <span class="tag">${tag}</span>
      <span class="when">방금</span>
    </div>
    <p class="body">${escapeHtml(text)}</p>
    <button class="pray-action" type="button">🙏 기도했어요 <b>0</b></button>
  `;
  feed.prepend(card);
  bindPrayActions();
  document.getElementById('pName').value = '';
  document.getElementById('pText').value = '';
  closeModal('prayerModal');
  toast(type === '교역자에게만 전달' ? '교역자에게 비공개로 전달되었습니다' : '기도제목이 등록되었습니다');
});

function bindPrayActions() {
  document.querySelectorAll('.pray-action').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => {
      if (b.classList.contains('done')) { toast('이미 기도에 참여하셨어요'); return; }
      const num = b.querySelector('b');
      num.textContent = Number(num.textContent || 0) + 1;
      b.classList.add('done');
      toast('기도 참여가 기록되었습니다');
    });
  });
}
bindPrayActions();

// ===== 재능나눔방 개설 =====
document.getElementById('rSubmit')?.addEventListener('click', () => {
  const title = document.getElementById('rTitle').value.trim();
  if (!title) { toast('방 제목을 입력해주세요'); return; }
  state.rooms.unshift({
    id: Date.now(),
    title,
    category: document.getElementById('rCat').value,
    target: document.getElementById('rTarget').value,
    teacher: '승인 대기',
    schedule: document.getElementById('rWhen').value.trim() || '일정 협의',
    place: document.getElementById('rPlace').value.trim() || '장소 협의',
    capacity: Number(document.getElementById('rCap').value || 5),
    joined: 0,
    status: '승인대기',
    desc: document.getElementById('rDesc').value.trim() || '관리자 승인 후 공개됩니다.'
  });
  ['rTitle','rWhen','rPlace','rDesc'].forEach((i) => { const e = document.getElementById(i); if (e) e.value = ''; });
  closeModal('roomCreateModal');
  renderRooms();
  toast('개설 신청 접수 — 관리자 승인 후 공개됩니다');
});

// ===== 봉사 신청 =====
document.getElementById('vSubmit')?.addEventListener('click', () => {
  const name = document.getElementById('vName').value.trim();
  if (!name) { toast('이름을 입력해주세요'); return; }
  ['vName','vPhone','vTime'].forEach((i) => { const e = document.getElementById(i); if (e) e.value = ''; });
  closeModal('volunteerModal');
  toast('봉사 신청이 접수되었습니다');
});

// ===== 큰글씨 모드 (localStorage 저장) =====
const easySwitch = document.getElementById('easySwitch');
const savedEasy = localStorage.getItem('easyMode') === '1';
if (savedEasy) { document.body.classList.add('easy'); easySwitch?.classList.add('on'); }

document.getElementById('easyToggle')?.addEventListener('click', () => {
  document.body.classList.toggle('easy');
  const on = document.body.classList.contains('easy');
  easySwitch?.classList.toggle('on', on);
  localStorage.setItem('easyMode', on ? '1' : '0');
  toast(on ? '큰글씨 모드 켜짐' : '기본 글씨 모드');
});

// ===== 알림 토글 =====
document.getElementById('notifToggle')?.addEventListener('click', async () => {
  const sw = document.getElementById('notifSwitch');
  if (!('Notification' in window)) { toast('이 기기는 알림을 지원하지 않아요'); return; }
  if (Notification.permission === 'granted') {
    sw?.classList.toggle('on');
    toast(sw?.classList.contains('on') ? '알림이 켜졌어요' : '알림이 꺼졌어요');
    return;
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    sw?.classList.add('on');
    toast('알림이 켜졌어요');
  } else {
    toast('알림 권한이 거부되었어요');
  }
});

// ===== 그 외 메뉴 동작 =====
document.querySelectorAll('[data-action]').forEach((el) => {
  el.addEventListener('click', () => {
    const a = el.dataset.action;
    if (a === 'login') toast('로그인 기능은 곧 추가될 예정이에요');
    else if (a === 'qr') toast('QR 출석체크는 다음 단계에서 열립니다');
    else if (a === 'install') triggerInstall();
    else if (a === 'visit') toast('심방 요청은 교역자 전용 화면으로 비공개 전달됩니다');
    else if (a === 'newcomer') toast('새가족 등록 화면을 곧 열어드려요');
    else if (a === 'info') toast('교회 위치·연락처는 곧 추가됩니다');
    else if (a === 'contact') toast('교회 연락처: 추후 등록');
    else toast('기능 준비 중이에요');
  });
});

document.getElementById('notifBtn')?.addEventListener('click', () => toast('새 알림이 없습니다'));
document.getElementById('searchBtn')?.addEventListener('click', () => toast('검색은 다음 업데이트에서 추가됩니다'));

// ===== PWA 설치 (beforeinstallprompt) =====
let deferredPrompt = null;
const installBanner = document.getElementById('installBanner');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (localStorage.getItem('installDismissed') !== '1') {
    installBanner?.classList.add('show');
  }
});

document.getElementById('installBtn')?.addEventListener('click', async () => {
  await triggerInstall();
});
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

// ===== 유튜브 임베드 (시작/종료 구간) =====
// 관리자 페이지에서 등록 시 적용 — Phase 1 에는 placeholder 비워둠
function setSermonVideo({ videoId, start, end }) {
  if (!videoId) return;
  const params = new URLSearchParams({ rel: '0', modestbranding: '1' });
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  const iframe = document.getElementById('sermonFrame');
  const ph = document.getElementById('sermonPlaceholder');
  if (iframe) iframe.src = `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
  if (ph) ph.style.display = 'none';
}
window.setSermonVideo = setSermonVideo;

// ===== Service Worker 등록 =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
