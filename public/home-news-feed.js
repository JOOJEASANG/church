/* 메인 '이번 주 소식'에 공지와 가까운 교회일정을 함께 표시합니다.
 * 기존 app.js의 공지 카드와 신청 기능은 그대로 두고 일정 카드만 보완합니다.
 */
import { db, auth } from '/firebase-init.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';

const localState = {
  announcements: [],
  events: []
};

let eventUnsubscribe = null;
let announcementUnsubscribe = null;
let feedObserver = null;
let renderTimer = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function emptyMessageHtml() {
  return '<div class="feed-card"><h3>아직 등록된 소식이 없어요</h3><p>공지나 교회일정이 등록되면 여기에 표시됩니다.</p></div>';
}

function seoulTodayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function eventStart(event) {
  return event?.startDate || event?.date || '';
}

function eventEnd(event) {
  return event?.endDate || eventStart(event);
}

function formatEventDate(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || ''));
  if (!match) return String(dateString || '');
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const weekday = new Intl.DateTimeFormat('ko-KR', { weekday: 'short' }).format(date);
  return `${Number(month)}월 ${Number(day)}일 (${weekday})`;
}

function formatEventRange(event) {
  const startDate = eventStart(event);
  const endDate = eventEnd(event);
  if (!startDate) return '';
  return endDate && endDate !== startDate
    ? `${formatEventDate(startDate)} ~ ${formatEventDate(endDate)}`
    : formatEventDate(startDate);
}

function upcomingEvents() {
  const today = seoulTodayKey();
  return [...localState.events]
    .filter((event) => event && eventStart(event) && eventEnd(event) >= today)
    .sort((a, b) => {
      const aStart = eventStart(a);
      const bStart = eventStart(b);
      const aOngoing = aStart <= today && today <= eventEnd(a);
      const bOngoing = bStart <= today && today <= eventEnd(b);
      if (aOngoing !== bOngoing) return aOngoing ? -1 : 1;
      const byDate = aStart.localeCompare(bStart);
      if (byDate) return byDate;
      return String(a.time || '').localeCompare(String(b.time || ''));
    })
    .slice(0, 3);
}

function eventCardHtml(event) {
  const today = seoulTodayKey();
  const startDate = eventStart(event);
  const endDate = eventEnd(event);
  const ongoing = startDate <= today && today <= endDate && startDate !== endDate;
  const focusDate = ongoing ? today : startDate;
  const period = formatEventRange(event);
  const detail = [
    period,
    event.time ? `🕐 ${event.time}` : '',
    event.location ? `📍 ${event.location}` : ''
  ].filter(Boolean).join(' · ');
  const category = event.category && event.category !== '기타' ? ` · ${event.category}` : '';
  return `
    <article class="feed-card home-event-card" role="button" tabindex="0"
      data-home-event-id="${escapeHtml(event.id)}" data-home-event-date="${escapeHtml(focusDate)}"
      aria-label="${escapeHtml(`${event.title || '교회일정'} 일정 자세히 보기`)}" style="cursor:pointer;">
      <div class="top">
        <span class="tag event">📅 교회일정${escapeHtml(category)}</span>
        <span class="time">${ongoing ? '진행 중 · ' : ''}${escapeHtml(period)}</span>
      </div>
      <h3>${escapeHtml(event.title || '교회일정')}</h3>
      <p>${escapeHtml(event.desc || '교회 캘린더에 등록된 일정입니다.')}</p>
      ${detail ? `<div class="ann-meta">${escapeHtml(detail)}</div>` : ''}
    </article>`;
}

function isEmptyPlaceholder(card) {
  const title = card.querySelector('h3')?.textContent || '';
  return title.includes('아직 등록된 소식이 없어요');
}

