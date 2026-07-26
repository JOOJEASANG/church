/* 관리자 교회일정에 시작일·종료일 기간 설정과 쉬운 바로 수정을 제공합니다. */
import { db, auth } from '/firebase-init.js';
import { ref, onValue, push, update } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';

const rangeState = { events: [], editingEventId: null };
let eventsUnsubscribe = null;
let listObserver = null;
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

function isValidDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function validateRange(startDate, endDate) {
  if (!isValidDateKey(startDate)) return '시작일을 선택해주세요';
  if (!isValidDateKey(endDate)) return '종료일을 선택해주세요';
  if (endDate < startDate) return '종료일은 시작일보다 빠를 수 없습니다';
  return '';
}

function todayDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || ''));
  if (!match) return String(dateString || '');
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function formatRange(event) {
  const startDate = eventStart(event);
  const endDate = eventEnd(event);
  return startDate && endDate && startDate !== endDate
    ? `${formatDate(startDate)} ~ ${formatDate(endDate)}`
    : formatDate(startDate);
}

function injectStyles() {
  if (document.getElementById('easyEventEditStyles')) return;
  const style = document.createElement('style');
  style.id = 'easyEventEditStyles';
  style.textContent = `
    #eventFormPanel.event-editing-panel {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(115,146,109,.13), var(--shadow-xs);
    }
    #eventEditBanner {
      display: none;
      margin: 0 0 16px;
      padding: 12px 14px;
      border: 1px solid #bed0b9;
      border-radius: 10px;
      background: var(--primary-soft);
      color: var(--primary-dark);
      font-size: 13px;
      font-weight: 700;
    }
    #eventEditBanner.show { display: flex; align-items: center; gap: 7px; }
    #eventFormActions { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
    #eventFormActions #evSubmit { margin-top: 0 !important; min-width: 112px; }
    #evCancelEdit { display: none; }
    #evCancelEdit.show { display: inline-flex; }
    #eventsEditHelp {
      margin: 0 0 10px;
      padding: 10px 12px;
      border-radius: 9px;
      background: var(--bg-2);
      color: var(--muted);
      font-size: 12.5px;
      font-weight: 600;
    }
    #eventsList tbody tr[data-easy-edit-id] { cursor: pointer; }
    #eventsList tbody tr[data-easy-edit-id]:hover { background: var(--primary-soft); }
    #eventsList tbody tr.event-row-editing {
      background: var(--primary-soft);
      box-shadow: inset 4px 0 0 var(--primary);
    }
    #eventsList [data-edit-ev] { white-space: nowrap; min-width: 72px; }
    @media (max-width: 760px) {
      #eventFormActions { align-items: stretch; }
      #eventFormActions .btn { flex: 1; justify-content: center; }
      #eventsEditHelp { line-height: 1.55; }
    }
  `;
  document.head.appendChild(style);
}

function syncEndDate() {
  const startInput = document.getElementById('evDate');
  const endInput = document.getElementById('evEndDate');
  if (!startInput || !endInput) return;
  const startDate = startInput.value;
  endInput.min = startDate || '';
  if (startDate && (!endInput.value || endInput.value < startDate)) endInput.value = startDate;
}

function enhanceForm() {
  const startInput = document.getElementById('evDate');
  if (!startInput) return;

  const panel = startInput.closest('.panel');
  if (panel) panel.id = 'eventFormPanel';

  const subtitle = panel?.querySelector('.sub');
  if (subtitle) subtitle.textContent = '새 일정을 등록하거나, 아래 일정 목록을 눌러 바로 수정할 수 있습니다';

  const startWrap = startInput.parentElement;
  const startLabel = startWrap?.querySelector('label');
  if (startLabel) startLabel.textContent = '시작일';

  let endInput = document.getElementById('evEndDate');
  if (!endInput) {
    const endWrap = document.createElement('div');
    endWrap.innerHTML = '<label>종료일</label><input class="field" id="evEndDate" type="date"/>';
    startWrap?.insertAdjacentElement('afterend', endWrap);
    endInput = endWrap.querySelector('#evEndDate');
  }

  if (!document.getElementById('eventEditBanner')) {
    const banner = document.createElement('div');
    banner.id = 'eventEditBanner';
    banner.setAttribute('role', 'status');
    subtitle?.insertAdjacentElement('afterend', banner);
  }

  const submitButton = document.getElementById('evSubmit');
  if (submitButton && !document.getElementById('eventFormActions')) {
    const actions = document.createElement('div');
    actions.id = 'eventFormActions';
    submitButton.insertAdjacentElement('beforebegin', actions);
    actions.appendChild(submitButton);

    const cancelButton = document.createElement('button');
    cancelButton.id = 'evCancelEdit';
    cancelButton.className = 'btn';
    cancelButton.type = 'button';
    cancelButton.textContent = '수정 취소';
    actions.appendChild(cancelButton);
  }

  startInput.addEventListener('change', syncEndDate);
  syncEndDate();
}

