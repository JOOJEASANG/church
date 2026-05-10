/* =============================================================
 * 오늘의 말씀 관리자 목록 보정
 * - Firebase dailyVerses에는 저장되지만 관리자 목록이 비어 보이는 문제 보정
 * - DB를 직접 구독해서 #dvList를 다시 렌더링
 * - 수정/숨김/삭제 기능 유지
 * ============================================================= */

import { db, auth } from '/firebase-init.js';
import { ref, onValue, update, remove } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

let items = [];
let listenerStarted = false;
let renderTimer = null;

function isAdminPage() {
  return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
}

function escapeHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmt(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function status(msg, error = false) {
  const el = document.getElementById('dvStatus') || document.getElementById('dvSeedStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = error ? 'var(--danger, #d05656)' : 'var(--primary, #73926d)';
  if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3500);
}

function setForm(item) {
  const refInput = document.getElementById('dvRef');
  const textInput = document.getElementById('dvText');
  const noteInput = document.getElementById('dvNote');
  const activeInput = document.getElementById('dvActive');
  const saveBtn = document.getElementById('dvSave');
  const cancelBtn = document.getElementById('dvCancel');
  if (!refInput || !textInput || !saveBtn) return;

  refInput.value = item.ref || '';
  textInput.value = item.text || '';
  if (noteInput) noteInput.value = item.note || '';
  if (activeInput) activeInput.value = item.active === false ? 'false' : 'true';
  saveBtn.dataset.editingId = item.id;
  saveBtn.textContent = '수정 저장';
  if (cancelBtn) cancelBtn.style.display = '';
  refInput.focus();
}

function bindSavePatch() {
  const saveBtn = document.getElementById('dvSave');
  const cancelBtn = document.getElementById('dvCancel');
  if (!saveBtn || saveBtn.dataset.listFixBound === 'true') return;
  saveBtn.dataset.listFixBound = 'true';

  saveBtn.addEventListener('click', async (e) => {
    const id = saveBtn.dataset.editingId;
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();

    const verseRef = document.getElementById('dvRef')?.value.trim() || '';
    const text = document.getElementById('dvText')?.value.trim() || '';
    const note = document.getElementById('dvNote')?.value.trim() || '';
    const active = (document.getElementById('dvActive')?.value || 'true') !== 'false';
    if (!verseRef) return status('성경 구절을 입력해주세요.', true);
    if (!text) return status('말씀 본문을 입력해주세요.', true);

    saveBtn.disabled = true;
    status('수정 저장 중...');
    try {
      await update(ref(db, `dailyVerses/${id}`), {
        ref: verseRef,
        text,
        note,
        active,
        updatedAt: Date.now(),
        updatedBy: auth.currentUser?.uid || ''
      });
      delete saveBtn.dataset.editingId;
      saveBtn.textContent = '말씀 저장';
      if (cancelBtn) cancelBtn.style.display = 'none';
      ['dvRef', 'dvText', 'dvNote'].forEach((fieldId) => {
        const el = document.getElementById(fieldId);
        if (el) el.value = '';
      });
      const activeInput = document.getElementById('dvActive');
      if (activeInput) activeInput.value = 'true';
      status('수정되었습니다.');
    } catch (err) {
      console.error('[daily-verses-list-fix] 수정 실패:', err);
      status('수정 실패: ' + (err.code || err.message), true);
    } finally {
      saveBtn.disabled = false;
    }
  }, true);

  cancelBtn?.addEventListener('click', () => {
    delete saveBtn.dataset.editingId;
    saveBtn.textContent = '말씀 저장';
  }, true);
}

function renderList() {
  if (!isAdminPage()) return;
  const list = document.getElementById('dvList');
  if (!list) return;

  const count = document.getElementById('dvCount');
  if (count) count.textContent = String(items.length);

  bindSavePatch();

  if (!items.length) {
    list.innerHTML = '<div class="empty">아직 등록된 말씀이 없습니다. 기본 말씀 추가 버튼 또는 위 입력창으로 등록해주세요.</div>';
    return;
  }

  list.innerHTML = `<table><thead><tr><th>상태</th><th>구절</th><th>본문</th><th>등록일</th><th></th></tr></thead><tbody>${items.map((v) => `
    <tr>
      <td>${v.active === false ? '<span class="pill">숨김</span>' : '<span class="pill" style="background:var(--primary-soft);color:var(--primary-dark);">사용</span>'}</td>
      <td><b>${escapeHtml(v.ref || '')}</b>${v.note ? `<br/><span style="color:var(--muted);font-size:11.5px;">${escapeHtml(v.note)}</span>` : ''}</td>
      <td style="max-width:420px;white-space:pre-wrap;font-size:12.5px;">${escapeHtml(v.text || '')}</td>
      <td>${fmt(v.createdAt || v.updatedAt)}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-sm" data-list-fix-edit="${v.id}">수정</button>
        <button class="btn btn-sm" data-list-fix-toggle="${v.id}">${v.active === false ? '사용' : '숨김'}</button>
        <button class="btn btn-sm danger" data-list-fix-delete="${v.id}">삭제</button>
      </td>
    </tr>`).join('')}</tbody></table>`;

  list.querySelectorAll('[data-list-fix-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = items.find((v) => v.id === btn.dataset.listFixEdit);
      if (item) setForm(item);
    });
  });

  list.querySelectorAll('[data-list-fix-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = items.find((v) => v.id === btn.dataset.listFixToggle);
      if (!item) return;
      try {
        await update(ref(db, `dailyVerses/${item.id}`), {
          active: item.active === false,
          updatedAt: Date.now(),
          updatedBy: auth.currentUser?.uid || ''
        });
        status('상태가 변경되었습니다.');
      } catch (err) {
        status('상태 변경 실패: ' + (err.code || err.message), true);
      }
    });
  });

  list.querySelectorAll('[data-list-fix-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = items.find((v) => v.id === btn.dataset.listFixDelete);
      if (!item) return;
      if (!confirm(`"${item.ref || '말씀'}" 구절을 삭제할까요?`)) return;
      try {
        await remove(ref(db, `dailyVerses/${item.id}`));
        status('삭제되었습니다.');
      } catch (err) {
        status('삭제 실패: ' + (err.code || err.message), true);
      }
    });
  });
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderList, 80);
}

function startListener() {
  if (!isAdminPage() || listenerStarted) return;
  listenerStarted = true;
  onValue(ref(db, 'dailyVerses'), (snap) => {
    const arr = [];
    snap.forEach((c) => arr.push({ id: c.key, ...c.val() }));
    items = arr.sort((a, b) => (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0));
    scheduleRender();
  }, (err) => status('말씀 목록 읽기 실패: ' + (err.code || err.message), true));
}

function boot() {
  if (!isAdminPage()) return;
  startListener();
  scheduleRender();
  [300, 800, 1600, 3000, 5000].forEach((ms) => setTimeout(scheduleRender, ms));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
onAuthStateChanged(auth, () => setTimeout(boot, 500));
