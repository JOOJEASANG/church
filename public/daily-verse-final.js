/* 오늘의 말씀 단일 적용 모듈 (병합 통합본)
 * - dailyVerses Firebase 데이터만 사용
 * - 하루 단위 결정론적 순환 (dayNumber 기반)
 * - 모바일/PC DOM 모두 지원
 * - MutationObserver는 verse-card 한정 (성능 보호)
 */
import { db } from '/firebase-init.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

let items = [];
let applying = false;
let refreshTimer = null;
let observedCard = null;

function todayStart() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function dateKey() { const d = todayStart(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function dayNumber() { return Math.floor(todayStart().getTime() / 86400000); }
function hash(v) { const s = String(v || ''); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function first(...vals) { return vals.find((v) => v !== undefined && v !== null && String(v).trim() !== '') || ''; }

function normalize(raw) {
  return {
    ...raw,
    ref: first(raw.ref, raw.reference, raw.verseRef, raw.bookChapterVerse, raw.address, raw.title),
    text: first(raw.text, raw.verseText, raw.content, raw.body, raw.message, raw.word)
  };
}

function activeList() {
  return items
    .map(normalize)
    .filter((v) => v && v.text && v.active !== false && v.enabled !== false && v.use !== false)
    .sort((a, b) =>
      hash(`${a.id || ''}|${a.ref || ''}|${a.text || ''}`)
      - hash(`${b.id || ''}|${b.ref || ''}|${b.text || ''}`)
      || String(a.id || '').localeCompare(String(b.id || ''))
    );
}

function pick() {
  const list = activeList();
  return list.length ? list[dayNumber() % list.length] : null;
}

function findTextEl() {
  return document.querySelector('#verseText, .verse-card .verse-text, #dailyVerseText, [data-daily-verse-text]');
}
function findRefEl() {
  return document.querySelector('#verseRef, .verse-card .verse-ref, #dailyVerseRef, [data-daily-verse-ref]');
}
function findCard() {
  return document.querySelector('.verse-card');
}

function apply() {
  const verse = pick();
  if (!verse) return false;
  const textEl = findTextEl();
  const refEl = findRefEl();
  if (!textEl || !refEl) return false;
  const refText = verse.ref || '오늘의 말씀';
  if (textEl.textContent === verse.text && refEl.textContent === refText) {
    window.__namsanTodayVerse = { id: verse.id || '', ref: refText, text: verse.text || '', date: dateKey(), source: 'firebaseDailyVerses' };
    return true;
  }
  applying = true;
  textEl.textContent = verse.text;
  refEl.textContent = refText;
  window.__namsanTodayVerse = { id: verse.id || '', ref: refText, text: verse.text || '', date: dateKey(), source: 'firebaseDailyVerses' };
  document.dispatchEvent(new CustomEvent('namsan:todayVerseChanged', { detail: window.__namsanTodayVerse }));
  requestAnimationFrame(() => { applying = false; });
  return true;
}

function observeCard() {
  const card = findCard();
  if (!card || observedCard === card) return;
  observedCard = card;
  new MutationObserver(() => {
    if (applying) return;
    const verse = pick();
    if (!verse) return;
    const textEl = findTextEl();
    const refEl = findRefEl();
    if (!textEl || !refEl) return;
    const refText = verse.ref || '오늘의 말씀';
    if (textEl.textContent !== verse.text || refEl.textContent !== refText) {
      requestAnimationFrame(apply);
    }
  }).observe(card, { childList: true, subtree: true, characterData: true });
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  apply();
  observeCard();
  refreshTimer = setTimeout(scheduleRefresh, 5 * 60 * 1000);
}

function tryApplyOnce() {
  if (!apply()) {
    // verse-card가 아직 없으면 등장할 때까지 짧게 재시도
    let tries = 0;
    const id = setInterval(() => {
      tries++;
      if (apply() || tries > 20) {
        clearInterval(id);
        observeCard();
      }
    }, 200);
  } else {
    observeCard();
  }
}

onValue(ref(db, 'dailyVerses'), (snap) => {
  const arr = [];
  snap.forEach((c) => arr.push({ id: c.key, ...c.val() }));
  items = arr;
  tryApplyOnce();
  scheduleRefresh();
}, (err) => console.warn('[daily-verse-final] dailyVerses 읽기 실패:', err.code || err.message));

document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleRefresh(); });
window.addEventListener('focus', scheduleRefresh);
document.addEventListener('namsan:forceTodayVerseRefresh', scheduleRefresh);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', tryApplyOnce);
} else {
  tryApplyOnce();
}
