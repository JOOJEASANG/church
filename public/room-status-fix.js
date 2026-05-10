/* =============================================================
 * 재능나눔방 승인 상태 보정
 * - 승인된 방인데 status 문구가 '승인대기'로 남는 문제 보정
 * - 관리자 화면에서는 approved === true 인 방만 DB status를 '모집중'으로 정리
 * - 사용자 화면에서는 approved === true 인 방 카드의 표시 문구만 '모집중'으로 보정
 * ============================================================= */

import { db, auth } from '/firebase-init.js';
import { ref, onValue, update, get } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

let roomsCache = [];
let isAdmin = false;
let normalizeRunning = false;
let observerStarted = false;
let patchTimer = null;

function isAdminPage() {
  return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
}

function normalizeText(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

function isApprovedRoom(room) {
  return room && room.approved === true;
}

function hasPendingStatus(room) {
  const status = normalizeText(room?.status);
  return !status || /승인\s*대기|대기중|검토중/.test(status);
}

async function checkAdmin(user) {
  if (!user) {
    isAdmin = false;
    return;
  }
  try {
    const snap = await get(ref(db, `admins/${user.uid}`));
    isAdmin = snap.exists();
  } catch {
    isAdmin = false;
  }
}

async function normalizeApprovedRoomStatus() {
  if (!isAdminPage() || !isAdmin || normalizeRunning) return;
  const targets = roomsCache.filter((room) => room.id && isApprovedRoom(room) && hasPendingStatus(room));
  if (!targets.length) return;

  normalizeRunning = true;
  try {
    for (const room of targets) {
      await update(ref(db, `rooms/${room.id}`), {
        approved: true,
        status: '모집중',
        approvedAt: room.approvedAt || Date.now(),
        updatedAt: Date.now()
      });
    }
  } catch (e) {
    console.warn('[room-status-fix] 승인 상태 보정 실패:', e.code || e.message);
  } finally {
    normalizeRunning = false;
  }
}

function replaceOwnTextNodes(el, fromRe, toText) {
  let changed = false;
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && fromRe.test(node.textContent || '')) {
      node.textContent = (node.textContent || '').replace(fromRe, toText);
      changed = true;
    }
  });
  return changed;
}

function patchVisibleRoomStatuses() {
  if (isAdminPage()) return;
  const approvedRooms = roomsCache.filter((room) => isApprovedRoom(room));
  if (!approvedRooms.length) return;

  const pendingRe = /승인\s*대기|대기중|검토중/g;

  approvedRooms.forEach((room) => {
    const title = normalizeText(room.title);
    if (!title) return;

    document.querySelectorAll('article, section, li, .card, .room-card, .talent-card, .post-card, .panel, div').forEach((el) => {
      const text = normalizeText(el.textContent);
      if (!text || !text.includes(title) || !pendingRe.test(text)) return;
      if (text.length > 1600) return;

      replaceOwnTextNodes(el, /승인\s*대기|대기중|검토중/g, '모집중');
      el.querySelectorAll('*').forEach((child) => {
        replaceOwnTextNodes(child, /승인\s*대기|대기중|검토중/g, '모집중');
      });
    });
  });
}

function schedulePatch() {
  clearTimeout(patchTimer);
  patchTimer = setTimeout(patchVisibleRoomStatuses, 120);
}

function startDomObserver() {
  if (observerStarted || isAdminPage()) return;
  observerStarted = true;
  const boot = () => {
    if (!document.body) return;
    new MutationObserver(schedulePatch).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
    schedulePatch();
  };
  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot);
}

function startRoomsListener() {
  onValue(ref(db, 'rooms'), (snap) => {
    const rooms = [];
    snap.forEach((c) => rooms.push({ id: c.key, ...c.val() }));
    roomsCache = rooms;
    normalizeApprovedRoomStatus();
    schedulePatch();
  }, (err) => console.warn('[room-status-fix] rooms 읽기 실패:', err.code || err.message));
}

onAuthStateChanged(auth, async (user) => {
  await checkAdmin(user);
  normalizeApprovedRoomStatus();
});

startRoomsListener();
startDomObserver();