function openEventDate(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  const calendarButton = document.querySelector('[data-tab="calendar"]');
  calendarButton?.click();
  if (!match) return;

  const targetYear = Number(match[1]);
  const targetMonth = Number(match[2]);
  const moveToDate = (attempt = 0) => {
    if (attempt > 36) return;
    const label = document.getElementById('calMonthLabel')?.textContent || '';
    const labelMatch = /(\d{4})년\s*(\d{1,2})월/.exec(label);
    if (!labelMatch) {
      window.setTimeout(() => moveToDate(attempt + 1), 50);
      return;
    }
    const shownYear = Number(labelMatch[1]);
    const shownMonth = Number(labelMatch[2]);
    const delta = (targetYear - shownYear) * 12 + (targetMonth - shownMonth);
    if (delta !== 0) {
      document.getElementById(delta > 0 ? 'calNext' : 'calPrev')?.click();
      window.setTimeout(() => moveToDate(attempt + 1), 40);
      return;
    }
    const selectorDate = window.CSS?.escape ? window.CSS.escape(date) : date.replaceAll('"', '\\"');
    document.querySelector(`.cal-cell[data-date="${selectorDate}"]`)?.click();
  };
  window.setTimeout(() => moveToDate(), 100);
}

function bindEventCardActions(feed) {
  feed.querySelectorAll('.home-event-card').forEach((card) => {
    if (card.dataset.homeEventBound === '1') return;
    card.dataset.homeEventBound = '1';
    const activate = () => openEventDate(card.dataset.homeEventDate || '');
    card.addEventListener('click', activate);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
  });
}

function renderHomeEvents() {
  const feed = document.querySelector('#tab-home .feed');
  if (!feed) return;

  const events = upcomingEvents();
  const signature = events.map((event) => `${event.id}:${eventStart(event)}:${eventEnd(event)}:${event.time || ''}:${event.title || ''}`).join('|');
  const currentCards = Array.from(feed.querySelectorAll('.home-event-card'));
  const currentIds = currentCards.map((card) => card.dataset.homeEventId || '').join('|');
  const desiredIds = events.map((event) => String(event.id || '')).join('|');
  const emptyPlaceholder = Array.from(feed.children).find((child) => child.classList?.contains('feed-card') && isEmptyPlaceholder(child));

  const alreadyCorrect = feed.dataset.homeEventSignature === signature
    && currentCards.length === events.length
    && currentIds === desiredIds
    && !(events.length && localState.announcements.length === 0 && emptyPlaceholder)
    && !(!events.length && localState.announcements.length === 0 && !emptyPlaceholder);
  if (alreadyCorrect) {
    bindEventCardActions(feed);
    return;
  }

  currentCards.forEach((card) => card.remove());
  if (events.length && localState.announcements.length === 0 && emptyPlaceholder) emptyPlaceholder.remove();

  if (events.length) {
    feed.insertAdjacentHTML('beforeend', events.map(eventCardHtml).join(''));
    bindEventCardActions(feed);
  } else if (localState.announcements.length === 0 && !Array.from(feed.children).some(isEmptyPlaceholder)) {
    feed.innerHTML = emptyMessageHtml();
  }
  feed.dataset.homeEventSignature = signature;
}

function scheduleRender() {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderHomeEvents, 40);
}

function observeFeed() {
  const feed = document.querySelector('#tab-home .feed');
  if (!feed || feedObserver) return;
  feedObserver = new MutationObserver(scheduleRender);
  feedObserver.observe(feed, { childList: true });
  scheduleRender();
}

function unbindDatabase() {
  try { eventUnsubscribe?.(); } catch {}
  try { announcementUnsubscribe?.(); } catch {}
  eventUnsubscribe = null;
  announcementUnsubscribe = null;
  localState.announcements = [];
  localState.events = [];
}

function bindDatabase() {
  if (eventUnsubscribe || announcementUnsubscribe || !auth.currentUser) return;

  announcementUnsubscribe = onValue(ref(db, 'announcements'), (snapshot) => {
    const announcements = [];
    snapshot.forEach((child) => announcements.push({ id: child.key, ...child.val() }));
    localState.announcements = announcements;
    scheduleRender();
  }, (error) => console.warn('[home-news-feed] 공지 읽기 실패:', error.code || error.message));

  eventUnsubscribe = onValue(ref(db, 'events'), (snapshot) => {
    const events = [];
    snapshot.forEach((child) => events.push({ id: child.key, ...child.val() }));
    localState.events = events;
    scheduleRender();
  }, (error) => console.warn('[home-news-feed] 일정 읽기 실패:', error.code || error.message));
}

function boot() {
  observeFeed();
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      unbindDatabase();
      scheduleRender();
      return;
    }
    bindDatabase();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
