/* 기간 교회일정을 캘린더의 모든 해당 날짜와 다가오는 일정에 표시합니다. */
import { db, auth } from '/firebase-init.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';

const rangeState = { events: [] };
let eventsUnsubscribe = null;
let calendarObserver = null;
let upcomingObserver = null;
let patchTimer = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function eventStart(event) {
  return event?.startDate || event?.date || '';
}

function eventEnd(event) {
  return event?.endDate || eventStart(event);
}

function containsDate(event, dateKey) {
  const startDate = eventStart(event);
  const endDate = eventEnd(event);
  return Boolean(startDate && endDate && startDate <= dateKey && dateKey <= endDate);
}

function seoulTodayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDate(dateString, withYear = false) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || ''));
  if (!match) return String(dateString || '');
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const weekday = new Intl.DateTimeFormat('ko-KR', { weekday: 'short' }).format(date);
  return withYear
    ? `${year}년 ${Number(month)}월 ${Number(day)}일 (${weekday})`
    : `${Number(month)}월 ${Number(day)}일 (${weekday})`;
}

function formatRange(event, withYear = false) {
  const startDate = eventStart(event);
  const endDate = eventEnd(event);
  if (!startDate) return '';
  return endDate && endDate !== startDate
    ? `${formatDate(startDate, withYear)} ~ ${formatDate(endDate, withYear)}`
    : formatDate(startDate, withYear);
}

function categoryClass(category) {
  return ({ 행사: 'event', 교육: 'notice', 봉사: 'urgent' })[category] || '';
}

function eventsForDate(dateKey) {
  return rangeState.events
    .filter((event) => containsDate(event, dateKey))
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
}

function patchCalendar() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  grid.querySelectorAll('.cal-cell[data-date]').forEach((cell) => {
    const dateKey = cell.dataset.date;
    const events = eventsForDate(dateKey);
    const dots = cell.querySelector('.cal-events');
    if (!dots) return;
    const dotSignature = events.slice(0, 3).map((event) => `${event.id}:${event.category || ''}:${event.title || ''}`).join('|');
    if (dots.dataset.rangeDotSignature !== dotSignature) {
      dots.innerHTML = events.slice(0, 3).map((event) =>
        `<div class="cal-dot cat-${escapeHtml(event.category || '기타')}" title="${escapeHtml(event.title || '')}"></div>`
      ).join('');
      dots.dataset.rangeDotSignature = dotSignature;
    }
    cell.classList.toggle('has-events', events.length > 0);
    cell.setAttribute('aria-label', events.length ? `${dateKey}, 일정 ${events.length}개` : dateKey);
  });
}

function upcomingEvents() {
  const today = seoulTodayKey();
  return [...rangeState.events]
    .filter((event) => eventEnd(event) >= today)
    .sort((a, b) => {
      const aStart = eventStart(a);
      const bStart = eventStart(b);
      const aOngoing = aStart <= today && today <= eventEnd(a);
      const bOngoing = bStart <= today && today <= eventEnd(b);
      if (aOngoing !== bOngoing) return aOngoing ? -1 : 1;
      const byStart = aStart.localeCompare(bStart);
      return byStart || String(a.time || '').localeCompare(String(b.time || ''));
    })
    .slice(0, 8);
}

function patchUpcomingEvents() {
  const list = document.getElementById('upcomingEvents');
  if (!list) return;
  const events = upcomingEvents();
  const signature = events.map((event) => [event.id, eventStart(event), eventEnd(event), event.time || '', event.title || ''].join(':')).join('|');
  const currentIds = Array.from(list.querySelectorAll('[data-range-event-id]')).map((row) => row.dataset.rangeEventId).join('|');
  const desiredIds = events.map((event) => String(event.id || '')).join('|');
  if (list.dataset.rangeSignature === signature && currentIds === desiredIds) return;

  if (!events.length) {
    list.innerHTML = '<div class="list-empty">예정된 일정이 없어요. 관리자 페이지에서 일정을 등록하세요.</div>';
    list.dataset.rangeSignature = signature;
    return;
  }

  const today = seoulTodayKey();
  list.innerHTML = events.map((event) => {
    const ongoing = eventStart(event) <= today && today <= eventEnd(event) && eventStart(event) !== eventEnd(event);
    const meta = [event.time ? `🕐 ${event.time}` : '', event.location ? `📍 ${event.location}` : ''].filter(Boolean).join(' · ');
    return `<div class="list-row range-upcoming-row" role="button" tabindex="0" data-range-event-id="${escapeHtml(event.id)}" style="cursor:pointer;">
      <div class="lr-top"><span class="lr-tag ${categoryClass(event.category)}">${escapeHtml(event.category || '기타')}</span><span>${ongoing ? '진행 중 · ' : ''}${escapeHtml(formatRange(event))}</span></div>
      <h4>${escapeHtml(event.title || '')}</h4>
      ${meta || event.desc ? `<p>${escapeHtml([meta, event.desc || ''].filter(Boolean).join(' · '))}</p>` : ''}
    </div>`;
  }).join('');
  list.dataset.rangeSignature = signature;
  bindUpcomingActions(list);
}

