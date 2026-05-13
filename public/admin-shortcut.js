/* 관리자 계정 이동 버튼
 * - 사용자 페이지: 알림 아이콘 왼쪽에 관리자 아이콘만 표시
 * - 관리자 페이지: 로그아웃 버튼 왼쪽에 홈페이지 이동 버튼 표시
 */
import { db, auth } from '/firebase-init.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

function isAdminPage() {
  return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
}

function injectStyles() {
  if (document.getElementById('adminShortcutStyles')) return;
  const style = document.createElement('style');
  style.id = 'adminShortcutStyles';
  style.textContent = `
    .admin-icon-shortcut {
      width: 36px;
      height: 36px;
      min-width: 36px;
      border: 1px solid var(--line, #ebece8);
      border-radius: 999px;
      background: var(--paper, #fff);
      color: var(--primary-dark, #5d7858);
      display: inline-grid;
      place-items: center;
      font-size: 17px;
      font-weight: 900;
      cursor: pointer;
      box-shadow: var(--shadow-xs, 0 1px 2px rgba(20,22,26,.04));
    }
    .admin-icon-shortcut:active { transform: translateY(1px); }
    .admin-home-shortcut {
      background: var(--bg, #f7f7f4) !important;
      color: var(--text, #15171a) !important;
      border: 1px solid var(--line, #ebece8) !important;
      border-radius: 8px !important;
      padding: 6px 12px !important;
      font-size: 12px !important;
      font-weight: 700 !important;
      cursor: pointer;
      white-space: nowrap;
    }
    html[data-admin-page] body,
    html[data-admin-page] .admin,
    html[data-admin-page] .layout,
    html[data-admin-page] .content {
      padding-bottom: max(34px, env(safe-area-inset-bottom, 0px)) !important;
    }
    html[data-admin-page] .content::after {
      content: '';
      display: block;
      height: 42px;
    }
  `;
  document.head.appendChild(style);
}

function goAdmin() { location.href = '/admin/'; }
function goHome() { location.href = '/'; }

function findHeaderActionArea() {
  return document.querySelector('.app-header .header-row, .app-header .row, header .header-row, header .row, .topbar .row, .header-actions, .app-actions');
}

function findNotificationButton(area) {
  if (!area) return null;
  const buttons = Array.from(area.querySelectorAll('button, a, [role="button"]'));
  return buttons.find((el) => /알림|🔔|bell|notification|notify/i.test(`${el.textContent || ''} ${el.id || ''} ${el.className || ''} ${el.getAttribute('aria-label') || ''} ${el.title || ''}`)) || buttons[0] || null;
}

function ensureUserAdminIcon() {
  if (isAdminPage()) return;
  if (document.getElementById('adminShortcutBtn')) return;
  injectStyles();
  const btn = document.createElement('button');
  btn.id = 'adminShortcutBtn';
  btn.type = 'button';
  btn.className = 'admin-icon-shortcut';
  btn.title = '관리자 페이지';
  btn.setAttribute('aria-label', '관리자 페이지');
  btn.textContent = '⚙️';
  btn.addEventListener('click', goAdmin);

  const area = findHeaderActionArea();
  const notif = findNotificationButton(area);
  if (area && notif) area.insertBefore(btn, notif);
  else if (area) area.prepend(btn);
  else document.body.appendChild(btn);
}

function ensureAdminHomeButton() {
  if (!isAdminPage()) return;
  document.documentElement.setAttribute('data-admin-page', 'true');
  if (document.getElementById('adminHomeShortcutBtn')) return;
  injectStyles();
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

function removeUserAdminIcon() {
  document.getElementById('adminShortcutBtn')?.remove();
}

async function checkAndRender(user) {
  injectStyles();
  if (isAdminPage()) {
    ensureAdminHomeButton();
    return;
  }
  if (!user) {
    removeUserAdminIcon();
    return;
  }
  try {
    const snap = await get(ref(db, `admins/${user.uid}`));
    if (snap.exists()) ensureUserAdminIcon();
    else removeUserAdminIcon();
  } catch (e) {
    console.warn('[admin-shortcut] 관리자 확인 실패:', e.code || e.message);
    removeUserAdminIcon();
  }
}

onAuthStateChanged(auth, (user) => checkAndRender(user));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => checkAndRender(auth.currentUser));
else checkAndRender(auth.currentUser);
[500, 1200, 2500, 4000].forEach((ms) => setTimeout(() => checkAndRender(auth.currentUser), ms));
