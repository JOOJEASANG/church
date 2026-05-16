/* PC 전용 헤더/홈 레이아웃 보정
 * - 상단 메뉴 중복 제거: 헤더는 로고/교회명 + 검색/로그인정보만 표시
 * - 최근 1주 영상은 오늘의 말씀 아래에 유튜브 iframe으로 재생 가능하게 표시
 * - 교회소식 + 재능나눔은 2단 배치
 */
import { db, auth } from '/firebase-init.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

let user = null;
let sermons = [];
let announcements = [];
let rooms = [];
let timer = null;
let bound = false;

function isAdminPage() { return location.pathname === '/admin' || location.pathname.startsWith('/admin/'); }
if (!isAdminPage()) boot();

function boot() {
  injectStyle();
  onAuthStateChanged(auth, (u) => { user = u; if (u) bindData(); schedule(); });
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
}

function injectStyle() {
  if (document.getElementById('desktopHeaderVideoFixStyle')) return;
  const s = document.createElement('style');
  s.id = 'desktopHeaderVideoFixStyle';
  s.textContent = `
    @media (min-width:980px){
      body.desktop-site-ready .desktop-home-nav{display:none!important;}
      body.desktop-site-ready .desktop-home-top{justify-content:space-between!important;}
      body.desktop-site-ready .desktop-home-brand{min-width:auto!important;}
      body.desktop-site-ready .desktop-home-actions{min-width:auto!important;margin-left:auto!important;}
      .desktop-user-chip{height:42px;display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(20,22,26,.12);background:#fff;border-radius:999px;padding:0 13px;font-size:13px;font-weight:850;color:#30342f;max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      body.desktop-site-ready #desk-word{display:none!important;}
      body.desktop-site-ready #desk-rooms{display:none!important;}
      body.desktop-site-ready .desktop-right-stack .desktop-mini-news{display:none!important;}
      .desktop-latest-video{background:#fff;border:1px solid rgba(20,22,26,.09);border-radius:20px;box-shadow:0 8px 22px rgba(20,22,26,.05);overflow:hidden;}
      .desktop-latest-video .head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 12px;gap:12px;}
      .desktop-latest-video .head h2{margin:0;font-size:19px;font-weight:950;letter-spacing:-.6px;color:#20241f;}
      .desktop-latest-video .head span{font-size:12px;font-weight:850;color:#777;white-space:nowrap;}
      .desktop-video-player{position:relative;aspect-ratio:16/9;background:linear-gradient(135deg,#263026,#111);overflow:hidden;}
      .desktop-video-player iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;}
      .desktop-video-fallback{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#fff;text-align:center;padding:22px;background:linear-gradient(135deg,#263026,#111);}
      .desktop-video-fallback .play{width:58px;height:58px;border-radius:999px;background:rgba(255,255,255,.16);display:grid;place-items:center;font-size:26px;}
      .desktop-video-fallback button{border:0;border-radius:999px;background:#fff;color:#111;font-weight:900;padding:10px 16px;cursor:pointer;}
      .desktop-video-info{padding:16px 20px 20px;}
      .desktop-video-info h3{margin:0;font-size:16px;font-weight:950;line-height:1.45;color:#222;}
      .desktop-video-info p{margin:7px 0 0;font-size:12.5px;color:#777;font-weight:800;}
      .desktop-news-rooms{max-width:1180px;margin:0 auto 44px;padding:0 24px;display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start;}
      .desktop-news-rooms .desktop-card-grid{grid-template-columns:1fr!important;gap:12px!important;}
      .desktop-news-rooms .desktop-news-card{min-height:auto!important;display:flex!important;flex-direction:row!important;align-items:stretch!important;}
      .desktop-news-rooms .desktop-news-card img{width:112px!important;height:auto!important;min-height:112px!important;flex:0 0 112px!important;}
      .desktop-news-rooms .desktop-news-body{padding:14px 16px!important;min-width:0;}
      .desktop-news-rooms .desktop-news-body h3{font-size:15px!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
      .desktop-news-rooms .desktop-news-body p{font-size:12.5px!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
      .desktop-news-rooms .desktop-date{margin-top:8px!important;}
      @media (max-width:1160px){.desktop-news-rooms{grid-template-columns:1fr;}}
    }
  `;
  document.head.appendChild(s);
}

function arr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return Object.entries(v).map(([id, item]) => ({ id, ...(item || {}) }));
}
function first(...vals) { return vals.find((v)=>v!==undefined&&v!==null&&String(v).trim()!=='') || ''; }
function sortRecent(list) { return [...list].sort((a,b)=>dateValue(b)-dateValue(a)); }
function dateValue(x) {
  const raw = first(x.timestamp, x.createdAt, x.updatedAt, x.date, x.publishedAt, x.sermonDate);
  if (!raw) return 0;
  if (typeof raw === 'number') return raw;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}