function setFormValue(id, value) {
  const input = document.getElementById(id);
  if (input) input.value = value ?? '';
}

function updateEditingUi() {
  const event = rangeState.events.find((item) => item.id === rangeState.editingEventId);
  const panel = document.getElementById('eventFormPanel');
  const banner = document.getElementById('eventEditBanner');
  const submitButton = document.getElementById('evSubmit');
  const cancelButton = document.getElementById('evCancelEdit');

  panel?.classList.toggle('event-editing-panel', Boolean(event));
  cancelButton?.classList.toggle('show', Boolean(event));
  if (submitButton) submitButton.textContent = event ? '수정 저장' : '일정 등록';

  if (banner) {
    banner.classList.toggle('show', Boolean(event));
    banner.innerHTML = event
      ? `<span>✏️</span><span>지금 <b>${escapeHtml(event.title || '일정')}</b> 일정을 수정하고 있습니다.</span>`
      : '';
  }

  scheduleListPatch();
}

function resetEventForm({ keepDates = false } = {}) {
  rangeState.editingEventId = null;
  setFormValue('evTitle', '');
  setFormValue('evTime', '');
  setFormValue('evLocation', '');
  setFormValue('evDesc', '');
  setFormValue('evCategory', '예배');
  if (!keepDates) {
    const today = todayDateKey();
    setFormValue('evDate', today);
    setFormValue('evEndDate', today);
  }
  syncEndDate();
  updateEditingUi();
}

function startEditingEvent(id) {
  const event = rangeState.events.find((item) => item.id === id);
  if (!event) return;

  rangeState.editingEventId = id;
  setFormValue('evTitle', event.title || '');
  setFormValue('evDate', eventStart(event));
  setFormValue('evEndDate', eventEnd(event));
  setFormValue('evCategory', event.category || '기타');
  setFormValue('evTime', event.time || '');
  setFormValue('evLocation', event.location || '');
  setFormValue('evDesc', event.desc || '');
  syncEndDate();
  updateEditingUi();

  document.getElementById('eventFormPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => document.getElementById('evTitle')?.focus({ preventScroll: true }), 350);
}

function eventFormData() {
  const title = document.getElementById('evTitle')?.value.trim() || '';
  const startDate = document.getElementById('evDate')?.value || '';
  const endDate = document.getElementById('evEndDate')?.value || startDate;
  return {
    title,
    startDate,
    endDate,
    category: document.getElementById('evCategory')?.value || '기타',
    time: document.getElementById('evTime')?.value || '',
    location: document.getElementById('evLocation')?.value.trim() || '',
    desc: document.getElementById('evDesc')?.value.trim() || ''
  };
}

async function submitRangeEvent(button) {
  const data = eventFormData();
  const rangeError = validateRange(data.startDate, data.endDate);
  const editingId = rangeState.editingEventId;

  if (!data.title) { alert('일정 제목을 입력해주세요'); return; }
  if (rangeError) { alert(rangeError); return; }
  if (!auth.currentUser) { alert('관리자 로그인 상태를 확인해주세요'); return; }

  button.disabled = true;
  button.textContent = editingId ? '수정 중...' : '등록 중...';
  try {
    const payload = {
      title: data.title,
      date: data.startDate,
      startDate: data.startDate,
      endDate: data.endDate,
      category: data.category,
      time: data.time,
      location: data.location,
      desc: data.desc
    };

    if (editingId) {
      await update(ref(db, `events/${editingId}`), { ...payload, updatedAt: Date.now() });
      resetEventForm();
      alert('일정 수정이 저장되었습니다');
    } else {
      await push(ref(db, 'events'), {
        ...payload,
        createdBy: auth.currentUser.uid,
        createdAt: Date.now()
      });
      resetEventForm({ keepDates: true });
      alert('일정이 등록되었습니다');
    }
  } catch (error) {
    console.error('[admin-event-range] 저장 실패:', error);
    alert('일정 저장 실패: ' + (error.code || error.message));
  } finally {
    button.disabled = false;
    updateEditingUi();
  }
}

function ensureListHelp(list) {
  if (document.getElementById('eventsEditHelp')) return;
  const help = document.createElement('div');
  help.id = 'eventsEditHelp';
  help.textContent = '수정 방법: 일정 제목이나 줄 전체를 누르면 위 등록칸에 내용이 자동으로 표시됩니다.';
  list.insertAdjacentElement('beforebegin', help);
}

function patchEventsList() {
  const list = document.getElementById('eventsList');
  if (!list) return;
  ensureListHelp(list);

  list.querySelectorAll('[data-edit-ev]').forEach((button) => {
    const event = rangeState.events.find((item) => item.id === button.dataset.editEv);
    const row = button.closest('tr');
    const dateCell = row?.querySelectorAll('td')?.[1];
    if (!event || !row) return;

    const nextText = formatRange(event);
    if (dateCell && dateCell.textContent !== nextText) dateCell.textContent = nextText;

    button.textContent = '✏️ 수정';
    row.dataset.easyEditId = event.id;
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `${event.title || '일정'} 수정`);
    row.title = '눌러서 일정 수정';
    row.classList.toggle('event-row-editing', event.id === rangeState.editingEventId);
  });
}

