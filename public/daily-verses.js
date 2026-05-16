/* =============================================================
 * 오늘의 말씀 관리자 메뉴 (입력 폼 + 사이드바 진입점 주입)
 * - 사용자 화면 표시는 daily-verse-final.js 단독 담당
 * - 관리자 목록 렌더링은 daily-verses-list-fix.js 단독 담당
 * ============================================================= */

import { db, auth } from '/firebase-init.js';
import { ref, push, update } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

let adminInjected = false;
let adminBound = false;

function isAdminPage() {
  return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
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
      <h2>📜 오늘의 말씀 등록</h2>
      <p class="sub">관리자가 시간 날 때 성경구절을 여러 개 등록해두면, 홈 화면에서 매일 하나씩 날짜 기준으로 표시됩니다.</p>
      <div class="grid-2">
        <div><label>성경 구절</label><input class="field" id="dvRef" placeholder="예: 시편 23:1"/></div>
        <div><label>표시 상태</label><select class="field" id="dvActive"><option value="true">사용함</option><option value="false">숨김</option></select></div>
      </div>
      <label>말씀 본문</label>
      <textarea class="field" id="dvText" placeholder="예: 여호와는 나의 목자시니 내게 부족함이 없으리로다" style="min-height:110px;"></textarea>
      <label>메모 (관리자용 · 선택)</label>
      <input class="field" id="dvNote" placeholder="예: 새가족 주간 / 위로 말씀"/>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px;">
        <button class="btn primary" id="dvSave" type="button">말씀 저장</button>
        <button class="btn" id="dvCancel" type="button" style="display:none;">수정 취소</button>
        <span id="dvStatus" style="font-size:12.5px;font-weight:700;color:var(--muted);"></span>
      </div>
    </div>
    <div class="panel">
      <h2>등록된 말씀</h2>
      <p class="sub"><span id="dvCount">0</span>개 등록됨 · 숨김 처리한 말씀은 홈 화면 표시 대상에서 제외됩니다.</p>
      <div id="dvList" style="overflow-x:auto;"></div>
    </div>`;
  content.appendChild(pane);

  nav.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
    document.querySelectorAll('.pane').forEach((p) => p.classList.remove('active'));
    nav.classList.add('active');
    pane.classList.add('active');
  });

  bindSaveButton();
}

function setStatus(msg, color = 'var(--muted)') {
  const el = document.getElementById('dvStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color;
  if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3500);
}

function clearForm() {
  const saveBtn = document.getElementById('dvSave');
  const cancelBtn = document.getElementById('dvCancel');
  if (saveBtn) {
    delete saveBtn.dataset.editingId;
    saveBtn.textContent = '말씀 저장';
  }
  if (cancelBtn) cancelBtn.style.display = 'none';
  ['dvRef', 'dvText', 'dvNote'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
  const activeInput = document.getElementById('dvActive');
  if (activeInput) activeInput.value = 'true';
}

function bindSaveButton() {
  if (!auth.currentUser || adminBound) return;
  const saveBtn = document.getElementById('dvSave');
  const cancelBtn = document.getElementById('dvCancel');
  if (!saveBtn) return;
  adminBound = true;

  cancelBtn?.addEventListener('click', clearForm);

  saveBtn.addEventListener('click', async () => {
    // 수정 모드(editingId가 있을 때)는 daily-verses-list-fix.js가 capture로 처리
    if (saveBtn.dataset.editingId) return;
    const verseRef = document.getElementById('dvRef')?.value.trim() || '';
    const text = document.getElementById('dvText')?.value.trim() || '';
    const note = document.getElementById('dvNote')?.value.trim() || '';
    const active = (document.getElementById('dvActive')?.value || 'true') !== 'false';
    if (!verseRef) { setStatus('성경 구절을 입력해주세요.', 'var(--danger)'); return; }
    if (!text) { setStatus('말씀 본문을 입력해주세요.', 'var(--danger)'); return; }
    saveBtn.disabled = true;
    setStatus('저장 중...');
    try {
      await push(ref(db, 'dailyVerses'), {
        ref: verseRef, text, note, active,
        createdAt: Date.now(), updatedAt: Date.now(),
        createdBy: auth.currentUser?.uid || '', updatedBy: auth.currentUser?.uid || ''
      });
      setStatus('등록되었습니다.', 'var(--primary)');
      clearForm();
    } catch (e) {
      console.error('[daily-verses] 등록 실패:', e);
      setStatus('저장 실패: ' + (e.code || e.message), 'var(--danger)');
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

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleAdminInject);
else scheduleAdminInject();
onAuthStateChanged(auth, () => {
  if (isAdminPage()) setTimeout(() => { scheduleAdminInject(); bindSaveButton(); }, 500);
});
