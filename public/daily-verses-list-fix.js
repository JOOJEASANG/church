/* =============================================================
 * 오늘의 말씀 관리자 전체 목록 + 페이지 기능
 * - Firebase dailyVerses 전체 데이터를 실시간 구독
 * - 테이블 CSS 충돌 방지를 위해 카드형 리스트로 렌더링
 * - 검색 / 페이지 크기 / 페이지 이동
 * - 수정은 daily-verses.js 레이어창 호출
 * - 숨김/사용/삭제 후 자동 갱신
 * ============================================================= */

import { db, auth } from '/firebase-init.js';
import { ref, onValue, update, remove } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

let items = [];
let listenerStarted = false;
let renderTimer = null;
let currentPage = 1;
let pageSize = 10;
let searchText = '';
let controlsBound = false;

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

function injectListStyles() {
  if (document.getElementById('dailyVerseCardListStyles')) return;
  const style = document.createElement('style');
  style.id = 'dailyVerseCardListStyles';
  style.textContent = `
    #dvList.dv-card-list-wrap {
      overflow: visible !important;
      max-height: none !important;
      height: auto !important;
      display: block !important;
    }
    .dv-card-list {
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 10px !important;
      width: 100% !important;
      margin-top: 10px !important;
    }
    .dv-card-item {
      display: block !important;
      background: var(--paper, #fff) !important;
      border: 1px solid var(--line, #ebece8) !important;
      border-radius: 16px !important;
      padding: 14px 15px !important;
      box-shadow: 0 2px 10px rgba(20,22,26,.04) !important;
      overflow: visible !important;
      max-height: none !important;
      height: auto !important;
    }
    .dv-card-head {
      display: flex !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 12px !important;
      margin-bottom: 9px !important;
    }
    .dv-card-title {
      min-width: 0 !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      flex-wrap: wrap !important;
    }
    .dv-card-no {
      font-size: 12px !important;
      font-weight: 900 !important;
      color: var(--muted, #767a83) !important;
    }
    .dv-card-ref {
      font-size: 15px !important;
      font-weight: 950 !important;
      color: var(--text, #15171a) !important;
      letter-spacing: -0.35px !important;
    }
    .dv-card-pill {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      height: 24px !important;
      padding: 0 9px !important;
      border-radius: 999px !important;
      font-size: 11.5px !important;
      font-weight: 900 !important;
      background: var(--primary-soft, #eef5ec) !important;
      color: var(--primary-dark, #315b37) !important;
      white-space: nowrap !important;
    }
    .dv-card-pill.off {
      background: #f0f0f0 !important;
      color: #777 !important;
    }
    .dv-card-actions {
      display: flex !important;
      gap: 5px !important;
      flex-wrap: nowrap !important;
      white-space: nowrap !important;
      flex: 0 0 auto !important;
    }
    .dv-card-text {
      white-space: pre-wrap !important;
      line-height: 1.62 !important;
      font-size: 13.5px !important;
      color: var(--text, #15171a) !important;
      margin: 8px 0 10px !important;
      display: block !important;
      max-height: none !important;
      overflow: visible !important;
    }
    .dv-card-meta {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      flex-wrap: wrap !important;
      color: var(--muted, #767a83) !important;
      font-size: 12px !important;
      font-weight: 750 !important;
    }
    .dv-pager { display:flex; align-items:center; justify-content:center; gap:6px; flex-wrap:wrap; margin-top:14px; }
    .dv-pager button { min-width:34px; height:34px; border-radius:10px; border:1px solid var(--line,#ebece8); background:var(--paper,#fff); cursor:pointer; font-weight:800; }
    .dv-pager button.active { background:var(--primary,#73926d); color:#fff; border-color:var(--primary,#73926d); }
    .dv-pager button:disabled { opacity:.45; cursor:not-allowed; }
    @media (max-width: 760px) {
      .dv-card-head { flex-direction: column !important; }
      .dv-card-actions { width: 100% !important; flex-wrap: wrap !important; }
    }
  `;
  document.head.appendChild(style);
}

function fmt(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function textOf(v) {
  return v.text || v.verseText || v.content || v.body || v.message || v.word || '';
}

function refOf(v) {
  return v.ref || v.reference || v.verseRef || v.bookChapterVerse || v.address || v.title || '';
}

function timestampOf(v) {
  const raw = v.updatedAt || v.createdAt || v.timestamp || v.date || 0;
  if (typeof raw === 'number') return raw;
  const t = new Date(String(raw)).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function status(msg, error = false) {
  const el = document.getElementById('dvStatus') || document.getElementById('dvSeedStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = error ? 'var(--danger, #d05656)' : 'var(--primary, #73926d)';
  if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3500);
}

function normalizeSnapshotValue(val) {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map((item, index) => item ? { id: String(index), ...item } : null).filter(Boolean);
  }
  return Object.entries(val).map(([id, item]) => ({ id, ...(item || {}) }));
}

function filteredItems() {
  const q = searchText.trim().toLowerCase();
  if (!q) return items;
  return items.filter((v) => `${refOf(v)} ${textOf(v)} ${v.note || ''}`.toLowerCase().includes(q));
}

function pageItems() {
  const list = filteredItems();
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * pageSize;
  return list.slice(start, start + pageSize);
}

function bindControls() {
  const search = document.getElementById('dvSearch');
  const size = document.getElementById('dvPageSize');
  if (!search || !size) return;
  if (controlsBound) return;
  controlsBound = true;

  search.addEventListener('input', () => {
    searchText = search.value || '';
    currentPage = 1;
    scheduleRender();
  });
  size.addEventListener('change', () => {
    pageSize = Number(size.value || 10) || 10;
    currentPage = 1;
    scheduleRender();
  });
}

function renderPager(total) {
  const pager = document.getElementById('dvPager');
  if (!pager) return;
  pager.className = 'dv-pager';
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) {
    pager.innerHTML = '';
    return;
  }

  const pages = [];
  const add = (p) => { if (p >= 1 && p <= totalPages && !pages.includes(p)) pages.push(p); };
  add(1);
  add(currentPage - 2);
  add(currentPage - 1);
  add(currentPage);
  add(currentPage + 1);
  add(currentPage + 2);
  add(totalPages);
  pages.sort((a, b) => a - b);

  let html = `<button type="button" data-dv-page="prev" ${currentPage <= 1 ? 'disabled' : ''}>‹</button>`;
  let prev = 0;
  for (const p of pages) {
    if (prev && p - prev > 1) html += `<span style="padding:0 3px;color:var(--muted);font-weight:800;">…</span>`;
    html += `<button type="button" class="${p === currentPage ? 'active' : ''}" data-dv-page="${p}">${p}</button>`;
    prev = p;
  }
  html += `<button type="button" data-dv-page="next" ${currentPage >= totalPages ? 'disabled' : ''}>›</button>`;
  pager.innerHTML = html;

  pager.querySelectorAll('[data-dv-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.dvPage;
      if (val === 'prev') currentPage -= 1;
      else if (val === 'next') currentPage += 1;
      else currentPage = Number(val || 1) || 1;
      scheduleRender();
    });
  });
}

