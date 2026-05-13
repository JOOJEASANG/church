/* 관리자 계정 이동 버튼
 * - 사용자 페이지: 프로필 영역에 관리자 페이지 버튼 표시
 * - 보조로 헤더/우측 상단 아이콘도 표시
 * - 관리자 페이지: 로그아웃 버튼 왼쪽에 홈페이지 이동 버튼 표시
 */
import { db, auth } from '/firebase-init.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

function isAdminPage() { return location.pathname === '/admin' || location.pathname.startsWith('/admin/'); }
function goAdmin() { location.href = '/admin/'; }
function goHome() { location.href = '/'; }
function rememberAdmin(user) { try { if (user?.uid) localStorage.setItem('namsan_admin_uid', user.uid); } catch {} }
function rememberedAdmin(user) { try { return !!user?.uid && localStorage.getItem('namsan_admin_uid') === user.uid; } catch { return false; } }

function injectStyles() {
  if (document.getElementById('adminShortcutStyles')) return;
  const style = document.createElement('style');
  style.id = 'adminShortcutStyles';
  style.textContent = `
    .admin-icon-shortcut{width:38px;height:38px;min-width:38px;border:1px solid var(--line,#ebece8);border-radius:999px;background:var(--paper,#fff);color:var(--primary-dark,#5d7858);display:inline-grid;place-items:center;font-size:17px;font-weight:900;cursor:pointer;box-shadow:var(--shadow-xs,0 1px 2px rgba(20,22,26,.04))}
    .admin-icon-shortcut.fallback{position:fixed;right:64px;top:calc(env(safe-area-inset-top,0px) + 18px);z-index:999}
    .admin-profile-shortcut{width:100%;min-height:48px;border:0;border-radius:16px;background:var(--primary,#73926d);color:#fff;font-size:15px;font-weight:950;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;box-shadow:0 8px 18px rgba(95,111,82,.22);margin:12px 0}
    .admin-profile-shortcut-card{background:var(--paper,#fff);border:1px solid var(--line,#ebece8);border-radius:18px;padding:16px;margin:14px 0;box-shadow:var(--shadow-sm,0 2px 8px rgba(20,22,26,.05))}
    .admin-profile-shortcut-card .title{font-size:14px;font-weight:900;margin-bottom:4px;color:var(--text,#15171a)}
    .admin-profile-shortcut-card .desc{font-size:12px;color:var(--muted,#767a83);margin-bottom:10px;line-height:1.45}
    .admin-home-shortcut{background:var(--bg,#f7f7f4)!important;color:var(--text,#15171a)!important;border:1px solid var(--line,#ebece8)!important;border-radius:8px!important;padding:6px 12px!important;font-size:12px!important;font-weight:700!important;cursor:pointer;white-space:nowrap}
    html[data-admin-page] body,html[data-admin-page] .admin,html[data-admin-page] .layout,html[data-admin-page] .content{padding-bottom:max(12px,env(safe-area-inset-bottom,0px))!important}
    html[data-admin-page] .content::after{content:'';display:block;height:8px}
  `;
  document.head.appendChild(style);
}

function findHeaderActionArea() {
  return document.querySelector('.header-actions,.app-header .header-actions,.app-header .header-row,.app-header .row,header .header-actions,header .header-row,header .row,.app-actions');
}
function findNotificationButton(area) {
  if (!area) return null;
  const buttons = Array.from(area.querySelectorAll('button,a,[role="button"]'));
  return buttons.find((el) => /알림|🔔|bell|notification|notify/i.test(`${el.textContent||''} ${el.id||''} ${el.className||''} ${el.getAttribute('aria-label')||''} ${el.title||''}`)) || buttons[0] || null;
}
function ensureHeaderIcon() {
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
  const area = findHeaderActionArea();
  const notif = findNotificationButton(area);
  if (area && notif && btn.parentElement !== area) { btn.classList.remove('fallback'); area.insertBefore(btn, notif); }
  else if (area && !btn.parentElement) { btn.classList.remove('fallback'); area.prepend(btn); }
  else if (!btn.parentElement) { btn.classList.add('fallback'); document.body.appendChild(btn); }
}

