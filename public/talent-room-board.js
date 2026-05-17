import { db, auth } from '/firebase-init.js';
import { ref, onValue, push, remove, get } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

function isAdminPage() {
  return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
}

if (isAdminPage()) {
  document.getElementById('trbModal')?.remove();
} else {
  let me = null;
  let isAdm = false;
  let rooms = [];
  let boards = {};
  let active = '';
  let timer = null;

  const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  const esc = (v) => String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const owner = (r) =>
    r.createdBy || r.createdByUid || r.creatorUid ||
    r.authorUid || r.userUid || r.ownerUid ||
    r.hostUid || r.leaderUid || r.uid || '';
  const writable = (r) => !!me && !!r && (isAdm || owner(r) === me.uid);
  const boardItems = (id) =>
    Object.entries(boards[id] || {})
      .map(([pid, v]) => ({ id: pid, ...v }))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  function msg(t) {
    if (window.toast) window.toast(t);
    else alert(t);
  }

  function injectStyles() {
    if (document.getElementById('trbCss')) return;
    const s = document.createElement('style');
    s.id = 'trbCss';
    s.textContent = `
      .trb-btn {
        display: inline-flex; margin: 8px 6px 0 0; padding: 7px 11px;
        border: 1px solid var(--line, #e8e8e8); border-radius: 999px;
        background: var(--paper, #fff); font-size: 12.5px; font-weight: 900; cursor: pointer;
      }
      .trb-btn.on { background: var(--primary-soft, #eef4ea); color: var(--primary-dark, #5d7858); }
      .trb-list { display: grid; gap: 10px; margin-top: 12px; max-height: 42vh; overflow: auto; }
      .trb-item { border: 1px solid var(--line, #e8e8e8); border-radius: 14px; padding: 13px; background: var(--paper, #fff); }
      .trb-body { white-space: pre-wrap; font-size: 13px; line-height: 1.55; margin-top: 6px; }
      .trb-meta { font-size: 11.5px; color: var(--muted, #777); margin-top: 8px; }
      .trb-empty {
        border: 1px dashed var(--line, #e8e8e8); border-radius: 14px;
        padding: 16px; text-align: center; color: var(--muted, #777); font-weight: 800;
      }
      .trb-form { display: none; margin-top: 12px; border-top: 1px solid var(--line, #e8e8e8); padding-top: 12px; }
      .trb-form.show { display: block; }
    `;
    document.head.appendChild(s);
  }

  function ensureModal() {
    let m = document.getElementById('trbModal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'trbModal';
    m.className = 'modal-bg';
    m.innerHTML = `
      <div class="modal">
        <div class="modal-grip"></div>
        <div class="modal-head">
          <div>
            <h3 id="trbTitle">방 공지</h3>
            <p class="sub" id="trbSub" style="font-size:12px;color:var(--muted);margin-top:4px;">개설자 안내를 확인하세요</p>
          </div>
          <button class="close-btn" id="trbClose" type="button">×</button>
        </div>
        <div id="trbList" class="trb-list"></div>
        <div id="trbForm" class="trb-form">
          <label>제목</label>
          <input class="field" id="trbFormTitle" placeholder="예: 이번 주 준비물 안내">
          <label>내용</label>
          <textarea class="field" id="trbFormBody" style="min-height:110px;" placeholder="방 참여자에게 알릴 내용을 적어주세요"></textarea>
          <button class="submit-btn" type="button" id="trbSave">저장</button>
        </div>
        <button class="btn primary" type="button" id="trbWrite" style="display:none;width:100%;margin-top:12px;">공지 작성</button>
      </div>`;
    document.body.appendChild(m);
    document.getElementById('trbClose').onclick = closeModal;
    document.getElementById('trbWrite').onclick = showForm;
    document.getElementById('trbSave').onclick = save;
    m.onclick = (e) => { if (e.target === m) closeModal(); };
    return m;
  }

  function openModal(id) {
    const r = rooms.find((x) => x.id === id);
    if (!r) return;
    active = id;
    ensureModal();
    document.getElementById('trbTitle').textContent = (r.title || '재능나눔방') + ' 공지';
    document.getElementById('trbSub').textContent = writable(r)
      ? '개설자 공지를 작성할 수 있습니다'
      : '개설자 안내를 확인하세요';
    hideForm();
    renderModal();
    document.getElementById('trbModal').classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    const m = document.getElementById('trbModal');
    if (m) m.classList.remove('show');
    document.body.style.overflow = '';
    active = '';
  }

  function showForm() {
    document.getElementById('trbForm').classList.add('show');
    document.getElementById('trbWrite').style.display = 'none';
    document.getElementById('trbFormTitle').value = '';
    document.getElementById('trbFormBody').value = '';
  }

  function hideForm() {
    const f = document.getElementById('trbForm');
    if (f) f.classList.remove('show');
    const r = rooms.find((x) => x.id === active);
    const b = document.getElementById('trbWrite');
    if (b) b.style.display = writable(r) ? '' : 'none';
  }

  function renderModal() {
    if (!active) return;
    const r = rooms.find((x) => x.id === active);
    const list = document.getElementById('trbList');
    if (!r || !list) return;

    const arr = boardItems(active);
    const wb = document.getElementById('trbWrite');
    const formVisible = document.getElementById('trbForm')?.classList.contains('show');
    if (wb) wb.style.display = writable(r) && !formVisible ? '' : 'none';

    if (!arr.length) {
      list.innerHTML = '<div class="trb-empty">아직 등록된 방 공지가 없습니다.</div>';
      return;
    }

    list.innerHTML = arr.map((p) => `
      <div class="trb-item">
        <b>${esc(p.title || '공지')}</b>
        <div class="trb-body">${esc(p.body || '')}</div>
        <div class="trb-meta">
          ${esc(p.authorName || '개설자')} · ${p.timestamp ? new Date(p.timestamp).toLocaleString('ko-KR') : ''}
        </div>
        ${writable(r) ? `<button class="btn btn-sm danger" data-trb-del="${p.id}">삭제</button>` : ''}
      </div>`).join('');

    list.querySelectorAll('[data-trb-del]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('삭제할까요?')) return;
        try {
          await remove(ref(db, `roomBoards/${active}/${b.dataset.trbDel}`));
          msg('삭제되었습니다');
        } catch (e) {
          msg('삭제 실패: ' + (e.code || e.message));
        }
      };
    });
  }

  async function save() {
    const r = rooms.find((x) => x.id === active);
    if (!writable(r)) return msg('방 개설자 또는 관리자만 작성할 수 있습니다');
    const title = document.getElementById('trbFormTitle').value.trim();
    const body = document.getElementById('trbFormBody').value.trim();
    if (!title || !body) return msg('제목과 내용을 입력해주세요');
    try {
      await push(ref(db, `roomBoards/${active}`), {
        title,
        body,
        authorUid: me.uid,
        authorName: me.displayName || me.email || '개설자',
        timestamp: Date.now()
      });
      hideForm();
      msg('등록되었습니다');
    } catch (e) {
      msg('저장 실패: ' + (e.code || e.message));
    }
  }

  function renderButtons() {
    rooms.filter((r) => r.id && r.title && r.approved !== false).forEach((r) => {
      const title = norm(r.title);
      const cnt = boardItems(r.id).length;
      document.querySelectorAll('article, section, li, .card, .room-card, .talent-card, .post-card, .panel').forEach((el) => {
        if (el.closest('#trbModal') || el.querySelector(`[data-trb="${r.id}"]`)) return;
        const t = norm(el.textContent);
        if (!t.includes(title) || t.length > 1400) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'trb-btn' + (cnt ? ' on' : '');
        b.dataset.trb = r.id;
        b.textContent = cnt ? '방 공지 ' + cnt : '방 공지';
        b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openModal(r.id); };
        el.appendChild(b);
      });
    });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { renderButtons(); renderModal(); }, 180);
  }

  onAuthStateChanged(auth, async (u) => {
    me = u;
    if (u) {
      try { isAdm = (await get(ref(db, `admins/${u.uid}`))).exists(); } catch { isAdm = false; }
    } else {
      isAdm = false;
    }
    schedule();
  });

  onValue(ref(db, 'rooms'), (s) => {
    const a = [];
    s.forEach((c) => a.push({ id: c.key, ...c.val() }));
    rooms = a;
    schedule();
  });

  onValue(ref(db, 'roomBoards'), (s) => {
    boards = s.val() || {};
    schedule();
  });

  injectStyles();
  ensureModal();

  const start = () => {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
