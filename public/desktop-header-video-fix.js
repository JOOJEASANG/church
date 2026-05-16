/* PC 전용 화면 보정
 * - 상단 메뉴 중복 제거: 헤더는 로고/교회명 + 검색/로그인정보만 표시
 * - 유튜브 URL에서 썸네일 자동 표시
 */
import { db, auth } from '/firebase-init.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

let user = null;
let sermons = [];
let timer = null;

function isAdminPage() { return location.pathname === '/admin' || location.pathname.startsWith('/admin/'); }
if (!isAdminPage()) boot();

function boot() {
  injectStyle();
  onAuthStateChanged(auth, (u) => { user = u; schedule(); });
  listen('sermons');
  listen('sermonHistory');
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
      .desktop-video-main.no-thumb,.desktop-small-video.no-thumb{background:linear-gradient(135deg,#263026,#111)!important;}
      .desktop-video-main.no-thumb::before,.desktop-small-video.no-thumb::before{content:'▶';position:absolute;inset:0;display:grid;place-items:center;font-size:46px;color:rgba(255,255,255,.88);z-index:0;}
      .desktop-small-video.no-thumb::before{font-size:32px;}
    }
  `;
  document.head.appendChild(s);
}

function arr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return Object.entries(v).map(([id, item]) => ({ id, ...(item || {}) }));
}
function listen(path) {
  onValue(ref(db, path), (snap) => {
    const next = arr(snap.val());
    sermons = mergeById([...sermons, ...next]);
    schedule();
  }, () => {});
}
function mergeById(list) {
  const m = new Map();
  list.forEach((x, i) => m.set(x.id || `${x.title || ''}-${x.url || ''}-${i}`, x));
  return Array.from(m.values()).sort((a,b)=>Number(b.timestamp||b.createdAt||b.updatedAt||0)-Number(a.timestamp||a.createdAt||a.updatedAt||0));
}
function first(...vals) { return vals.find((v)=>v!==undefined&&v!==null&&String(v).trim()!=='') || ''; }
function ytId(url) {
  const u = String(url || '');
  let m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  try { const p = new URL(u); const v = p.searchParams.get('v'); if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v; } catch {}
  return '';
}
function sermonUrl(x) { return first(x.youtubeUrl, x.youtube, x.videoUrl, x.video, x.link, x.url, x.sermonUrl); }
function thumbOf(x) {
  const img = first(x.imageUrl, x.imgUrl, x.thumbnail, x.thumb, x.photoUrl, x.coverUrl, x.image);
  if (img) return img;
  const id = ytId(sermonUrl(x));
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
}
function titleOf(x) { return first(x.title, x.name, x.subject, '말씀 영상'); }
function schedule() { clearTimeout(timer); timer = setTimeout(apply, 120); }
function apply() {
  addUserChip();
  applyYoutubeThumbs();
}
function addUserChip() {
  const actions = document.querySelector('.desktop-home-actions');
  if (!actions || document.getElementById('desktopUserChip')) return;
  const chip = document.createElement('div');
  chip.id = 'desktopUserChip';
  chip.className = 'desktop-user-chip';
  const label = user?.displayName || user?.email || '로그인됨';
  chip.textContent = `👤 ${label}`;
  const logout = actions.querySelector('[data-desk-logout]');
  if (logout) actions.insertBefore(chip, logout);
  else actions.appendChild(chip);
}
function ensureImg(card, src) {
  let img = card.querySelector('img');
  if (!src) {
    card.classList.add('no-thumb');
    if (img) img.remove();
    return;
  }
  card.classList.remove('no-thumb');
  if (!img) {
    img = document.createElement('img');
    img.alt = '';
    card.prepend(img);
  }
  if (img.src !== src) img.src = src;
}
function applyYoutubeThumbs() {
  const cards = Array.from(document.querySelectorAll('.desktop-video-main, .desktop-small-video'));
  if (!cards.length) return;
  cards.forEach((card, i) => {
    const s = sermons[i];
    if (!s) { card.classList.add('no-thumb'); return; }
    ensureImg(card, thumbOf(s));
    card.onclick = () => {
      const url = sermonUrl(s);
      if (url) window.open(url, '_blank', 'noopener');
    };
    card.style.cursor = sermonUrl(s) ? 'pointer' : '';
    card.title = titleOf(s);
  });
}