function findProfileArea() {
  const logout = Array.from(document.querySelectorAll('button,a,[role="button"]')).find((el) => /로그아웃|logout/i.test(el.textContent || el.id || el.className || ''));
  if (logout) return logout.closest('.card,.panel,section,.tab-pane,.profile-card,div') || logout.parentElement;
  const byId = document.querySelector('#profile,#profilePane,#pane-profile,#tab-profile,[data-pane="profile"],[data-tab="profile"],.profile-card');
  if (byId) return byId;
  const panes = Array.from(document.querySelectorAll('.tab-pane,section,.panel,.card'));
  return panes.find((el) => /내\s*정보|프로필|계정|설정/.test(el.textContent || '')) || document.querySelector('.main');
}
function ensureProfileButton() {
  if (document.getElementById('adminProfileShortcut')) return;
  const area = findProfileArea();
  if (!area) return;
  const card = document.createElement('div');
  card.id = 'adminProfileShortcut';
  card.className = 'admin-profile-shortcut-card';
  card.innerHTML = `<div class="title">관리자 계정</div><div class="desc">교회 앱 관리 화면으로 이동할 수 있습니다.</div><button type="button" class="admin-profile-shortcut">⚙️ 관리자 페이지로 이동</button>`;
  card.querySelector('button').addEventListener('click', goAdmin);
  const logout = Array.from(area.querySelectorAll('button,a,[role="button"]')).find((el) => /로그아웃|logout/i.test(el.textContent || el.id || el.className || ''));
  if (logout?.parentElement === area) area.insertBefore(card, logout);
  else area.appendChild(card);
}
function ensureUserAdminShortcut() { if (isAdminPage()) return; injectStyles(); ensureHeaderIcon(); ensureProfileButton(); }
function removeUserAdminShortcut() { document.getElementById('adminShortcutBtn')?.remove(); document.getElementById('adminProfileShortcut')?.remove(); }

async function ensureAdminHomeButton(user) {
  if (!isAdminPage()) return;
  document.documentElement.setAttribute('data-admin-page','true');
  injectStyles();
  if (user) rememberAdmin(user);
  if (document.getElementById('adminHomeShortcutBtn')) return;
  const logout = document.getElementById('logoutBtn');
  const row = logout?.parentElement || document.querySelector('.topbar .row');
  if (!row) return;
  const btn = document.createElement('button');
  btn.id = 'adminHomeShortcutBtn'; btn.type = 'button'; btn.className = 'admin-home-shortcut'; btn.textContent = '홈페이지'; btn.addEventListener('click', goHome);
  if (logout) row.insertBefore(btn, logout); else row.prepend(btn);
}

async function isAdminUser(user) {
  if (!user) return false;
  if (rememberedAdmin(user)) return true;
  try {
    const snap = await get(ref(db, `admins/${user.uid}`));
    if (snap.exists()) { rememberAdmin(user); return true; }
  } catch (e) { console.warn('[admin-shortcut] 관리자 확인 실패:', e.code || e.message); }
  return false;
}
async function checkAndRender(user) {
  injectStyles();
  if (isAdminPage()) { await ensureAdminHomeButton(user); return; }
  if (await isAdminUser(user)) ensureUserAdminShortcut();
  else removeUserAdminShortcut();
}

onAuthStateChanged(auth, (user) => checkAndRender(user));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => checkAndRender(auth.currentUser));
else checkAndRender(auth.currentUser);
[500,1200,2500,4000,6500,9000].forEach((ms) => setTimeout(() => checkAndRender(auth.currentUser), ms));
new MutationObserver(() => { if (!isAdminPage() && auth.currentUser) checkAndRender(auth.currentUser); }).observe(document.documentElement, { childList:true, subtree:true });
