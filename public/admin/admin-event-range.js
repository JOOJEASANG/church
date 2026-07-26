/* 관리자 교회일정에 시작일·종료일 기간 설정을 추가합니다. */
import { db, auth } from '/firebase-init.js';
import { ref, onValue, push, update } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';

const rangeState = { events: [] };
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

function enhanceForm() {
  const startInput = document.getElementById('evDate');
  if (!startInput) return;

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

  const syncEndDate = () => {
    const startDate = startInput.value;
    if (!endInput) return;
    endInput.min = startDate || '';
    if (startDate && (!endInput.value || endInput.value < startDate)) endInput.value = startDate;
  };
  startInput.addEventListener('change', syncEndDate);
  syncEndDate();
}

async function submitRangeEvent(button) {
  const title = document.getElementById('evTitle')?.value.trim() || '';
  const startDate = document.getElementById('evDate')?.value || '';
  const endDate = document.getElementById('evEndDate')?.value || startDate;
  const category = document.getElementById('evCategory')?.value || '기타';
  const rangeError = validateRange(startDate, endDate);

  if (!title) { alert('일정 제목을 입력해주세요'); return; }
  if (rangeError) { alert(rangeError); return; }
  if (!auth.currentUser) { alert('관리자 로그인 상태를 확인해주세요'); return; }

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = '등록 중...';
  try {
    await push(ref(db, 'events'), {
      title,
      date: startDate,
      startDate,
      endDate,
      category,
      time: document.getElementById('evTime')?.value || '',
      location: document.getElementById('evLocation')?.value.trim() || '',
      desc: document.getElementById('evDesc')?.value.trim() || '',
      createdBy: auth.currentUser.uid,
      createdAt: Date.now()
    });
    const titleInput = document.getElementById('evTitle');
    const timeInput = document.getElementById('evTime');
    const locationInput = document.getElementById('evLocation');
    const descInput = document.getElementById('evDesc');
    if (titleInput) titleInput.value = '';
    if (timeInput) timeInput.value = '';
    if (locationInput) locationInput.value = '';
    if (descInput) descInput.value = '';
    const endInput = document.getElementById('evEndDate');
    if (endInput) endInput.value = startDate;
    alert('일정이 등록되었습니다');
  } catch (error) {
    console.error('[admin-event-range] 등록 실패:', error);
    alert('일정 등록 실패: ' + (error.code || error.message));
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function closeRangeEditModal() {
  document.getElementById('eventRangeEditModal')?.remove();
}

function openRangeEditModal(id) {
  const event = rangeState.events.find((item) => item.id === id);
  if (!event) return;
  closeRangeEditModal();

  const startDate = eventStart(event);
  const endDate = eventEnd(event);
  const overlay = document.createElement('div');
  overlay.className = 'edit-modal-bg show';
  overlay.id = 'eventRangeEditModal';
  overlay.innerHTML = `
    <div class="edit-modal">
      <div class="edit-modal-head">
        <h3>일정 수정</h3>
        <button class="edit-modal-close" type="button" aria-label="닫기">×</button>
      </div>
      <div class="edit-modal-body">
        <label>제목</label>
        <input class="field" name="title" type="text" value="${escapeHtml(event.title || '')}"/>
        <div class="grid-2">
          <div><label>시작일</label><input class="field" name="startDate" type="date" value="${escapeHtml(startDate)}"/></div>
          <div><label>종료일</label><input class="field" name="endDate" type="date" value="${escapeHtml(endDate)}"/></div>
        </div>
        <label>분류</label>
        <select class="field" name="category">
          ${['예배','행사','교육','봉사','기타'].map((category) => `<option value="${category}" ${category === (event.category || '기타') ? 'selected' : ''}>${category}</option>`).join('')}
        </select>
        <label>시간 (선택)</label>
        <input class="field" name="time" type="time" value="${escapeHtml(event.time || '')}"/>
        <label>장소 (선택)</label>
        <input class="field" name="location" type="text" value="${escapeHtml(event.location || '')}"/>
        <label>설명 (선택)</label>
        <textarea class="field" name="desc" rows="4">${escapeHtml(event.desc || '')}</textarea>
      </div>
      <div class="edit-modal-foot">
        <button class="btn" data-range-cancel type="button">취소</button>
        <button class="btn primary" data-range-save type="button">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const startInput = overlay.querySelector('[name="startDate"]');
  const endInput = overlay.querySelector('[name="endDate"]');
  const syncMin = () => {
    endInput.min = startInput.value || '';
    if (startInput.value && (!endInput.value || endInput.value < startInput.value)) endInput.value = startInput.value;
  };
  startInput.addEventListener('change', syncMin);
  syncMin();

  const close = () => closeRangeEditModal();
  overlay.querySelector('.edit-modal-close').addEventListener('click', close);
  overlay.querySelector('[data-range-cancel]').addEventListener('click', close);
  overlay.addEventListener('click', (clickEvent) => { if (clickEvent.target === overlay) close(); });
  overlay.querySelector('[data-range-save]').addEventListener('click', async (clickEvent) => {
    const saveButton = clickEvent.currentTarget;
    const title = overlay.querySelector('[name="title"]').value.trim();
    const nextStart = startInput.value;
    const nextEnd = endInput.value || nextStart;
    const rangeError = validateRange(nextStart, nextEnd);
    if (!title) { alert('제목을 입력하세요'); return; }
    if (rangeError) { alert(rangeError); return; }

    saveButton.disabled = true;
    saveButton.textContent = '저장 중...';
    try {
      await update(ref(db, `events/${id}`), {
        title,
        date: nextStart,
        startDate: nextStart,
        endDate: nextEnd,
        category: overlay.querySelector('[name="category"]').value,
        time: overlay.querySelector('[name="time"]').value,
        location: overlay.querySelector('[name="location"]').value.trim(),
        desc: overlay.querySelector('[name="desc"]').value.trim(),
        updatedAt: Date.now()
      });
      close();
    } catch (error) {
      console.error('[admin-event-range] 수정 실패:', error);
      alert('저장 실패: ' + (error.code || error.message));
      saveButton.disabled = false;
      saveButton.textContent = '저장';
    }
  });
}

function patchEventsList() {
  const list = document.getElementById('eventsList');
  if (!list) return;
  list.querySelectorAll('[data-edit-ev]').forEach((button) => {
    const event = rangeState.events.find((item) => item.id === button.dataset.editEv);
    const row = button.closest('tr');
    const dateCell = row?.querySelectorAll('td')?.[1];
    if (event && dateCell) {
      const nextText = formatRange(event);
      if (dateCell.textContent !== nextText) dateCell.textContent = nextText;
    }
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

  const editButton = clickEvent.target.closest?.('[data-edit-ev]');
  if (editButton) {
    clickEvent.preventDefault();
    clickEvent.stopImmediatePropagation();
    openRangeEditModal(editButton.dataset.editEv);
  }
}

function bindEvents() {
  if (eventsUnsubscribe || !auth.currentUser) return;
  eventsUnsubscribe = onValue(ref(db, 'events'), (snapshot) => {
    const events = [];
    snapshot.forEach((child) => events.push({ id: child.key, ...child.val() }));
    rangeState.events = events;
    scheduleListPatch();
  }, (error) => console.warn('[admin-event-range] 일정 읽기 실패:', error.code || error.message));
}

function boot() {
  enhanceForm();
  observeEventsList();
  document.addEventListener('click', handleCapturedClick, true);
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      try { eventsUnsubscribe?.(); } catch {}
      eventsUnsubscribe = null;
      rangeState.events = [];
      return;
    }
    bindEvents();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
