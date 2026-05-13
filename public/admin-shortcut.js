/* 관리자 페이지 이동 버튼
 * - 사용자 페이지: 로그인 상태면 프로필/내정보 영역에 관리자 페이지 이동 버튼 표시
 * - 실제 관리 권한은 /admin/ 페이지의 기존 권한 검사에서 차단
 * - 관리자 페이지: 로그아웃 버튼 왼쪽에 홈페이지 이동 버튼 표시
 */
import { auth } from '/firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

const isAdminPage = () => location.pathname === '/admin' || location.pathname.startsWith('/admin/');
const goAdmin = () => { location.href = '/admin/'; };
const goHome = () => { location.href = '/'; };

function injectStyles() {
  if (document.getElementById('adminShortcutStyles')) return;
  const style = document.createElement('style');
  style.id = 'adminShortcutStyles';
  style.textContent = `
    .admin-profile-shortcut-card{background:var(--paper,#fff);border:1px solid var(--line,#ebece8);border-radius:18px;padding:16px;margin:14px 0;box-shadow:var(--shadow-sm,0 2px 8px rgba(20,22,26,.05))}
    .admin-profile-shortcut-card .title{font-size:14px;font-weight:900;margin-bottom:4px;color:var(--text,#15171a)}
    .admin-profile-shortcut-card .desc{font-size:12px;color:var(--muted,#767a83);margin-bottom:10px;line-height:1.45}
    .admin-profile-shortcut{width:100%;min-height:48px;border:0;border-radius:16px;background:var(--primary,#73926d);color:#fff;font-size:15px;font-weight:950;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;box-shadow:0 8px 18px rgba(95,111,82,.22)}
    .admin-icon-shortcut{width:38px;height:38px;min-width:38px;border:1px solid var(--line,#ebece8);border-radius:999px;background:var(--paper,#fff);display:inline-grid;place-items:center;font-size:17px;cursor:pointer;box-shadow:var(--shadow-xs,0 1px 2px rgba(20,22,26,.04))}
    .admin-icon-shortcut.fallback{position:fixed;right:64px;top:calc(env(safe-area-inset-top,0px) + 18px);z-index:999}
    .admin-home-shortcut{background:var(--bg,#f7f7f4)!important;color:var(--text,#15171a)!important;border:1px solid var(--line,#ebece8)!important;border-radius:8px!important;padding:6px 12px!important;font-size:12px!important;font-weight:700!important;cursor:pointer;white-space:nowrap}
    html[data-admin-page] body,html[data-admin-page] .admin,html[data-admin-page] .layout,html[data-admin-page] .content{padding-bottom:max(12px,env(safe-area-inset-bottom,0px))!important}
    html[data-admin-page] .content::after{content:'';display:block;height:8px}
  `;
  document.head.appendChild(style);
}

function findHeaderArea() {
  return document.querySelector('.header-actions,.app-header .header-actions,.app-header .header-row,.app-header .row,header .header-actions,header .header-row,header .row,.app-actions');
}

function ensureHeaderIcon() {
  if (isAdminPage()) return;
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
  const area = findHeaderArea();
  if (area) {
    btn.classList.remove('fallback');
    if (btn.parentElement !== area) area.prepend(btn);
  } else if (!btn.parentElement) {
    btn.classList.add('fallback');
    document.body.appendChild(btn);
  }
}

function findProfileArea() {
  const logout = Array.from(document.querySelectorAll('button,a,[role="button"]')).find((el) => /로그아웃|logout/i.test(`${el.textContent || ''} ${el.id || ''} ${el.className || ''}`));
  if (logout) return logout.closest('.card,.panel,section,.tab-pane,.profile-card,div') || logout.parentElement;
  const direct = document.querySelector('#profile,#profilePane,#pane-profile,#tab-profile,[data-pane="profile"],[data-tab="profile"],.profile-card');
  if (direct) return direct;
  const likely = Array.from(document.querySelectorAll('.tab-pane,section,.panel,.card,main,.main')).find((el) => /내\s*정보|프로필|계정|설정|로그아웃/.test(el.textContent || ''));
  return likely || document.querySelector('.main') || document.body;
}

function ensureProfileButton() {
  if (isAdminPage() || document.getElementById('adminProfileShortcut')) return;
  const area = findProfileArea();
  if (!area) return;
  const card = document.createElement('div');
  card.id = 'adminProfileShortcut';
  card.className = 'admin-profile-shortcut-card';
  card.innerHTML = `<div class="title">관리자 페이지</div><div class="desc">관리 권한이 있는 계정은 교회 앱 관리 화면으로 이동할 수 있습니다.</div><button type="button" class="admin-profile-shortcut">⚙️ 관리자 페이지로 이동</button>`;
  card.querySelector('button').addEventListener('click', goAdmin);
  const logout = Array.from(area.querySelectorAll('button,a,[role="button"]')).find((el) => /로그아웃|logout/i.test(`${el.textContent || ''} ${el.id || ''} ${el.className || ''}`));
  if (logout?.parentElement === area) area.insertBefore(card, logout);
  else area.appendChild(card);
}

function ensureAdminHomeButton() {
  if (!isAdminPage()) return;
  document.documentElement.setAttribute('data-admin-page', 'true');
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
  document.getElementById('adminProfileShortcut')?.remove();
}

function render(user) {
  injectStyles();
  if (isAdminPage()) {
    ensureAdminHomeButton();
    return;
  }
  if (!user) {
    removeShortcuts();
    return;
  }
  ensureHeaderIcon();
  ensureProfileButton();
}

onAuthStateChanged(auth, render);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => render(auth.currentUser));
else render(auth.currentUser);
[400, 1000, 2000, 4000, 7000, 10000].forEach((ms) => setTimeout(() => render(auth.currentUser), ms));
new MutationObserver(() => render(auth.currentUser)).observe(document.documentElement, { childList: true, subtree: true });