function renderList() {
  if (!isAdminPage()) return;
  injectListStyles();
  bindControls();
  const list = document.getElementById('dvList');
  if (!list) return;
  list.className = 'dv-card-list-wrap';

  const filtered = filteredItems();
  const total = filtered.length;
  const count = document.getElementById('dvCount');
  if (count) count.textContent = String(items.length);

  if (!items.length) {
    list.innerHTML = '<div class="empty">아직 등록된 말씀이 없습니다. + 말씀 직접등록 버튼으로 등록해주세요.</div>';
    renderPager(0);
    return;
  }

  if (!filtered.length) {
    list.innerHTML = '<div class="empty">검색 결과가 없습니다.</div>';
    renderPager(0);
    return;
  }

  const rows = pageItems();
  const startNo = (currentPage - 1) * pageSize;
  list.innerHTML = `<div class="dv-card-list">${rows.map((v, idx) => {
    const no = startNo + idx + 1;
    const active = v.active !== false;
    return `
      <article class="dv-card-item" data-dv-card="${escapeHtml(v.id)}">
        <div class="dv-card-head">
          <div class="dv-card-title">
            <span class="dv-card-no">#${no}</span>
            <span class="dv-card-pill ${active ? '' : 'off'}">${active ? '사용' : '숨김'}</span>
            <span class="dv-card-ref">${escapeHtml(refOf(v) || '구절 없음')}</span>
          </div>
          <div class="dv-card-actions">
            <button class="btn btn-sm" type="button" data-dv-edit="${escapeHtml(v.id)}">수정</button>
            <button class="btn btn-sm" type="button" data-dv-toggle="${escapeHtml(v.id)}">${active ? '숨김' : '사용'}</button>
            <button class="btn btn-sm danger" type="button" data-dv-delete="${escapeHtml(v.id)}">삭제</button>
          </div>
        </div>
        <div class="dv-card-text">${escapeHtml(textOf(v) || '본문 없음')}</div>
        <div class="dv-card-meta">
          <span>등록/수정: ${escapeHtml(fmt(v.updatedAt || v.createdAt || v.timestamp))}</span>
          ${v.note ? `<span>메모: ${escapeHtml(v.note)}</span>` : ''}
        </div>
      </article>`;
  }).join('')}</div>`;

  list.querySelectorAll('[data-dv-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = items.find((v) => String(v.id) === String(btn.dataset.dvEdit));
      if (!item) return;
      document.dispatchEvent(new CustomEvent('namsan:openDailyVerseEditor', { detail: { ...item, ref: refOf(item), text: textOf(item) } }));
    });
  });

  list.querySelectorAll('[data-dv-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = items.find((v) => String(v.id) === String(btn.dataset.dvToggle));
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

  list.querySelectorAll('[data-dv-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = items.find((v) => String(v.id) === String(btn.dataset.dvDelete));
      if (!item) return;
      if (!confirm(`"${refOf(item) || '말씀'}" 구절을 삭제할까요?`)) return;
      try {
        await remove(ref(db, `dailyVerses/${item.id}`));
        status('삭제되었습니다.');
      } catch (err) {
        status('삭제 실패: ' + (err.code || err.message), true);
      }
    });
  });

  renderPager(total);
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderList, 80);
}

function startListener() {
  if (!isAdminPage() || listenerStarted) return;
  listenerStarted = true;
  onValue(ref(db, 'dailyVerses'), (snap) => {
    const val = snap.val();
    items = normalizeSnapshotValue(val)
      .sort((a, b) => (timestampOf(b) - timestampOf(a)) || String(b.id || '').localeCompare(String(a.id || '')));
    console.info('[daily-verses-list-fix] dailyVerses loaded:', items.length);
    scheduleRender();
  }, (err) => status('말씀 목록 읽기 실패: ' + (err.code || err.message), true));
}

function boot() {
  if (!isAdminPage()) return;
  injectListStyles();
  startListener();
  scheduleRender();
  [300, 800, 1600, 3000, 5000].forEach((ms) => setTimeout(scheduleRender, ms));
}

document.addEventListener('namsan:dailyVersesPaneShown', () => {
  currentPage = 1;
  scheduleRender();
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
onAuthStateChanged(auth, () => setTimeout(boot, 500));
