/* 오늘의 말씀 날짜 갱신 보정 */
import { db } from '/firebase-init.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

let verses = [];
let lastKey = '';
let timer = null;

function dateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function seed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
function idx(n) {
  if (!n) return 0;
  let x = (seed() ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  x = (x ^ (x >>> 16)) >>> 0;
  return x % n;
}
function pick() {
  const active = verses
    .filter((v) => v && v.text && v.active !== false)
    .sort((a, b) => String(a.ref || '').localeCompare(String(b.ref || '')) || String(a.id || '').localeCompare(String(b.id || '')));
  return active.length ? active[idx(active.length)] : null;
}
function apply() {
  const v = pick();
  if (!v) return false;
  const text = document.querySelector('.verse-card .verse-text, #dailyVerseText, [data-daily-verse-text]');
  const verseRef = document.querySelector('.verse-card .verse-ref, #dailyVerseRef, [data-daily-verse-ref]');
  if (!text || !verseRef) return false;
  text.textContent = v.text;
  verseRef.textContent = v.ref || '오늘의 말씀';
  window.__namsanTodayVerse = { id: v.id || '', ref: v.ref || '오늘의 말씀', text: v.text || '', date: dateKey(), source: 'managedDailyVerse' };
  document.dispatchEvent(new CustomEvent('namsan:todayVerseChanged', { detail: window.__namsanTodayVerse }));
  return true;
}
function scheduleApply() {
  apply();
  [250, 800, 1600, 3000].forEach((ms) => setTimeout(apply, ms));
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
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick);
else tick();
