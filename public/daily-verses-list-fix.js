/* =============================================================
 * 오늘의 말씀 관리자 전체 목록 + 페이지 기능
 * - Firebase dailyVerses 전체 데이터를 실시간 구독
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

function status(msg, error = false) {
  const el = document.getElementById('dvStatus') || document.getElementById('dvSeedStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = error ? 'var(--danger, #d05656)' : 'var(--primary, #73926d)';
  if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3500);
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
  if (controlsBound) return;
  const search = document.getElementById('dvSearch');
  const size = document.getElementById('dvPageSize');
  if (!search || !size) return;
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
  bindControls();
  const list = document.getElementById('dvList');
  if (!list) return;

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
  list.innerHTML = `<table><thead><tr><th style="width:58px;">번호</th><th>상태</th><th>구절</th><th>본문</th><th>등록/수정일</th><th style="width:176px;">관리</th></tr></thead><tbody>${rows.map((v, idx) => `
    <tr>
      <td>${startNo + idx + 1}</td>
      <td>${v.active === false ? '<span class="pill">숨김</span>' : '<span class="pill" style="background:var(--primary-soft);color:var(--primary-dark);">사용</span>'}</td>
      <td><b>${escapeHtml(refOf(v))}</b>${v.note ? `<br/><span style="color:var(--muted);font-size:11.5px;">${escapeHtml(v.note)}</span>` : ''}</td>
      <td class="dv-verse-text">${escapeHtml(textOf(v))}</td>
      <td>${fmt(v.updatedAt || v.createdAt)}</td>
      <td><div class="dv-actions">
        <button class="btn btn-sm" data-dv-edit="${v.id}">수정</button>
        <button class="btn btn-sm" data-dv-toggle="${v.id}">${v.active === false ? '사용' : '숨김'}</button>
        <button class="btn btn-sm danger" data-dv-delete="${v.id}">삭제</button>
      </div></td>
    </tr>`).join('')}</tbody></table>`;

  list.querySelectorAll('[data-dv-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = items.find((v) => v.id === btn.dataset.dvEdit);
      if (!item) return;
      document.dispatchEvent(new CustomEvent('namsan:openDailyVerseEditor', { detail: { ...item, ref: refOf(item), text: textOf(item) } }));
    });
  });

  list.querySelectorAll('[data-dv-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = items.find((v) => v.id === btn.dataset.dvToggle);
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
      const item = items.find((v) => v.id === btn.dataset.dvDelete);
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
    const arr = [];
    snap.forEach((c) => arr.push({ id: c.key, ...c.val() }));
    items = arr.sort((a, b) => (Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)) || String(b.id || '').localeCompare(String(a.id || '')));
    scheduleRender();
  }, (err) => status('말씀 목록 읽기 실패: ' + (err.code || err.message), true));
}

function boot() {
  if (!isAdminPage()) return;
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
