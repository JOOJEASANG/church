/* 관리자 페이지 이동 버튼
 * - 사용자 페이지: 상단 검색 아이콘 오른쪽에 관리자 아이콘 버튼 표시
 * - 실제 관리 권한은 /admin/ 페이지의 기존 권한 검사에서 차단
 * - 관리자 페이지: 로그아웃 버튼 왼쪽에 홈페이지 이동 버튼 표시
 * - MutationObserver는 .app-header / .topbar 한정 (성능 보호)
 */
import { auth } from '/firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

const isAdminPage = () => location.pathname === '/admin' || location.pathname.startsWith('/admin/');
const goAdmin = () => { location.href = '/admin/'; };
const goHome = () => { location.href = '/'; };

let observerStarted = false;
let scheduleTimer = null;

function injectStyles() {
  if (document.getElementById('adminShortcutStyles')) return;
  const style = document.createElement('style');
  style.id = 'adminShortcutStyles';
  style.textContent = `
    .admin-icon-shortcut{
      width:38px;height:38px;min-width:38px;border:1px solid var(--line,#ebece8);
      border-radius:999px;background:var(--paper,#fff);display:inline-grid;place-items:center;
      font-size:17px;cursor:pointer;box-shadow:var(--shadow-xs,0 1px 2px rgba(20,22,26,.04));
      color:var(--text,#15171a);
    }
    .admin-icon-shortcut:active{transform:translateY(1px)}
    .admin-home-shortcut{background:var(--bg,#f7f7f4)!important;color:var(--text,#15171a)!important;border:1px solid var(--line,#ebece8)!important;border-radius:8px!important;padding:6px 12px!important;font-size:12px!important;font-weight:700!important;cursor:pointer;white-space:nowrap}
    html[data-admin-page] body,html[data-admin-page] .admin,html[data-admin-page] .layout,html[data-admin-page] .content{padding-bottom:max(12px,env(safe-area-inset-bottom,0px))!important}
    html[data-admin-page] .content::after{content:'';display:block;height:8px}
  `;
  document.head.appendChild(style);
}

function cleanupOldProfileShortcut() {
  document.getElementById('adminProfileShortcut')?.remove();
  document.querySelectorAll('.admin-profile-shortcut-card').forEach((el) => el.remove());
}

function findHeaderActions() {
  let actions = document.querySelector('.app-header .header-actions, header .header-actions, .header-actions');
  if (actions) return actions;
  const row = document.querySelector('.app-header .header-row, header .header-row');
  if (!row) return null;
  actions = document.createElement('div');
  actions.className = 'header-actions';
  row.appendChild(actions);
  return actions;
}

function findSearchButton(actions) {
  if (!actions) return null;
  const candidates = Array.from(actions.querySelectorAll('button,a,[role="button"]'));
  return candidates.find((el) => /검색|search|🔍|⌕/i.test(`${el.textContent || ''} ${el.innerHTML || ''} ${el.id || ''} ${el.className || ''} ${el.getAttribute('aria-label') || ''} ${el.title || ''}`)) || null;
}

function ensureHeaderIcon() {
  if (isAdminPage()) return;
  cleanupOldProfileShortcut();

  let btn = document.getElementById('adminShortcutBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'adminShortcutBtn';
    btn.type = 'button';
    btn.className = 'admin-icon-shortcut';
    btn.title = '관리자 페이지';
    btn.setAttribute('aria-label', '관리자 페이지');
    btn.textContent = '⚙️';
    btn.addEventListener('click', goAdmin);
  }

  const actions = findHeaderActions();
  if (!actions) return;

  const searchBtn = findSearchButton(actions);
  if (searchBtn && searchBtn.nextSibling !== btn) {
    searchBtn.insertAdjacentElement('afterend', btn);
  } else if (!searchBtn && btn.parentElement !== actions) {
    actions.appendChild(btn);
  }
}

function ensureAdminHomeButton() {
  if (!isAdminPage()) return;
  document.documentElement.setAttribute('data-admin-page', 'true');
  cleanupOldProfileShortcut();
  if (document.getElementById('adminHomeShortcutBtn')) return;
  const logout = document.getElementById('logoutBtn');
  const row = logout?.parentElement || document.querySelector('.topbar .row');
  if (!row) return;
  const btn = document.createElement('button');
  btn.id = 'adminHomeShortcutBtn';
  btn.type = 'button';
  btn.className = 'admin-home-shortcut';
  btn.textContent = '홈페이지';
  btn.addEventListener('click', goHome);
  if (logout) row.insertBefore(btn, logout);
  else row.prepend(btn);
}

function removeShortcuts() {
  document.getElementById('adminShortcutBtn')?.remove();
  cleanupOldProfileShortcut();
}

function render(user) {
  injectStyles();
  cleanupOldProfileShortcut();
  if (isAdminPage()) { ensureAdminHomeButton(); return; }
  if (!user) { removeShortcuts(); return; }
  ensureHeaderIcon();
}

function scheduleRender() {
  clearTimeout(scheduleTimer);
  scheduleTimer = setTimeout(() => render(auth.currentUser), 160);
}

function startObserver() {
  if (observerStarted) return;
  observerStarted = true;
  const headerTarget = document.querySelector('.app-header, header, .topbar');
  if (headerTarget) {
    new MutationObserver(scheduleRender).observe(headerTarget, { childList: true, subtree: true });
  }
  // 헤더 자체가 늦게 생성되는 케이스 대비 — body의 직접 자식만 감시
  if (document.body) {
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.matches?.('.app-header, header, .topbar') || n.querySelector?.('.app-header, header, .topbar')) {
            scheduleRender();
            return;
          }
        }
      }
    }).observe(document.body, { childList: true });
  }
}

onAuthStateChanged(auth, render);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { render(auth.currentUser); startObserver(); });
} else {
  render(auth.currentUser);
  startObserver();
}
[400, 1200, 3000].forEach((ms) => setTimeout(() => render(auth.currentUser), ms));
