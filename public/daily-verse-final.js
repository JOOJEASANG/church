/* 오늘의 말씀 단일 적용 모듈
 * - Firebase dailyVerses 데이터만 사용
 * - 날짜 지정 말씀 우선 표시 (date 필드 == 오늘)
 * - 날짜 미지정 말씀은 날짜 기반 순환
 */
import { db, auth } from '/firebase-init.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

let items = [];
let applying = false;
let refreshTimer = null;
let dailyUnsub = null;
let retryTimer = null;
let bound = false;
let lastLogKey = '';

function todayStart(offset = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
}
function dateKey(offset = 0) {
  const d = todayStart(offset);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function monthKey(offset = 0) {
  const d = todayStart(offset);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function dayOfMonth(offset = 0) {
  return todayStart(offset).getDate();
}
function hash(v) {
  const s = String(v || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function first(...vals) {
  return vals.find(v => v !== undefined && v !== null && String(v).trim() !== '') || '';
}
function normalize(raw) {
  const refText = first(raw.ref, raw.reference, raw.verseRef, raw.bookChapterVerse, raw.address, raw.title);
  const bodyText = first(raw.text, raw.verseText, raw.content, raw.body, raw.message, raw.word);
  const active = raw.active !== false && raw.enabled !== false && raw.use !== false && raw.hidden !== true;
  const date = (typeof raw.date === 'string' && raw.date.match(/^\d{4}-\d{2}-\d{2}$/)) ? raw.date : '';
  return { ...raw, ref: refText, text: bodyText, active, date };
}
function activeList() {
  return items
    .map(normalize)
    .filter(v => v && v.text && v.active)
    .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
}
function shuffledForDate(list, offset = 0) {
  const m = monthKey(offset);
  return [...list].sort((a, b) => {
    const ha = hash(`${m}|${a.id || ''}|${a.ref || ''}|${a.text || ''}`);
    const hb = hash(`${m}|${b.id || ''}|${b.ref || ''}|${b.text || ''}`);
    return ha - hb || String(a.id || '').localeCompare(String(b.id || ''));
  });
}
function pickRotation(list, offset = 0) {
  if (!list.length) return null;
  const shuffled = shuffledForDate(list, offset);
  return shuffled[(dayOfMonth(offset) - 1) % shuffled.length];
}
function pick() {
  const list = activeList();
  if (!list.length) return null;

  // 1순위: 오늘 날짜가 지정된 말씀 (가장 최근 등록된 것)
  const today = dateKey();
  const todayVerses = list
    .filter(v => v.date === today)
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  if (todayVerses.length) return todayVerses[0];

  // 2순위: 날짜 미지정 말씀을 날짜 기반 순환
  const undated = list.filter(v => !v.date);
  if (!undated.length) {
    // 날짜 있는 말씀 중 가장 최근 것으로 폴백
    return list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))[0];
  }

  let today_ = pickRotation(undated, 0);
  if (undated.length > 1) {
    const yesterday = pickRotation(undated, -1);
    if (yesterday && today_ && (yesterday.id || yesterday.text) === (today_.id || today_.text)) {
      const shuffled = shuffledForDate(undated, 0);
      const idx = shuffled.findIndex(v => (v.id || v.text) === (today_.id || today_.text));
      today_ = shuffled[(idx + 1) % shuffled.length];
    }
  }
  return today_;
}
function textEls() {
  return Array.from(document.querySelectorAll('#verseText, .verse-card .verse-text, #dailyVerseText, [data-daily-verse-text]'));
}
function refEls() {
  return Array.from(document.querySelectorAll('#verseRef, .verse-card .verse-ref, #dailyVerseRef, [data-daily-verse-ref]'));
}
function cards() {
  return Array.from(document.querySelectorAll('.verse-card, #verseCard'));
}
function apply() {
  const verse = pick();
  if (!verse) return false;
  const tEls = textEls();
  const rEls = refEls();
  if (!tEls.length || !rEls.length) return false;
  const refText = verse.ref || '오늘의 말씀';
  applying = true;
  tEls.forEach(el => {
    el.textContent = verse.text;
    el.dataset.dailyVerseDate = dateKey();
    el.dataset.dailyVerseSource = 'firebaseDailyVerses';
  });
  rEls.forEach(el => {
    el.textContent = refText;
    el.dataset.dailyVerseDate = dateKey();
    el.dataset.dailyVerseSource = 'firebaseDailyVerses';
  });
  window.__namsanTodayVerse = {
    id: verse.id || '',
    ref: refText,
    text: verse.text || '',
    date: dateKey(),
    count: activeList().length,
    source: 'firebaseDailyVerses'
  };
  const logKey = `${dateKey()}|${verse.id || verse.text}|${activeList().length}`;
  if (lastLogKey !== logKey) {
    lastLogKey = logKey;
    console.info('[daily-verse-final] 오늘의 말씀 적용', window.__namsanTodayVerse);
  }
  document.dispatchEvent(new CustomEvent('namsan:todayVerseChanged', { detail: window.__namsanTodayVerse }));
  requestAnimationFrame(() => { applying = false; });
  return true;
}
function observeCards() {
  cards().forEach(card => {
    if (card.dataset.dailyVerseObserved === 'true') return;
    card.dataset.dailyVerseObserved = 'true';
    new MutationObserver(() => {
      if (!applying) requestAnimationFrame(apply);
    }).observe(card, { childList: true, subtree: true, characterData: true });
  });
}
function tryApplyOnce() {
  if (apply()) {
    observeCards();
    return;
  }
  let tries = 0;
  const id = setInterval(() => {
    tries++;
    if (apply() || tries > 40) {
      clearInterval(id);
      observeCards();
    }
  }, 200);
}
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  tryApplyOnce();
  refreshTimer = setTimeout(scheduleRefresh, 5 * 60 * 1000);
}
function bindDailyVerses() {
  if (dailyUnsub || bound) return;
  bound = true;
  dailyUnsub = onValue(ref(db, 'dailyVerses'), snap => {
    const arr = [];
    snap.forEach(c => arr.push({ id: c.key, ...c.val() }));
    items = arr;
    scheduleRefresh();
  }, err => {
    console.warn('[daily-verse-final] dailyVerses 읽기 실패:', err.code || err.message);
    if (dailyUnsub) { dailyUnsub(); dailyUnsub = null; }
    bound = false;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => bindDailyVerses(), auth.currentUser ? 1800 : 3000);
  });
}
function unbindTimers() {
  clearTimeout(refreshTimer);
  clearTimeout(retryTimer);
}

bindDailyVerses();
onAuthStateChanged(auth, () => {
  if (!dailyUnsub) bindDailyVerses();
  scheduleRefresh();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleRefresh(); });
window.addEventListener('focus', scheduleRefresh);
document.addEventListener('namsan:forceTodayVerseRefresh', scheduleRefresh);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleRefresh);
else scheduleRefresh();
window.addEventListener('beforeunload', unbindTimers);