function bindUpcomingActions(list) {
  list.querySelectorAll('[data-range-event-id]').forEach((row) => {
    if (row.dataset.rangeBound === '1') return;
    row.dataset.rangeBound = '1';
    const activate = () => {
      const event = rangeState.events.find((item) => item.id === row.dataset.rangeEventId);
      if (event) openEventDetails(formatRange(event, true), [event]);
    };
    row.addEventListener('click', activate);
    row.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
        keyEvent.preventDefault();
        activate();
      }
    });
  });
}

function closeEventDetails() {
  document.getElementById('rangeEventDetailsModal')?.remove();
}

function openEventDetails(title, events) {
  closeEventDetails();
  const overlay = document.createElement('div');
  overlay.className = 'modal-bg show';
  overlay.id = 'rangeEventDetailsModal';
  overlay.innerHTML = `<div class="modal" style="max-width:680px;">
    <div class="modal-grip"></div>
    <div class="modal-head"><div><h3>📅 ${escapeHtml(title)}</h3><p class="sub">교회 일정</p></div><button class="close-btn" type="button" aria-label="닫기">×</button></div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${events.map((event) => `<article class="feed-card" style="margin:0;">
        <div class="top"><span class="tag ${categoryClass(event.category)}">${escapeHtml(event.category || '기타')}</span><span class="time">${escapeHtml(formatRange(event))}</span></div>
        <h3>${escapeHtml(event.title || '')}</h3>
        ${event.desc ? `<p>${escapeHtml(event.desc)}</p>` : ''}
        <div class="ann-meta">${escapeHtml([event.time ? `🕐 ${event.time}` : '', event.location ? `📍 ${event.location}` : ''].filter(Boolean).join(' · ') || '세부 정보 없음')}</div>
      </article>`).join('')}
    </div>
  </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  const close = () => {
    closeEventDetails();
    if (!document.querySelector('.modal-bg.show')) document.body.style.overflow = '';
  };
  overlay.querySelector('.close-btn').addEventListener('click', close);
  overlay.addEventListener('click', (clickEvent) => { if (clickEvent.target === overlay) close(); });
}

function handleCalendarClick(clickEvent) {
  const cell = clickEvent.target.closest?.('.cal-cell[data-date]');
  if (!cell) return;
  const events = eventsForDate(cell.dataset.date || '');
  if (!events.length) return;
  clickEvent.preventDefault();
  clickEvent.stopImmediatePropagation();
  openEventDetails(formatDate(cell.dataset.date, true), events);
}

function schedulePatch() {
  clearTimeout(patchTimer);
  patchTimer = setTimeout(() => {
    patchCalendar();
    patchUpcomingEvents();
  }, 40);
}

function observeTargets() {
  const grid = document.getElementById('calendarGrid');
  if (grid && !calendarObserver) {
    calendarObserver = new MutationObserver(schedulePatch);
    calendarObserver.observe(grid, { childList: true, subtree: true });
  }
  const upcoming = document.getElementById('upcomingEvents');
  if (upcoming && !upcomingObserver) {
    upcomingObserver = new MutationObserver(schedulePatch);
    upcomingObserver.observe(upcoming, { childList: true, subtree: true });
  }
  schedulePatch();
}

function bindEvents() {
  if (eventsUnsubscribe || !auth.currentUser) return;
  eventsUnsubscribe = onValue(ref(db, 'events'), (snapshot) => {
    const events = [];
    snapshot.forEach((child) => events.push({ id: child.key, ...child.val() }));
    rangeState.events = events;
    schedulePatch();
  }, (error) => console.warn('[event-range-ui] 일정 읽기 실패:', error.code || error.message));
}

function boot() {
  observeTargets();
  document.addEventListener('click', handleCalendarClick, true);
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      try { eventsUnsubscribe?.(); } catch {}
      eventsUnsubscribe = null;
      rangeState.events = [];
      schedulePatch();
      return;
    }
    bindEvents();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
