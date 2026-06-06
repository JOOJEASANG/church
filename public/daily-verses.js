/* =============================================================
 * 오늘의 말씀 관리자 메뉴
 * - 직접등록은 버튼 → 레이어창에서 저장
 * - 목록 렌더링/페이지네이션은 daily-verses-list-fix.js 담당
 * ============================================================= */

import { db, auth } from '/firebase-init.js';
import { ref, push, update } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

let adminInjected = false;
let saveBound = false;
let currentEditingId = '';

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

function injectStyles() {
  if (document.getElementById('dailyVerseAdminStyles')) return;
  const style = document.createElement('style');
  style.id = 'dailyVerseAdminStyles';
  style.textContent = `
    .daily-verses-toolbar {
      display:flex;
      gap:10px;
      align-items:center;
      justify-content:space-between;
      flex-wrap:wrap;
      margin:14px 0 12px;
    }
    .daily-verses-toolbar .left,
    .daily-verses-toolbar .right { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .daily-verses-search {
      min-width:220px;
      max-width:360px;
    }
    .daily-verses-summary {
      font-size:12.5px;
      color:var(--muted,#767a83);
      font-weight:700;
    }
    .daily-verses-layer {
      position:fixed;
      inset:0;
      z-index:10000;
      background:rgba(20,22,26,.54);
      display:none;
      align-items:center;
      justify-content:center;
      padding:18px;
    }
    .daily-verses-layer.show { display:flex; }
    .daily-verses-dialog {
      width:min(560px, 100%);
      max-height:92vh;
      overflow:auto;
      background:var(--paper,#fff);
      color:var(--text,#15171a);
      border-radius:22px;
      box-shadow:0 24px 80px rgba(0,0,0,.28);
      padding:22px;
      border:1px solid var(--line,#ebece8);
    }
    .daily-verses-dialog-head {
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:12px;
      margin-bottom:16px;
    }
    .daily-verses-dialog-head h3 {
      margin:0;
      font-size:20px;
      font-weight:900;
      letter-spacing:-.6px;
    }
    .daily-verses-dialog-head p {
      margin:5px 0 0;
      font-size:12.5px;
      color:var(--muted,#767a83);
      font-weight:600;
    }
    .daily-verses-close {
      width:34px;
      height:34px;
      border-radius:999px;
      border:1px solid var(--line,#ebece8);
      background:var(--paper,#fff);
      cursor:pointer;
      font-size:20px;
      line-height:1;
    }
    .dv-table-wrap { overflow-x:auto; }
    .dv-table-wrap table { width:100%; min-width:850px; border-collapse:collapse; }
    .dv-table-wrap th,
    .dv-table-wrap td { border-bottom:1px solid var(--line,#ebece8); padding:10px 9px; vertical-align:top; text-align:left; }
    .dv-table-wrap th { font-size:12px; color:var(--muted,#767a83); font-weight:900; white-space:nowrap; }
    .dv-table-wrap td { font-size:12.5px; }
    .dv-verse-text { max-width:430px; white-space:pre-wrap; line-height:1.5; }
    .dv-actions { display:flex; gap:5px; white-space:nowrap; }
    .dv-pager { display:flex; align-items:center; justify-content:center; gap:6px; flex-wrap:wrap; margin-top:14px; }
    .dv-pager button { min-width:34px; height:34px; border-radius:10px; border:1px solid var(--line,#ebece8); background:var(--paper,#fff); cursor:pointer; font-weight:800; }
    .dv-pager button.active { background:var(--primary,#73926d); color:#fff; border-color:var(--primary,#73926d); }
    .dv-pager button:disabled { opacity:.45; cursor:not-allowed; }
    .dv-status-line { font-size:12.5px; font-weight:800; color:var(--muted,#767a83); min-height:18px; }
    @media (max-width:760px) {
      .daily-verses-dialog { border-radius:18px; padding:18px; }
      .daily-verses-search { min-width:100%; }
    }
  `;
  document.head.appendChild(style);
}

