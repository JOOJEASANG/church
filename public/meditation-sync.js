/* 오늘의 말씀 ↔ 오늘의 묵상 동기화
 * - 말씀 표시는 daily-verse-final.js를 신뢰 (window.__namsanTodayVerse)
 * - 자체 Firebase 구독 없음 (중복 제거)
 */
import { db, auth } from '/firebase-init.js';
import { ref, push } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

let modal = null;
let lastSynced = '';

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isAdminPage() { return location.pathname === '/admin' || location.pathname.startsWith('/admin/'); }

function notify(msg) {
  if (typeof window.toast === 'function') return window.toast(msg);
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;left:50%;bottom:86px;transform:translateX(-50%);z-index:9999;background:#15171a;color:#fff;padding:10px 14px;border-radius:999px;font-size:13px;font-weight:800;box-shadow:0 10px 28px rgba(0,0,0,.22);max-width:calc(100% - 32px);text-align:center;';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2300);
}

function current() {
  const v = window.__namsanTodayVerse;
  if (v && v.text) return { ...v, date: v.date || todayKey() };
  // 폴백: verse-card 직접 읽기
  const textEl = document.querySelector('.verse-card .verse-text, #verseText, #dailyVerseText, [data-daily-verse-text]');
  const refEl = document.querySelector('.verse-card .verse-ref, #verseRef, #dailyVerseRef, [data-daily-verse-ref]');
  const text = (textEl?.textContent || '').trim();
  const refText = (refEl?.textContent || '').trim();
  if (!text) return null;
  return { id: '', ref: refText || '오늘의 말씀', text, date: todayKey(), source: 'verseCardDom' };
}

function ensureModal() {
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'managedMeditationModal';
  modal.className = 'modal-bg';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-grip"></div>
      <div class="modal-head">
        <div>
          <h3>오늘의 묵상</h3>
          <p class="sub" style="font-size:12px;color:var(--muted);margin-top:4px;">오늘의 말씀과 함께 묵상을 남겨보세요</p>
        </div>
        <button class="close-btn" type="button" data-close>×</button>
      </div>
      <div style="background:var(--bg-2,#f4f1ea);border:1px solid var(--line,#ebece8);border-radius:14px;padding:14px 15px;margin-bottom:12px;">
        <div data-ref style="font-size:12px;font-weight:900;color:var(--primary,#73926d);margin-bottom:7px;"></div>
        <div data-text style="font-size:14px;font-weight:700;line-height:1.55;color:var(--text,#15171a);"></div>
      </div>
      <label>묵상 내용</label>
      <textarea class="field" id="managedMeditationNote" placeholder="오늘 말씀을 붙들고 떠오른 감사, 기도, 결단을 적어보세요" style="min-height:130px;"></textarea>
      <button class="submit-btn" type="button" id="managedMeditationSave">묵상 저장</button>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  modal.querySelector('#managedMeditationSave').addEventListener('click', save);
  return modal;
}

function openModal() {
  const v = current();
  if (!v) return false;
  const m = ensureModal();
  m.querySelector('[data-ref]').textContent = v.ref;
  m.querySelector('[data-text]').textContent = v.text;
  const n = m.querySelector('#managedMeditationNote');
  n.value = '';
  m.classList.add('show');
  document.body.style.overflow = 'hidden';
  setTimeout(() => n.focus(), 80);
  return true;
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove('show');
  document.body.style.overflow = '';
}

async function save() {
  const user = auth.currentUser;
  if (!user) return notify('로그인 후 사용할 수 있습니다');
  const v = current();
  const n = document.getElementById('managedMeditationNote');
  const note = (n?.value || '').trim();
  if (!note) { n?.focus(); return notify('묵상 내용을 입력해주세요'); }
  const btn = document.getElementById('managedMeditationSave');
  btn.disabled = true;
  btn.textContent = '저장 중...';
  try {
    await push(ref(db, `userNotes/${user.uid}`), {
      title: '오늘의 묵상',
      body: note, note, content: note,
      verseRef: v?.ref || '', verseText: v?.text || '',
      ref: v?.ref || '', text: v?.text || '',
      date: v?.date || todayKey(),
      source: v?.source || 'verseCardDom',
      timestamp: Date.now()
    });
    closeModal();
    notify('오늘의 묵상이 저장되었습니다');
  } catch (e) {
    notify('저장 실패: ' + (e.code || e.message));
  } finally {
    btn.disabled = false;
    btn.textContent = '묵상 저장';
  }
}

function syncOpenModals() {
  const v = current();
  if (!v) return;
  const fp = `${v.date}|${v.ref}|${v.text}`;
  if (fp === lastSynced) return;
  document.querySelectorAll('.modal-bg.show, .modal.show, [role="dialog"]').forEach((box) => {
    if (!/묵상|노트|말씀/.test(box.textContent || '')) return;
    box.querySelectorAll('.verse-ref, .note-verse-ref, .meditation-verse-ref, [data-note-verse-ref]').forEach((el) => { el.textContent = v.ref; });
    box.querySelectorAll('.verse-text, .note-verse-text, .meditation-verse-text, [data-note-verse-text]').forEach((el) => { el.textContent = v.text; });
  });
  lastSynced = fp;
}

document.addEventListener('namsan:todayVerseChanged', (e) => {
  if (e.detail) window.__namsanTodayVerse = e.detail;
  lastSynced = '';
  syncOpenModals();
});

if (!isAdminPage()) {
  document.addEventListener('click', (e) => {
    const v = current();
    if (!v) return;
    const t = e.target.closest('button,a,[role="button"],.verse-action-btn,.quick-action,.action-card');
    if (!t) return;
    const label = (t.textContent || t.getAttribute('aria-label') || t.title || '').trim();
    if (!/오늘의\s*묵상|묵상\s*쓰기|묵상/.test(label)) return;
    if (!t.closest('.verse-card, #home, [data-tab="home"], .tab-pane.active')) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    openModal();
  }, true);
}
