/* 관리자 계정 사용자페이지 접속 시 관리자페이지 이동 버튼 표시 */
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
    .admin-shortcut-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 36px;
      padding: 8px 13px;
      border: 0;
      border-radius: 999px;
      background: var(--primary, #73926d);
      color: #fff;
      font-size: 13px;
      font-weight: 900;
      text-decoration: none;
      box-shadow: 0 8px 18px rgba(95, 111, 82, .22);
      cursor: pointer;
      white-space: nowrap;
    }
    .admin-shortcut-floating {
      position: fixed;
      right: 16px;
      bottom: calc(76px + env(safe-area-inset-bottom, 0px));
      z-index: 900;
    }
    @media (min-width: 761px) {
      .admin-shortcut-floating {
        right: 24px;
        bottom: 24px;
      }
    }
  `;
  document.head.appendChild(style);
}

function goAdmin() {
  location.href = '/admin/';
}

function ensureAdminShortcut() {
  if (isAdminPage()) return;
  if (document.getElementById('adminShortcutBtn')) return;
  injectStyles();

  const btn = document.createElement('button');
  btn.id = 'adminShortcutBtn';
  btn.type = 'button';
  btn.className = 'admin-shortcut-btn admin-shortcut-floating';
  btn.textContent = '관리자 페이지';
  btn.addEventListener('click', goAdmin);
  document.body.appendChild(btn);

  const profileArea = document.querySelector('#profileName')?.closest('.profile-card, .card, .panel, section, div');
  if (profileArea && !profileArea.querySelector('[data-admin-shortcut-inline]')) {
    const inline = document.createElement('button');
    inline.type = 'button';
    inline.className = 'admin-shortcut-btn';
    inline.dataset.adminShortcutInline = 'true';
    inline.textContent = '관리자 페이지로 이동';
    inline.style.marginTop = '10px';
    inline.addEventListener('click', goAdmin);
    profileArea.appendChild(inline);
  }
}

function removeAdminShortcut() {
  document.getElementById('adminShortcutBtn')?.remove();
  document.querySelectorAll('[data-admin-shortcut-inline]').forEach((el) => el.remove());
}

async function checkAndRender(user) {
  if (!user || isAdminPage()) {
    removeAdminShortcut();
    return;
  }
  try {
    const snap = await get(ref(db, `admins/${user.uid}`));
    if (snap.exists()) ensureAdminShortcut();
    else removeAdminShortcut();
  } catch (e) {
    console.warn('[admin-shortcut] 관리자 확인 실패:', e.code || e.message);
    removeAdminShortcut();
  }
}

onAuthStateChanged(auth, (user) => checkAndRender(user));
[500, 1200, 2500, 4000].forEach((ms) => setTimeout(() => checkAndRender(auth.currentUser), ms));
