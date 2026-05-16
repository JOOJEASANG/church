/* PC 전용 헤더 보정
 * - 상단 메뉴 중복 제거: 헤더는 로고/교회명 + 검색/로그인정보만 표시
 * - 사용자 칩(👤 이름) 추가
 * - 설교 영상 썸네일/링크는 desktop-polish.js가 단독 책임
 */
import { auth } from '/firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

let user = null;
let timer = null;

function isAdminPage() { return location.pathname === '/admin' || location.pathname.startsWith('/admin/'); }
if (!isAdminPage()) boot();

function boot() {
  injectStyle();
  onAuthStateChanged(auth, (u) => { user = u; schedule(); });
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

function schedule() { clearTimeout(timer); timer = setTimeout(apply, 160); }
function apply() { addUserChip(); }

function addUserChip() {
  const actions = document.querySelector('.desktop-home-actions');
  if (!actions) return;
  const existing = document.getElementById('desktopUserChip');
  const label = user?.displayName || user?.email || '로그인됨';
  if (existing) {
    if (existing.textContent !== `👤 ${label}`) existing.textContent = `👤 ${label}`;
    return;
  }
  const chip = document.createElement('div');
  chip.id = 'desktopUserChip';
  chip.className = 'desktop-user-chip';
  chip.textContent = `👤 ${label}`;
  const logout = actions.querySelector('[data-desk-logout]');
  if (logout) actions.insertBefore(chip, logout);
  else actions.appendChild(chip);
}