function injectAdminMenu() {
  if (!isAdminPage() || adminInjected) return;
  const sidebar = document.querySelector('.sidebar');
  const content = document.querySelector('.content');
  if (!sidebar || !content) return;
  if (document.getElementById('pane-daily-verses')) {
    adminInjected = true;
    return;
  }
  adminInjected = true;
  injectStyles();

  const section = document.createElement('div');
  section.className = 'nav-section daily-verses-section';
  section.textContent = '말씀 관리';

  const nav = document.createElement('div');
  nav.className = 'nav-item';
  nav.dataset.pane = 'daily-verses';
  nav.innerHTML = '<span class="ico">📜</span>오늘의 말씀';

  sidebar.appendChild(section);
  sidebar.appendChild(nav);

  const pane = document.createElement('div');
  pane.className = 'pane';
  pane.id = 'pane-daily-verses';
  pane.innerHTML = `
    <div class="panel">
      <h2>📜 오늘의 말씀</h2>
      <p class="sub">Firebase에 등록된 모든 말씀을 불러와 페이지 단위로 보여줍니다. 사용함 상태의 말씀만 홈 화면에서 매일 날짜 기준으로 표시됩니다.</p>
      <div class="daily-verses-toolbar">
        <div class="left">
          <button class="btn primary" id="dvOpenCreate" type="button">+ 말씀 직접등록</button>
          <span class="daily-verses-summary"><span id="dvCount">0</span>개 등록됨</span>
        </div>
        <div class="right">
          <input class="field daily-verses-search" id="dvSearch" placeholder="구절/본문/메모 검색" />
          <select class="field" id="dvPageSize" style="width:auto;min-width:110px;">
            <option value="10">10개씩</option>
            <option value="20">20개씩</option>
            <option value="50">50개씩</option>
          </select>
        </div>
      </div>
      <div class="dv-status-line" id="dvStatus"></div>
      <div class="dv-table-wrap" id="dvList"></div>
      <div class="dv-pager" id="dvPager"></div>
    </div>`;
  content.appendChild(pane);

  ensureLayer();

  nav.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
    document.querySelectorAll('.pane').forEach((p) => p.classList.remove('active'));
    nav.classList.add('active');
    pane.classList.add('active');
    document.dispatchEvent(new CustomEvent('namsan:dailyVersesPaneShown'));
  });

  document.getElementById('dvOpenCreate')?.addEventListener('click', () => openEditor());
  bindSaveButton();
}

function ensureLayer() {
  if (document.getElementById('dailyVerseEditorLayer')) return;
  const layer = document.createElement('div');
  layer.id = 'dailyVerseEditorLayer';
  layer.className = 'daily-verses-layer';
  layer.innerHTML = `
    <div class="daily-verses-dialog" role="dialog" aria-modal="true" aria-labelledby="dvEditorTitle">
      <div class="daily-verses-dialog-head">
        <div>
          <h3 id="dvEditorTitle">오늘의 말씀 직접등록</h3>
          <p>날짜를 지정하면 그날 해당 말씀이 표시됩니다. 날짜 없이 등록하면 순환 말씀에 포함됩니다.</p>
        </div>
        <button class="daily-verses-close" type="button" id="dvEditorClose" aria-label="닫기">×</button>
      </div>
      <div class="grid-2">
        <div><label>성경 구절</label><input class="field" id="dvRef" placeholder="예: 시편 23:1"/></div>
        <div><label>표시 상태</label><select class="field" id="dvActive"><option value="true">사용함</option><option value="false">숨김</option></select></div>
      </div>
      <div class="grid-2" style="margin-top:0;">
        <div>
          <label>표시 날짜 <span style="font-weight:500;color:var(--muted,#767a83);">(이 날 표시 · 선택)</span></label>
          <input class="field" type="date" id="dvDate" />
        </div>
        <div style="display:flex;align-items:flex-end;padding-bottom:2px;">
          <button class="btn btn-sm" type="button" id="dvDateToday" style="white-space:nowrap;">오늘로 설정</button>
        </div>
      </div>
      <label>말씀 본문</label>
      <textarea class="field" id="dvText" placeholder="예: 여호와는 나의 목자시니 내게 부족함이 없으리로다" style="min-height:130px;"></textarea>
      <label>메모 (관리자용 · 선택)</label>
      <input class="field" id="dvNote" placeholder="예: 새가족 주간 / 위로 말씀"/>
      <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;margin-top:16px;">
        <span id="dvEditorStatus" style="font-size:12.5px;font-weight:800;color:var(--muted);margin-right:auto;"></span>
        <button class="btn" id="dvCancel" type="button">취소</button>
        <button class="btn primary" id="dvSave" type="button">저장</button>
      </div>
    </div>`;
  document.body.appendChild(layer);

  document.getElementById('dvEditorClose')?.addEventListener('click', closeEditor);
  document.getElementById('dvDateToday')?.addEventListener('click', () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const el = document.getElementById('dvDate');
    if (el) el.value = `${y}-${m}-${d}`;
  });
  document.getElementById('dvCancel')?.addEventListener('click', closeEditor);
  layer.addEventListener('click', (e) => {
    if (e.target === layer) closeEditor();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && layer.classList.contains('show')) closeEditor();
  });
}

