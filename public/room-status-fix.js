/* =============================================================
 * 재능나눔방 승인 상태 보정 (성능 최적화 버전)
 * - 관리자: approved === true 인 방의 DB status를 '모집중'으로 정리
 * - 사용자: 카드 셀렉터 한정으로 DOM 텍스트 보정 (div 전수 순회 제거)
 * ============================================================= */

import { db, auth, isAdminPage } from '/firebase-init.js';
import { ref, onValue, update, get } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

const CARD_SELECTOR = 'article, .card, .room-card, .talent-card, .post-card, [data-room-card], [data-talent-card]';

let roomsCache = [];
let isAdmin = false;
let normalizeRunning = false;
let observerStarted = false;
let patchTimer = null;
function normalizeText(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function isApprovedRoom(room) { return room && room.approved === true; }
function hasPendingStatus(room) {
  const status = normalizeText(room?.status);
  return !status || /승인\s*대기|대기중|검토중/.test(status);
}

async function checkAdmin(user) {
  if (!user) { isAdmin = false; return; }
  try {
    const snap = await get(ref(db, `admins/${user.uid}`));
    isAdmin = snap.exists();
  } catch { isAdmin = false; }
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
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && fromRe.test(node.textContent || '')) {
      node.textContent = (node.textContent || '').replace(fromRe, toText);
    }
  });
}

function patchVisibleRoomStatuses() {
  if (isAdminPage()) return;
  const approvedRooms = roomsCache.filter((room) => isApprovedRoom(room));
  if (!approvedRooms.length) return;

  const cards = document.querySelectorAll(CARD_SELECTOR);
  if (!cards.length) return;

  const pendingTestRe = /승인\s*대기|대기중|검토중/;
  const pendingReplaceRe = /승인\s*대기|대기중|검토중/g;
  const approvedTitles = approvedRooms.map((r) => normalizeText(r.title)).filter(Boolean);
  if (!approvedTitles.length) return;

  cards.forEach((card) => {
    const text = normalizeText(card.textContent);
    if (!text || text.length > 1600) return;
    if (!pendingTestRe.test(text)) return;
    if (!approvedTitles.some((title) => text.includes(title))) return;
    replaceOwnTextNodes(card, pendingReplaceRe, '모집중');
    card.querySelectorAll('span, b, strong, em, p, h1, h2, h3, h4').forEach((child) => {
      replaceOwnTextNodes(child, pendingReplaceRe, '모집중');
    });
  });
}

function schedulePatch() {
  clearTimeout(patchTimer);
  patchTimer = setTimeout(patchVisibleRoomStatuses, 200);
}

function startDomObserver() {
  if (observerStarted || isAdminPage()) return;
  observerStarted = true;
  const boot = () => {
    if (!document.body) return;
    new MutationObserver(schedulePatch).observe(document.body, {
      childList: true,
      subtree: true
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

if (!isAdminPage()) startDomObserver();
startRoomsListener();