function dateText(x) {
  const t = dateValue(x);
  if (!t) return '';
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}
function bindData() {
  if (bound) return;
  bound = true;
  listen('sermons', (v) => { sermons = sortRecent(merge([...sermons, ...arr(v)])); });
  listen('sermonHistory', (v) => { sermons = sortRecent(merge([...sermons, ...arr(v)])); });
  listen('announcements', (v) => { announcements = sortRecent(arr(v)); });
  listen('rooms', (v) => { rooms = sortRecent(arr(v).filter(r => r.approved !== false)); });
}
function listen(path, cb) {
  onValue(ref(db, path), (snap) => { cb(snap.val()); schedule(); }, () => {});
}
function merge(list) {
  const m = new Map();
  list.forEach((x, i) => m.set(x.id || first(x.youtubeUrl, x.videoUrl, x.url, x.link, x.title, i), x));
  return Array.from(m.values());
}
function ytId(url) {
  const u = String(url || '');
  let m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  try { const p = new URL(u); const v = p.searchParams.get('v'); if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v; } catch {}
  return '';
}
function sermonUrl(x) { return first(x.youtubeUrl, x.youtube, x.videoUrl, x.video, x.link, x.url, x.sermonUrl, x.embedUrl); }
function titleOf(x, fallback='제목 없음') { return first(x.title, x.name, x.subject, x.ref, fallback); }
function bodyOf(x) { return first(x.body, x.text, x.desc, x.description, x.content, ''); }
function imgOf(x) { return first(x.imageUrl, x.imgUrl, x.thumbnail, x.thumb, x.photoUrl, x.coverUrl, x.image); }
function latestWeekSermon() {
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const dated = sermons.filter(s => dateValue(s) && now - dateValue(s) <= week && now - dateValue(s) >= -week);
  return (dated[0] || sermons[0] || null);
}

function schedule() { clearTimeout(timer); timer = setTimeout(apply, 180); }
function apply() {
  if (!document.body.classList.contains('desktop-site-ready')) return;
  addUserChip();
  renderLatestVideo();
  renderNewsRooms();
}

function addUserChip() {
  const actions = document.querySelector('.desktop-home-actions');
  if (!actions) return;
  const label = user?.displayName || user?.email || '로그인됨';
  let chip = document.getElementById('desktopUserChip');
  if (!chip) {
    chip = document.createElement('div');
    chip.id = 'desktopUserChip';
    chip.className = 'desktop-user-chip';
    const logout = actions.querySelector('[data-desk-logout]');
    if (logout) actions.insertBefore(chip, logout);
    else actions.appendChild(chip);
  }
  chip.textContent = `👤 ${label}`;
}

function renderLatestVideo() {
  const stack = document.querySelector('.desktop-right-stack');
  if (!stack) return;
  let box = document.getElementById('desktopLatestVideo');
  if (!box) {
    box = document.createElement('div');
    box.id = 'desktopLatestVideo';
    box.className = 'desktop-latest-video';
    const verse = stack.querySelector('.desktop-verse');
    if (verse) verse.insertAdjacentElement('afterend', box);
    else stack.prepend(box);
  }
  const item = latestWeekSermon();
  if (!item) {
    box.innerHTML = `<div class="head"><h2>최근 말씀 영상</h2><span>최근 1주</span></div><div class="desktop-empty">최근 등록된 영상이 없습니다.</div>`;
    return;
  }
  const url = sermonUrl(item);
  const id = ytId(url);
  const title = titleOf(item, '최근 말씀 영상');
  const d = dateText(item);
  box.innerHTML = `
    <div class="head"><h2>최근 말씀 영상</h2><span>최근 1주</span></div>
    <div class="desktop-video-player">
      ${id ? `<iframe src="https://www.youtube.com/embed/${id}" title="${esc(title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>` : `<div class="desktop-video-fallback"><div class="play">▶</div><div>유튜브 미리보기를 만들 수 없는 주소입니다.</div>${url ? `<button data-open-video>영상 열기</button>` : ''}</div>`}
    </div>
    <div class="desktop-video-info"><h3>${esc(title)}</h3>${d ? `<p>${esc(d)}</p>` : ''}</div>`;
  box.querySelector('[data-open-video]')?.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
}

function cardHtml(list, emptyLabel) {
  if (!list.length) return `<div class="desktop-empty">등록된 ${esc(emptyLabel)} 데이터가 없습니다.</div>`;
  return `<div class="desktop-card-grid">${list.slice(0, 3).map(x => `<article class="desktop-card desktop-news-card">${imgOf(x) ? `<img src="${esc(imgOf(x))}" alt="">` : ''}<div class="desktop-news-body"><h3>${esc(titleOf(x, emptyLabel))}</h3>${bodyOf(x) ? `<p>${esc(bodyOf(x)).slice(0,90)}</p>` : ''}<div class="desktop-date">${esc(dateText(x))}</div></div></article>`).join('')}</div>`;
}
function renderNewsRooms() {
  const service = document.getElementById('desk-service');
  if (!service) return;
  let section = document.getElementById('desktopNewsRooms');
  if (!section) {
    section = document.createElement('section');
    section.id = 'desktopNewsRooms';
    section.className = 'desktop-news-rooms';
    service.insertAdjacentElement('afterend', section);
  }
  section.innerHTML = `
    <div class="desktop-card desktop-card-pad"><div class="desktop-section-head"><h2>교회 소식</h2><button class="desktop-more" data-open-app="home">더보기 ›</button></div>${cardHtml(announcements, '공지사항')}</div>
    <div class="desktop-card desktop-card-pad"><div class="desktop-section-head"><h2>재능나눔</h2><button class="desktop-more" data-open-app="community">더보기 ›</button></div>${cardHtml(rooms, '재능나눔')}</div>`;
  section.querySelectorAll('[data-open-app]').forEach(btn => btn.onclick = () => openAppTab(btn.dataset.openApp));
}
function openAppTab(tab) {
  document.body.classList.remove('desktop-site-ready');
  document.querySelector(`.tabbar-item[data-tab="${tab}"]`)?.click();
  setTimeout(() => window.scrollTo({ top:0, behavior:'smooth' }), 50);
}
function esc(v) { return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
