/* 오늘의 말씀 날짜 갱신 보정
 * - 등록된 active 말씀을 고정 셔플 순서로 정렬
 * - 날짜 번호(day number)로 하루에 하나씩 다음 말씀 선택
 * - 말씀이 2개 이상이면 매일 이전 날과 다른 말씀으로 이동
 */
import { db } from '/firebase-init.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

let verses = [];
let lastKey = '';
let timer = null;
let observer = null;
let applying = false;

function todayDate() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function dateKey() {
  const d = todayDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayNo() {
  return Math.floor(todayDate().getTime() / 86400000);
}
function hashText(v) {
  const s = String(v || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function activeVerses() {
  return verses
    .filter((v) => v && v.text && v.active !== false)
    .sort((a, b) => {
      const ha = hashText(`${a.id || ''}|${a.ref || ''}|${a.text || ''}`);
      const hb = hashText(`${b.id || ''}|${b.ref || ''}|${b.text || ''}`);
      return ha - hb || String(a.id || '').localeCompare(String(b.id || ''));
    });
}
function pick() {
  const active = activeVerses();
  if (!active.length) return null;
  return active[dayNo() % active.length];
}
function getEls() {
  return {
    text: document.querySelector('.verse-card .verse-text, #dailyVerseText, [data-daily-verse-text]'),
    ref: document.querySelector('.verse-card .verse-ref, #dailyVerseRef, [data-daily-verse-ref]'),
    label: document.querySelector('.verse-card .verse-label')
  };
}
function apply() {
  const v = pick();
  if (!v) return false;
  const els = getEls();
  if (!els.text || !els.ref) return false;
  const refText = v.ref || '오늘의 말씀';
  if (els.text.textContent === v.text && els.ref.textContent === refText) return true;
  applying = true;
  els.text.textContent = v.text;
  els.ref.textContent = refText;
  if (els.label) els.label.textContent = 'TODAY VERSE';
  window.__namsanTodayVerse = { id: v.id || '', ref: refText, text: v.text || '', date: dateKey(), source: 'managedDailyVerse' };
  document.dispatchEvent(new CustomEvent('namsan:todayVerseChanged', { detail: window.__namsanTodayVerse }));
  requestAnimationFrame(() => { applying = false; });
  return true;
}
function observeCard() {
  if (observer) return;
  const card = document.querySelector('.verse-card');
  if (!card) return;
  observer = new MutationObserver(() => {
    if (applying) return;
    requestAnimationFrame(apply);
  });
  observer.observe(card, { childList: true, subtree: true, characterData: true });
}
function scheduleApply() {
  apply();
  observeCard();
  [120, 350, 900, 1800, 3200].forEach((ms) => setTimeout(() => { apply(); observeCard(); }, ms));
}
function tick() {
  const key = dateKey();
  if (key !== lastKey) {
    lastKey = key;
    scheduleApply();
  } else {
    apply();
  }
  clearTimeout(timer);
  timer = setTimeout(tick, 5 * 60 * 1000);
}

onValue(ref(db, 'dailyVerses'), (snap) => {
  const arr = [];
  snap.forEach((c) => arr.push({ id: c.key, ...c.val() }));
  verses = arr;
  lastKey = dateKey();
  scheduleApply();
});

document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
window.addEventListener('focus', tick);
document.addEventListener('namsan:forceTodayVerseRefresh', scheduleApply);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick);
else tick();