function setStatus(msg, error = false) {
  const statusTargets = [document.getElementById('dvEditorStatus'), document.getElementById('dvStatus')].filter(Boolean);
  statusTargets.forEach((el) => {
    el.textContent = msg || '';
    el.style.color = error ? 'var(--danger,#d05656)' : 'var(--primary,#73926d)';
  });
  if (msg) setTimeout(() => {
    statusTargets.forEach((el) => { if (el.textContent === msg) el.textContent = ''; });
  }, 3500);
}

function clearForm() {
  ['dvRef', 'dvText', 'dvNote', 'dvDate'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const activeInput = document.getElementById('dvActive');
  if (activeInput) activeInput.value = 'true';
  currentEditingId = '';
  const title = document.getElementById('dvEditorTitle');
  const saveBtn = document.getElementById('dvSave');
  if (title) title.textContent = '오늘의 말씀 직접등록';
  if (saveBtn) saveBtn.textContent = '저장';
}

function openEditor(item = null) {
  ensureLayer();
  clearForm();
  if (item) {
    currentEditingId = item.id || '';
    const title = document.getElementById('dvEditorTitle');
    const saveBtn = document.getElementById('dvSave');
    if (title) title.textContent = '오늘의 말씀 수정';
    if (saveBtn) saveBtn.textContent = '수정 저장';
    const refInput = document.getElementById('dvRef');
    const textInput = document.getElementById('dvText');
    const noteInput = document.getElementById('dvNote');
    const activeInput = document.getElementById('dvActive');
    if (refInput) refInput.value = item.ref || item.reference || item.verseRef || '';
    if (textInput) textInput.value = item.text || item.verseText || item.content || item.body || '';
    if (noteInput) noteInput.value = item.note || '';
    if (activeInput) activeInput.value = item.active === false ? 'false' : 'true';
    const dateInput = document.getElementById('dvDate');
    if (dateInput) dateInput.value = item.date || '';
  }
  const layer = document.getElementById('dailyVerseEditorLayer');
  layer?.classList.add('show');
  setTimeout(() => document.getElementById('dvRef')?.focus(), 50);
}

function closeEditor() {
  document.getElementById('dailyVerseEditorLayer')?.classList.remove('show');
  clearForm();
}

function bindSaveButton() {
  if (saveBound) return;
  const saveBtn = document.getElementById('dvSave');
  if (!saveBtn) return;
  saveBound = true;

  saveBtn.addEventListener('click', async () => {
    const verseRef = document.getElementById('dvRef')?.value.trim() || '';
    const text = document.getElementById('dvText')?.value.trim() || '';
    const note = document.getElementById('dvNote')?.value.trim() || '';
    const active = (document.getElementById('dvActive')?.value || 'true') !== 'false';
    const dateVal = document.getElementById('dvDate')?.value || '';
    if (!verseRef) { setStatus('성경 구절을 입력해주세요.', true); return; }
    if (!text) { setStatus('말씀 본문을 입력해주세요.', true); return; }
    saveBtn.disabled = true;
    setStatus(currentEditingId ? '수정 저장 중...' : '저장 중...');
    try {
      const payload = {
        ref: verseRef,
        text,
        note,
        active,
        date: dateVal || null,
        updatedAt: Date.now(),
        updatedBy: auth.currentUser?.uid || ''
      };
      if (currentEditingId) {
        await update(ref(db, `dailyVerses/${currentEditingId}`), payload);
        setStatus('수정되었습니다.');
      } else {
        await push(ref(db, 'dailyVerses'), {
          ...payload,
          createdAt: Date.now(),
          createdBy: auth.currentUser?.uid || ''
        });
        setStatus('등록되었습니다.');
      }
      closeEditor();
    } catch (e) {
      console.error('[daily-verses] 저장 실패:', e);
      setStatus('저장 실패: ' + (e.code || e.message), true);
    } finally {
      saveBtn.disabled = false;
    }
  });
}

function scheduleAdminInject() {
  if (!isAdminPage()) return;
  injectAdminMenu();
  [300, 800, 1600, 3000].forEach((ms) => setTimeout(injectAdminMenu, ms));
}

document.addEventListener('namsan:openDailyVerseEditor', (e) => openEditor(e.detail || null));

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleAdminInject);
else scheduleAdminInject();
onAuthStateChanged(auth, () => {
  if (isAdminPage()) setTimeout(() => { scheduleAdminInject(); bindSaveButton(); }, 500);
});
