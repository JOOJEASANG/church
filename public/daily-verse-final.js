/* 오늘의 말씀 단일 적용 모듈
 * - Firebase dailyVerses 데이터만 사용
 * - 날짜 지정 말씀 우선 표시 (date 필드 == 오늘)
 * - 날짜 미지정 말씀은 오늘 날짜를 seed로 매일 다르게 표시
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
function hash(s) {
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

/* 오늘 날짜를 seed로 pool을 섞어 반환 — 날짜가 바뀌면 순서가 바뀜 */
function shuffleByDay(pool, dayStr) {
  return [...pool].sort((a, b) => {
    const ha = hash(`${dayStr}|${a.id || ''}|${a.text || ''}`);
    const hb = hash(`${dayStr}|${b.id || ''}|${b.text || ''}`);
    return ha - hb;
  });
}

function pick() {
  const list = activeList();
  if (!list.length) return null;

  const today = dateKey();

  // 1순위: 오늘 날짜가 지정된 말씀 (가장 최근 등록된 것)
  const todayVerses = list
    .filter(v => v.date === today)
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  if (todayVerses.length) return todayVerses[0];

  // 2순위: 날짜 미지정 말씀을 오늘 날짜 seed로 매일 다르게 선택
  const undated = list.filter(v => !v.date);
  const pool = undated.length ? undated : list;
  if (pool.length === 1) return pool[0];

  // 오늘 날짜(YYYY-MM-DD) 전체를 seed로 shuffle → index 0이 오늘의 말씀
  const todayShuffled = shuffleByDay(pool, today);

  // 어제와 같은 말씀이면 두 번째 말씀으로 대체 (연속 중복 방지)
  if (pool.length > 1) {
    const yesterdayShuffled = shuffleByDay(pool, dateKey(-1));
    if (yesterdayShuffled[0]?.id === todayShuffled[0]?.id) {
      return todayShuffled[1];
    }
  }

  return todayShuffled[0];
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