function scheduleListPatch() {
  clearTimeout(patchTimer);
  patchTimer = setTimeout(patchEventsList, 30);
}

function observeEventsList() {
  const list = document.getElementById('eventsList');
  if (!list || listObserver) return;
  listObserver = new MutationObserver(scheduleListPatch);
  listObserver.observe(list, { childList: true, subtree: true });
  scheduleListPatch();
}

function handleCapturedClick(clickEvent) {
  const submitButton = clickEvent.target.closest?.('#evSubmit');
  if (submitButton) {
    clickEvent.preventDefault();
    clickEvent.stopImmediatePropagation();
    submitRangeEvent(submitButton);
    return;
  }

  const cancelButton = clickEvent.target.closest?.('#evCancelEdit');
  if (cancelButton) {
    clickEvent.preventDefault();
    clickEvent.stopImmediatePropagation();
    resetEventForm();
    return;
  }

  if (clickEvent.target.closest?.('[data-del-ev]')) return;

  const editButton = clickEvent.target.closest?.('[data-edit-ev]');
  if (editButton) {
    clickEvent.preventDefault();
    clickEvent.stopImmediatePropagation();
    startEditingEvent(editButton.dataset.editEv);
    return;
  }

  const row = clickEvent.target.closest?.('tr[data-easy-edit-id]');
  if (row && !clickEvent.target.closest?.('button,a,input,select,textarea')) {
    clickEvent.preventDefault();
    startEditingEvent(row.dataset.easyEditId);
  }
}

function handleRowKeyboard(keyEvent) {
  if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;
  const row = keyEvent.target.closest?.('tr[data-easy-edit-id]');
  if (!row || keyEvent.target !== row) return;
  keyEvent.preventDefault();
  startEditingEvent(row.dataset.easyEditId);
}

function bindEvents() {
  if (eventsUnsubscribe || !auth.currentUser) return;
  eventsUnsubscribe = onValue(ref(db, 'events'), (snapshot) => {
    const events = [];
    snapshot.forEach((child) => events.push({ id: child.key, ...child.val() }));
    rangeState.events = events;

    if (rangeState.editingEventId && !events.some((event) => event.id === rangeState.editingEventId)) {
      resetEventForm();
    } else {
      updateEditingUi();
    }
    scheduleListPatch();
  }, (error) => console.warn('[admin-event-range] 일정 읽기 실패:', error.code || error.message));
}

function boot() {
  injectStyles();
  enhanceForm();
  observeEventsList();
  document.addEventListener('click', handleCapturedClick, true);
  document.addEventListener('keydown', handleRowKeyboard);
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      try { eventsUnsubscribe?.(); } catch {}
      eventsUnsubscribe = null;
      rangeState.events = [];
      rangeState.editingEventId = null;
      updateEditingUi();
      return;
    }
    bindEvents();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
