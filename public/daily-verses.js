/* =============================================================
 * 관리자 등록 말씀 → 홈 오늘의 말씀 표시 + 관리자 메뉴
 * ============================================================= */

import { db, auth } from '/firebase-init.js';
import { ref, onValue, push, update, remove } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

let managedVerseItems = [];
let managedVerseStarted = false;
let managedVerseObserver = null;

function escapeHtmlLocal(v) {
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function todaySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function seededIndex(len) {
  if (!len) return 0;
  let x = (todaySeed() ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  x = (x ^ (x >>> 16)) >>> 0;
  return x % len;
}

function pickManagedDailyVerse() {
  const active = managedVerseItems
    .filter((v) => v && v.text && v.active !== false)
    .sort((a, b) => String(a.ref || '').localeCompare(String(b.ref || '')) || String(a.id).localeCompare(String(b.id)));
  return active.length ? active[seededIndex(active.length)] : null;
}

function getVerseEls() {
  return {
    text: document.querySelector('.verse-card .verse-text, #dailyVerseText, [data-daily-verse-text]'),
    ref: document.querySelector('.verse-card .verse-ref, #dailyVerseRef, [data-daily-verse-ref]'),
    label: document.querySelector('.verse-card .verse-label')
  };
}

function applyManagedDailyVerse() {
  const verse = pickManagedDailyVerse();
  if (!verse) return false;
  const els = getVerseEls();
  if (!els.text || !els.ref) return false;
  els.text.textContent = verse.text;
  els.ref.textContent = verse.ref || '오늘의 말씀';
  if (els.label) els.label.textContent = 'TODAY VERSE';
  return true;
}

function observeVerseCard() {
  if (managedVerseObserver) return;
  const card = document.querySelector('.verse-card');
  if (!card) return;
  managedVerseObserver = new MutationObserver(() => {
    const verse = pickManagedDailyVerse();
    if (!verse) return;
    const els = getVerseEls();
    if (!els.text || !els.ref) return;
    if (els.text.textContent !== verse.text || els.ref.textContent !== (verse.ref || '오늘의 말씀')) {
      requestAnimationFrame(applyManagedDailyVerse);
    }
  });
  managedVerseObserver.observe(card, { childList: true, subtree: true, characterData: true });
}

function scheduleManagedVerseApply() {
  applyManagedDailyVerse();
  [250, 800, 1600, 3000].forEach((ms) => setTimeout(() => {
    applyManagedDailyVerse();
    observeVerseCard();
  }, ms));
}

function startManagedDailyVerse() {
  if (managedVerseStarted) return;
  managedVerseStarted = true;
  onValue(ref(db, 'dailyVerses'), (snap) => {
    const items = [];
    snap.forEach((c) => items.push({ id: c.key, ...c.val() }));
    managedVerseItems = items;
    scheduleManagedVerseApply();
  }, (err) => console.warn('[daily-verses] 읽기 실패:', err.code || err.message));

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleManagedVerseApply();
  });
}

onAuthStateChanged(auth, (user) => { if (user) startManagedDailyVerse(); });

let adminInjected = false;
let adminBound = false;
let adminItems = [];

function isAdminPage() {
  return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
}

function fmtDateTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function injectAdminMenu() {
  if (!isAdminPage() || adminInjected) return;
  const sidebar = document.querySelector('.sidebar');
  const content = document.querySelector('.content');
  if (!sidebar || !content) return;
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
      <p class="sub">관리자가 시간 날 때 성경구절을 여러 개 등록해두면, 홈 화면에서 매일 하나씩 날짜 기준 랜덤으로 표시됩니다.</p>
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
      <p class="sub"><span id="dvCount">0</span>개 등록됨 · 숨김 처리한 말씀은 홈 화면 랜덤 대상에서 제외됩니다.</p>
      <div id="dvList" style="overflow-x:auto;"></div>
    </div>`;
  content.appendChild(pane);

  nav.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
    document.querySelectorAll('.pane').forEach((p) => p.classList.remove('active'));
    nav.classList.add('active');
    pane.classList.add('active');
  });

  bindAdminMenu();
}

function bindAdminMenu() {
  if (!auth.currentUser || adminBound) return;
  const saveBtn = document.getElementById('dvSave');
  const cancelBtn = document.getElementById('dvCancel');
  if (!saveBtn || !cancelBtn) return;
  adminBound = true;
  let editingId = null;

  function setStatus(msg, color = 'var(--muted)') {
    const el = document.getElementById('dvStatus');
    if (!el) return;
    el.textContent = msg;
    el.style.color = color;
    if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3500);
  }

  function clearForm() {
    editingId = null;
    document.getElementById('dvRef').value = '';
    document.getElementById('dvText').value = '';
    document.getElementById('dvNote').value = '';
    document.getElementById('dvActive').value = 'true';
    saveBtn.textContent = '말씀 저장';
    cancelBtn.style.display = 'none';
  }

  cancelBtn.addEventListener('click', clearForm);

  saveBtn.addEventListener('click', async () => {
    const verseRef = document.getElementById('dvRef').value.trim();
    const text = document.getElementById('dvText').value.trim();
    const note = document.getElementById('dvNote').value.trim();
    const active = document.getElementById('dvActive').value !== 'false';
    if (!verseRef) { setStatus('성경 구절을 입력해주세요.', 'var(--danger)'); return; }
    if (!text) { setStatus('말씀 본문을 입력해주세요.', 'var(--danger)'); return; }
    saveBtn.disabled = true;
    setStatus('저장 중...');
    try {
      const data = { ref: verseRef, text, note, active, updatedAt: Date.now(), updatedBy: auth.currentUser?.uid || '' };
      if (editingId) {
        await update(ref(db, `dailyVerses/${editingId}`), data);
        setStatus('수정되었습니다.', 'var(--primary)');
      } else {
        await push(ref(db, 'dailyVerses'), { ...data, createdAt: Date.now(), createdBy: auth.currentUser?.uid || '' });
        setStatus('등록되었습니다.', 'var(--primary)');
      }
      clearForm();
    } catch (e) {
      console.error('[daily-verses-admin] 저장 실패:', e);
      setStatus('저장 실패: ' + (e.code || e.message), 'var(--danger)');
    } finally {
      saveBtn.disabled = false;
    }
  });

  onValue(ref(db, 'dailyVerses'), (snap) => {
    const items = [];
    snap.forEach((c) => items.push({ id: c.key, ...c.val() }));
    adminItems = items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderAdminList({
      onEdit: (id) => {
        const item = adminItems.find((x) => x.id === id);
        if (!item) return;
        editingId = id;
        document.getElementById('dvRef').value = item.ref || '';
        document.getElementById('dvText').value = item.text || '';
        document.getElementById('dvNote').value = item.note || '';
        document.getElementById('dvActive').value = item.active === false ? 'false' : 'true';
        saveBtn.textContent = '수정 저장';
        cancelBtn.style.display = '';
        document.getElementById('dvRef').focus();
      },
      onDelete: async (id) => {
        const item = adminItems.find((x) => x.id === id);
        if (!item) return;
        if (!confirm(`"${item.ref || '말씀'}" 구절을 삭제할까요?`)) return;
        try { await remove(ref(db, `dailyVerses/${id}`)); setStatus('삭제되었습니다.', 'var(--primary)'); if (editingId === id) clearForm(); }
        catch (e) { setStatus('삭제 실패: ' + (e.code || e.message), 'var(--danger)'); }
      },
      onToggle: async (id) => {
        const item = adminItems.find((x) => x.id === id);
        if (!item) return;
        try { await update(ref(db, `dailyVerses/${id}`), { active: item.active === false, updatedAt: Date.now(), updatedBy: auth.currentUser?.uid || '' }); }
        catch (e) { setStatus('상태 변경 실패: ' + (e.code || e.message), 'var(--danger)'); }
      }
    });
  }, (err) => {
    console.warn('[daily-verses-admin] 읽기 실패:', err.code || err.message);
    const list = document.getElementById('dvList');
    if (list) list.innerHTML = '<div class="empty">말씀 목록을 읽을 수 없습니다. 관리자 권한 또는 DB 규칙을 확인해주세요.</div>';
  });
}

function renderAdminList(actions) {
  const list = document.getElementById('dvList');
  const count = document.getElementById('dvCount');
  if (!list) return;
  if (count) count.textContent = String(adminItems.length);
  if (!adminItems.length) {
    list.innerHTML = '<div class="empty">아직 등록된 말씀이 없습니다. 위에서 첫 말씀을 등록해주세요.</div>';
    return;
  }
  list.innerHTML = `<table><thead><tr><th>상태</th><th>구절</th><th>본문</th><th>등록일</th><th></th></tr></thead><tbody>${adminItems.map((v) => `
    <tr>
      <td>${v.active === false ? '<span class="pill">숨김</span>' : '<span class="pill" style="background:var(--primary-soft);color:var(--primary-dark);">사용</span>'}</td>
      <td><b>${escapeHtmlLocal(v.ref || '')}</b>${v.note ? `<br/><span style="color:var(--muted);font-size:11.5px;">${escapeHtmlLocal(v.note)}</span>` : ''}</td>
      <td style="max-width:420px;white-space:pre-wrap;font-size:12.5px;">${escapeHtmlLocal(v.text || '')}</td>
      <td>${fmtDateTime(v.createdAt)}</td>
      <td><button class="btn btn-sm" data-dv-edit="${v.id}">수정</button> <button class="btn btn-sm" data-dv-toggle="${v.id}">${v.active === false ? '사용' : '숨김'}</button> <button class="btn btn-sm danger" data-dv-del="${v.id}">삭제</button></td>
    </tr>`).join('')}</tbody></table>`;
  list.querySelectorAll('[data-dv-edit]').forEach((b) => b.addEventListener('click', () => actions.onEdit(b.dataset.dvEdit)));
  list.querySelectorAll('[data-dv-toggle]').forEach((b) => b.addEventListener('click', () => actions.onToggle(b.dataset.dvToggle)));
  list.querySelectorAll('[data-dv-del]').forEach((b) => b.addEventListener('click', () => actions.onDelete(b.dataset.dvDel)));
}

function scheduleAdminInject() {
  if (!isAdminPage()) return;
  injectAdminMenu();
  [300, 800, 1600, 3000].forEach((ms) => setTimeout(injectAdminMenu, ms));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleAdminInject);
else scheduleAdminInject();
onAuthStateChanged(auth, () => {
  if (isAdminPage()) setTimeout(() => { scheduleAdminInject(); bindAdminMenu(); }, 500);
});
