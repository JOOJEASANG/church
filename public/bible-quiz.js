/* 천안남산교회 성경퀴즈
 * 개인 퀴즈 · 공부 모드 · 직접 문제 출제 · 실시간 대회 · 초대 공유
 */
import { app, auth } from '/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-functions.js';

const functions = getFunctions(app, 'asia-northeast3');
const bibleQuizCall = httpsCallable(functions, 'bibleQuiz');

const quizState = {
  meta: null,
  category: '전체',
  count: 10,
  includeCustom: false,
  mode: 'quiz',
  sessionId: null,
  questions: [],
  current: 0,
  score: 0,
  answered: false,
  roomId: null,
  room: null,
  pollTimer: null,
  pendingRoomCode: new URL(location.href).searchParams.get('quizRoom') || ''
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function errorText(error) {
  const raw = error?.message || '잠시 후 다시 시도해주세요.';
  return raw.replace(/^FirebaseError:\s*/i, '').replace(/^functions\/[\w-]+:\s*/i, '');
}

async function api(action, payload = {}) {
  const result = await bibleQuizCall({ action, ...payload });
  return result.data || {};
}

function toast(message) {
  let el = document.getElementById('bqToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'bqToast';
    el.className = 'bq-toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 1800);
}

function injectStyles() {
  if (document.getElementById('bibleQuizStyles')) return;
  const style = document.createElement('style');
  style.id = 'bibleQuizStyles';
  style.textContent = `
    .bq-launch {
      margin: 16px 0 4px; padding: 0; border: 0; width: 100%; cursor: pointer;
      text-align: left; color: #fff; overflow: hidden; border-radius: 20px;
      background: linear-gradient(135deg, #182f52 0%, #22456f 55%, #8a6a31 140%);
      box-shadow: 0 8px 24px rgba(25,49,82,.18); position: relative;
    }
    .bq-launch::after { content:''; position:absolute; width:150px; height:150px; border-radius:50%; right:-48px; top:-58px; background:rgba(255,255,255,.08); }
    .bq-launch-inner { position:relative; z-index:1; display:flex; align-items:center; gap:14px; padding:18px 18px; }
    .bq-launch-icon { width:48px; height:48px; flex:0 0 48px; display:grid; place-items:center; border-radius:15px; background:rgba(255,255,255,.14); font-size:25px; }
    .bq-launch-copy { min-width:0; flex:1; }
    .bq-launch-copy b { display:block; font-size:17px; letter-spacing:-.4px; }
    .bq-launch-copy span { display:block; margin-top:3px; font-size:12px; opacity:.82; font-weight:600; }
    .bq-launch-arrow { font-size:25px; opacity:.8; }

    .bq-overlay { display:none; position:fixed; inset:0; z-index:10050; background:var(--bg,#fafaf7); color:var(--text,#15171a); overflow-y:auto; overscroll-behavior:contain; }
    .bq-overlay.show { display:block; }
    .bq-shell { width:100%; max-width:720px; min-height:100dvh; margin:0 auto; padding:0 16px 40px; }
    .bq-head { position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:10px; padding:calc(env(safe-area-inset-top,0px) + 12px) 0 12px; background:color-mix(in srgb,var(--bg,#fafaf7) 94%, transparent); backdrop-filter:blur(14px); }
    .bq-head-title { flex:1; font-size:18px; font-weight:900; letter-spacing:-.5px; }
    .bq-icon-btn { width:38px; height:38px; border:1px solid var(--line,#e5e5df); border-radius:12px; background:var(--paper,#fff); color:var(--text,#15171a); cursor:pointer; font-size:18px; display:grid; place-items:center; }
    .bq-hero { margin:10px 0 16px; padding:22px 20px; border-radius:22px; color:#fff; background:linear-gradient(145deg,#17365d,#2c557d 70%,#8c6c35 145%); box-shadow:0 12px 30px rgba(20,45,80,.18); }
    .bq-hero .eyebrow { font-size:11px; font-weight:800; letter-spacing:.7px; opacity:.72; }
    .bq-hero h2 { margin:7px 0 6px; font-size:23px; line-height:1.25; letter-spacing:-.7px; }
    .bq-hero p { margin:0; font-size:13px; line-height:1.55; opacity:.84; }
    .bq-stat-row { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:17px; }
    .bq-stat { background:rgba(255,255,255,.11); border:1px solid rgba(255,255,255,.11); border-radius:13px; padding:10px; }
    .bq-stat b { display:block; font-size:17px; }
    .bq-stat span { display:block; font-size:10px; margin-top:2px; opacity:.76; }

    .bq-settings { display:grid; grid-template-columns:1fr 100px; gap:9px; margin-bottom:12px; }
    .bq-field { width:100%; border:1px solid var(--line-strong,#d9dad4); border-radius:12px; padding:11px 12px; background:var(--paper,#fff); color:var(--text,#15171a); font-size:13px; outline:none; }
    .bq-field:focus { border-color:var(--primary,#73926d); box-shadow:0 0 0 3px rgba(115,146,109,.13); }
    .bq-check { display:flex; align-items:center; gap:8px; padding:10px 12px; margin:0 0 14px; border:1px solid var(--line,#ebece8); background:var(--paper,#fff); border-radius:12px; font-size:12.5px; color:var(--muted,#767a83); }
    .bq-check input { width:17px; height:17px; accent-color:var(--primary,#73926d); }

    .bq-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .bq-card { border:1px solid var(--line,#ebece8); background:var(--paper,#fff); border-radius:17px; padding:17px 15px; text-align:left; cursor:pointer; color:var(--text,#15171a); box-shadow:var(--shadow-xs,0 1px 2px rgba(0,0,0,.04)); }
    .bq-card:active { transform:translateY(1px); }
    .bq-card .ico { font-size:25px; margin-bottom:10px; }
    .bq-card b { display:block; font-size:15px; letter-spacing:-.3px; }
    .bq-card span { display:block; margin-top:5px; color:var(--muted,#767a83); font-size:11.5px; line-height:1.45; }
    .bq-card.featured { grid-column:1 / -1; background:linear-gradient(135deg,var(--primary-soft,#eef4ea),var(--paper,#fff)); }

    .bq-panel { background:var(--paper,#fff); border:1px solid var(--line,#ebece8); border-radius:18px; padding:18px; margin:10px 0; box-shadow:var(--shadow-xs,0 1px 2px rgba(0,0,0,.04)); }
    .bq-panel h3 { margin:0 0 5px; font-size:17px; letter-spacing:-.4px; }
    .bq-sub { color:var(--muted,#767a83); font-size:12px; line-height:1.5; margin:0 0 14px; }
    .bq-label { display:block; margin:12px 0 5px 2px; color:var(--muted,#767a83); font-size:11.5px; font-weight:800; }
    .bq-primary,.bq-secondary,.bq-danger { width:100%; border:0; border-radius:13px; padding:13px 14px; margin-top:10px; font-size:14px; font-weight:800; cursor:pointer; }
    .bq-primary { background:var(--primary,#73926d); color:#fff; }
    .bq-secondary { background:var(--bg-2,#f4f1ea); color:var(--text,#15171a); border:1px solid var(--line,#ebece8); }
    .bq-danger { background:#c84f4f; color:#fff; }
    .bq-primary:disabled,.bq-secondary:disabled { opacity:.55; cursor:wait; }
    .bq-row { display:flex; gap:8px; }
    .bq-row > * { flex:1; }

    .bq-progress { height:7px; border-radius:999px; background:var(--line,#ebece8); overflow:hidden; margin:10px 0 16px; }
    .bq-progress > div { height:100%; background:linear-gradient(90deg,var(--primary,#73926d),#c8a157); border-radius:999px; transition:width .25s; }
    .bq-qmeta { display:flex; justify-content:space-between; align-items:center; gap:8px; color:var(--muted,#767a83); font-size:11px; font-weight:700; margin-bottom:8px; }
    .bq-pill { padding:4px 8px; border-radius:999px; background:var(--primary-soft,#eef4ea); color:var(--primary-dark,#5d7858); font-size:10.5px; font-weight:800; }
    .bq-question { font-size:20px; font-weight:900; line-height:1.4; letter-spacing:-.5px; margin:9px 0 17px; }
    .bq-options { display:flex; flex-direction:column; gap:9px; }
    .bq-option { width:100%; display:flex; align-items:flex-start; gap:10px; border:1.5px solid var(--line-strong,#d9dad4); background:var(--paper,#fff); border-radius:14px; padding:12px 13px; color:var(--text,#15171a); font-size:13.5px; font-weight:700; text-align:left; cursor:pointer; line-height:1.45; }
    .bq-option .n { width:25px; height:25px; flex:0 0 25px; display:grid; place-items:center; border-radius:8px; background:var(--bg-2,#f4f1ea); font-size:11px; font-weight:900; }
    .bq-option.correct { border-color:#5c9a64; background:#edf7ef; color:#24512b; }
    .bq-option.wrong { border-color:#ce6464; background:#fbefef; color:#7c2929; }
    html[data-theme='dark'] .bq-option.correct { background:#223628; color:#bfe9c6; }
    html[data-theme='dark'] .bq-option.wrong { background:#3a2424; color:#f0bcbc; }
    .bq-explain { margin-top:14px; padding:14px; border-radius:14px; background:var(--bg-2,#f4f1ea); font-size:12.5px; line-height:1.6; }
    .bq-explain b { display:block; margin-bottom:5px; color:var(--primary-dark,#5d7858); }
    .bq-result { text-align:center; padding:28px 16px; }
    .bq-result .score { font-size:48px; font-weight:950; letter-spacing:-2px; color:var(--primary-dark,#5d7858); }
    .bq-result h3 { font-size:21px; margin:8px 0 5px; }

    .bq-code { font-size:31px; font-weight:950; letter-spacing:5px; text-align:center; padding:15px 8px; border-radius:15px; background:var(--bg-2,#f4f1ea); color:var(--primary-dark,#5d7858); }
    .bq-people { display:flex; flex-direction:column; gap:7px; margin-top:12px; }
    .bq-person { display:flex; align-items:center; gap:9px; padding:10px 11px; border-radius:12px; background:var(--bg-2,#f4f1ea); font-size:12.5px; }
    .bq-person .rank { width:25px; font-weight:900; color:var(--muted,#767a83); }
    .bq-person .name { flex:1; font-weight:800; }
    .bq-person .score { font-weight:900; color:var(--primary-dark,#5d7858); }
    .bq-host { font-size:10px; padding:2px 6px; border-radius:999px; background:#e8d8ad; color:#695018; font-weight:800; }
    .bq-wait { padding:14px; text-align:center; border-radius:13px; background:var(--bg-2,#f4f1ea); color:var(--muted,#767a83); font-size:12.5px; font-weight:700; }
    .bq-custom-item { padding:12px 0; border-bottom:1px solid var(--line,#ebece8); }
    .bq-custom-item:last-child { border-bottom:0; }
    .bq-custom-item b { display:block; font-size:13px; line-height:1.45; }
    .bq-custom-item span { display:block; margin-top:3px; font-size:11px; color:var(--muted,#767a83); }
    .bq-mini-delete { margin-top:7px; border:1px solid #e4b8b8; border-radius:8px; background:transparent; color:#b94747; padding:5px 9px; font-size:11px; font-weight:800; cursor:pointer; }
    .bq-loading { padding:50px 10px; text-align:center; color:var(--muted,#767a83); font-size:13px; }
    .bq-toast { position:fixed; left:50%; bottom:calc(28px + env(safe-area-inset-bottom,0px)); transform:translate(-50%,10px); z-index:12000; background:#1d2420; color:#fff; padding:10px 15px; border-radius:999px; max-width:calc(100% - 30px); font-size:12.5px; font-weight:800; opacity:0; pointer-events:none; transition:.2s; text-align:center; }
    .bq-toast.show { opacity:1; transform:translate(-50%,0); }
    @media(max-width:420px){ .bq-grid{grid-template-columns:1fr 1fr}.bq-card{padding:15px 13px}.bq-question{font-size:18px} }
  `;
  document.head.appendChild(style);
}

function injectEntryPoints() {
  const quick = document.querySelector('#tab-home .quick-actions');
  if (quick && !document.getElementById('bqLaunch')) {
    const button = document.createElement('button');
    button.id = 'bqLaunch';
    button.type = 'button';
    button.className = 'bq-launch';
    button.innerHTML = `<div class="bq-launch-inner"><div class="bq-launch-icon">📖</div><div class="bq-launch-copy"><b>성경퀴즈 · 말씀공부</b><span>혼자 공부하고, 문제를 내고, 교인들과 대결해요</span></div><div class="bq-launch-arrow">›</div></div>`;
    quick.insertAdjacentElement('afterend', button);
    button.addEventListener('click', openQuiz);
  }

  const meList = document.querySelector('#tab-me .menu-list');
  if (meList && !document.getElementById('bqMeMenu')) {
    const item = document.createElement('div');
    item.id = 'bqMeMenu';
    item.className = 'menu-item';
    item.innerHTML = '<div class="icon">📖</div><div class="label">성경퀴즈 · 말씀공부</div><div class="arrow">›</div>';
    item.addEventListener('click', openQuiz);
    meList.appendChild(item);
  }
}

function injectOverlay() {
  if (document.getElementById('bibleQuizOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'bibleQuizOverlay';
  overlay.className = 'bq-overlay';
  overlay.innerHTML = `<div class="bq-shell"><div class="bq-head"><button class="bq-icon-btn" id="bqBack" type="button" style="visibility:hidden">‹</button><div class="bq-head-title" id="bqHeadTitle">성경퀴즈</div><button class="bq-icon-btn" id="bqClose" type="button">×</button></div><div id="bqBody"></div></div>`;
  document.body.appendChild(overlay);
  document.getElementById('bqClose').addEventListener('click', closeQuiz);
  document.getElementById('bqBack').addEventListener('click', renderHub);
}

function setHead(title, showBack = true) {
  document.getElementById('bqHeadTitle').textContent = title;
  document.getElementById('bqBack').style.visibility = showBack ? 'visible' : 'hidden';
}

function body() { return document.getElementById('bqBody'); }

function loading(message = '불러오는 중...') {
  body().innerHTML = `<div class="bq-loading">${esc(message)}</div>`;
}

function stopPolling() {
  if (quizState.pollTimer) clearTimeout(quizState.pollTimer);
  quizState.pollTimer = null;
}

function closeQuiz() {
  stopPolling();
  document.getElementById('bibleQuizOverlay')?.classList.remove('show');
  document.body.style.overflow = '';
}

async function openQuiz() {
  injectOverlay();
  document.getElementById('bibleQuizOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
  if (!auth.currentUser) {
    setHead('성경퀴즈', false);
    body().innerHTML = '<div class="bq-panel"><h3>로그인이 필요합니다</h3><p class="bq-sub">교회 회원으로 로그인한 뒤 성경퀴즈를 이용해주세요.</p><button class="bq-secondary" id="bqLoginClose">닫기</button></div>';
    document.getElementById('bqLoginClose').onclick = closeQuiz;
    return;
  }
  await loadMeta();
  if (quizState.pendingRoomCode) renderCompetitionJoin(quizState.pendingRoomCode);
  else renderHub();
}

async function loadMeta() {
  try { quizState.meta = await api('meta'); }
  catch (error) { quizState.meta = null; toast(errorText(error)); }
}

function renderHub() {
  stopPolling();
  quizState.roomId = null;
  quizState.room = null;
  setHead('성경퀴즈', false);
  const meta = quizState.meta || {};
  const stats = meta.stats || {};
  const categories = Array.isArray(meta.categories) ? meta.categories : ['전체','기초','구약','예수님','신약','인물'];
  body().innerHTML = `
    <div class="bq-hero">
      <div class="eyebrow">BIBLE STUDY & QUIZ</div>
      <h2>말씀을 재미있게<br/>배우고 기억해요</h2>
      <p>혼자 풀어도 좋고, 교인들과 대회도 할 수 있습니다.</p>
      <div class="bq-stat-row">
        <div class="bq-stat"><b>${Number(meta.bankCount)||80}</b><span>기본 문제</span></div>
        <div class="bq-stat"><b>${Number(stats.plays)||0}</b><span>나의 도전</span></div>
        <div class="bq-stat"><b>${Number(stats.bestPercent)||0}%</b><span>최고 점수</span></div>
      </div>
    </div>
    <div class="bq-settings">
      <select class="bq-field" id="bqCategory">${categories.map((c)=>`<option value="${esc(c)}" ${quizState.category===c?'selected':''}>${esc(c)} 문제</option>`).join('')}</select>
      <select class="bq-field" id="bqCount">${[5,10,15,20].map((n)=>`<option value="${n}" ${quizState.count===n?'selected':''}>${n}문제</option>`).join('')}</select>
    </div>
    <label class="bq-check"><input type="checkbox" id="bqIncludeCustom" ${quizState.includeCustom?'checked':''} ${Number(meta.customCount)>0?'':'disabled'}><span>내가 만든 문제도 섞기 ${Number(meta.customCount)>0?`(${Number(meta.customCount)}개)`:'(아직 없음)'}</span></label>
    <div class="bq-grid">
      <button class="bq-card" id="bqStartQuiz"><div class="ico">🏆</div><b>퀴즈 도전</b><span>정답률을 기록하며 문제를 풀어요</span></button>
      <button class="bq-card" id="bqStartStudy"><div class="ico">📚</div><b>공부 모드</b><span>한 문제씩 성경 위치와 해설을 확인해요</span></button>
      <button class="bq-card featured" id="bqCompetition"><div class="ico">⚡</div><b>교인들과 실시간 대회</b><span>방을 만들고 참가 코드를 공유해 함께 점수 대결</span></button>
      <button class="bq-card" id="bqCustom"><div class="ico">✍️</div><b>내가 문제 내기</b><span>직접 객관식 문제와 해설을 만들어요</span></button>
      <button class="bq-card" id="bqMyQuestions"><div class="ico">🗂️</div><b>내 문제 관리</b><span>내가 만든 문제를 확인하고 정리해요</span></button>
    </div>`;
  document.getElementById('bqCategory').onchange = (e) => { quizState.category = e.target.value; };
  document.getElementById('bqCount').onchange = (e) => { quizState.count = Number(e.target.value); };
  document.getElementById('bqIncludeCustom').onchange = (e) => { quizState.includeCustom = e.target.checked; };
  document.getElementById('bqStartQuiz').onclick = () => startPractice('quiz');
  document.getElementById('bqStartStudy').onclick = () => startPractice('study');
  document.getElementById('bqCompetition').onclick = renderCompetitionMenu;
  document.getElementById('bqCustom').onclick = renderCustomCreate;
  document.getElementById('bqMyQuestions').onclick = renderCustomList;
}

async function startPractice(mode) {
  quizState.mode = mode;
  setHead(mode === 'study' ? '공부 모드' : '퀴즈 도전');
  loading('문제를 고르고 있습니다...');
  try {
    const data = await api('practiceStart', {
      mode,
      category: quizState.category,
      count: quizState.count,
      includeCustom: quizState.includeCustom
    });
    quizState.sessionId = data.sessionId;
    quizState.questions = data.questions || [];
    quizState.current = 0;
    quizState.score = 0;
    quizState.answered = false;
    renderPracticeQuestion();
  } catch (error) {
    body().innerHTML = `<div class="bq-panel"><h3>문제를 시작하지 못했습니다</h3><p class="bq-sub">${esc(errorText(error))}</p><button class="bq-secondary" id="bqRetryHome">돌아가기</button></div>`;
    document.getElementById('bqRetryHome').onclick = renderHub;
  }
}

function renderPracticeQuestion() {
  const q = quizState.questions[quizState.current];
  if (!q) return finishPractice();
  quizState.answered = false;
  const progress = Math.round((quizState.current / quizState.questions.length) * 100);
  body().innerHTML = `
    <div class="bq-panel">
      <div class="bq-qmeta"><span>${quizState.current + 1} / ${quizState.questions.length}</span><span class="bq-pill">${esc(q.category)} · ${esc(q.difficulty)}</span></div>
      <div class="bq-progress"><div style="width:${progress}%"></div></div>
      <div class="bq-question">${esc(q.question)}</div>
      <div class="bq-options" id="bqOptions">${q.options.map((opt,i)=>`<button class="bq-option" data-i="${i}" type="button"><span class="n">${String.fromCharCode(65+i)}</span><span>${esc(opt)}</span></button>`).join('')}</div>
      <div id="bqFeedback"></div>
    </div>`;
  document.querySelectorAll('#bqOptions .bq-option').forEach((btn) => btn.addEventListener('click', () => answerPractice(Number(btn.dataset.i))));
}

async function answerPractice(selected) {
  if (quizState.answered) return;
  quizState.answered = true;
  const buttons = [...document.querySelectorAll('#bqOptions .bq-option')];
  buttons.forEach((b) => { b.disabled = true; });
  try {
    const result = await api('practiceAnswer', { sessionId: quizState.sessionId, index: quizState.current, selected });
    if (result.correct) quizState.score += 1;
    buttons.forEach((b) => {
      const i = Number(b.dataset.i);
      if (i === Number(result.correctIndex)) b.classList.add('correct');
      else if (i === selected) b.classList.add('wrong');
    });
    document.getElementById('bqFeedback').innerHTML = `
      <div class="bq-explain"><b>${result.correct ? '정답입니다' : '아쉽습니다'} · ${esc(result.reference || '')}</b>${esc(result.explanation || '')}</div>
      <button class="bq-primary" id="bqNextQuestion">${quizState.current + 1 >= quizState.questions.length ? '결과 보기' : '다음 문제'}</button>`;
    document.getElementById('bqNextQuestion').onclick = () => {
      quizState.current += 1;
      if (quizState.current >= quizState.questions.length) finishPractice(); else renderPracticeQuestion();
    };
  } catch (error) {
    quizState.answered = false;
    buttons.forEach((b) => { b.disabled = false; });
    toast(errorText(error));
  }
}

async function finishPractice() {
  setHead('퀴즈 결과');
  loading('점수를 정리하고 있습니다...');
  try {
    const result = await api('practiceFinish', { sessionId: quizState.sessionId });
    const message = result.percent >= 90 ? '아주 훌륭합니다!' : result.percent >= 70 ? '잘 알고 계시네요!' : result.percent >= 50 ? '조금만 더 공부해봐요' : '말씀을 다시 살펴보면 금방 늘어요';
    body().innerHTML = `<div class="bq-panel bq-result"><div class="score">${result.percent}%</div><h3>${message}</h3><p class="bq-sub">${result.total}문제 중 ${result.score}문제를 맞혔습니다.</p><button class="bq-primary" id="bqAgain">같은 범위 다시 도전</button><button class="bq-secondary" id="bqResultHome">성경퀴즈 홈</button></div>`;
    document.getElementById('bqAgain').onclick = () => startPractice(quizState.mode);
    document.getElementById('bqResultHome').onclick = async () => { await loadMeta(); renderHub(); };
  } catch (error) {
    body().innerHTML = `<div class="bq-panel"><h3>결과를 불러오지 못했습니다</h3><p class="bq-sub">${esc(errorText(error))}</p><button class="bq-secondary" id="bqResultHome">돌아가기</button></div>`;
    document.getElementById('bqResultHome').onclick = renderHub;
  }
}

function renderCustomCreate() {
  setHead('내가 문제 내기');
  body().innerHTML = `
    <div class="bq-panel">
      <h3>직접 성경문제 만들기</h3><p class="bq-sub">정답을 확인할 수 있는 성경 위치와 짧은 해설까지 적어주세요.</p>
      <label class="bq-label">문제</label><textarea class="bq-field" id="bqCQ" rows="3" placeholder="예: 예수님께서 태어나신 곳은 어디인가요?"></textarea>
      ${['A','B','C','D'].map((x,i)=>`<label class="bq-label">보기 ${x}</label><input class="bq-field" id="bqCO${i}" placeholder="보기 ${x}">`).join('')}
      <div class="bq-row"><div><label class="bq-label">정답</label><select class="bq-field" id="bqCA"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select></div><div><label class="bq-label">난이도</label><select class="bq-field" id="bqCD"><option>쉬움</option><option selected>보통</option><option>어려움</option></select></div></div>
      <label class="bq-label">성경 위치</label><input class="bq-field" id="bqCR" placeholder="예: 누가복음 2:4-7">
      <label class="bq-label">해설</label><textarea class="bq-field" id="bqCE" rows="3" placeholder="왜 이 답이 맞는지 간단히 설명해주세요."></textarea>
      <button class="bq-primary" id="bqCSave">내 문제 저장</button>
    </div>`;
  document.getElementById('bqCSave').onclick = saveCustomQuestion;
}

async function saveCustomQuestion() {
  const btn = document.getElementById('bqCSave');
  btn.disabled = true; btn.textContent = '저장 중...';
  try {
    await api('customCreate', {
      question: document.getElementById('bqCQ').value,
      options: [0,1,2,3].map((i)=>document.getElementById(`bqCO${i}`).value),
      answer: Number(document.getElementById('bqCA').value),
      difficulty: document.getElementById('bqCD').value,
      reference: document.getElementById('bqCR').value,
      explanation: document.getElementById('bqCE').value
    });
    toast('내 문제가 저장되었습니다');
    await loadMeta();
    renderCustomList();
  } catch (error) {
    toast(errorText(error));
    btn.disabled = false; btn.textContent = '내 문제 저장';
  }
}

async function renderCustomList() {
  setHead('내 문제 관리');
  loading('내 문제를 불러오는 중...');
  try {
    const result = await api('customList');
    const list = result.questions || [];
    body().innerHTML = `<div class="bq-panel"><div class="bq-row" style="align-items:center"><div><h3>내가 만든 문제</h3><p class="bq-sub" style="margin:0">${list.length}개의 문제가 있습니다.</p></div><button class="bq-secondary" id="bqAddCustom" style="margin:0;flex:0 0 auto;width:auto;padding:9px 12px">+ 문제 추가</button></div><div style="margin-top:10px">${list.length?list.map((q)=>`<div class="bq-custom-item"><b>${esc(q.question)}</b><span>정답 ${String.fromCharCode(65+Number(q.answer))} · ${esc(q.reference)}</span><button class="bq-mini-delete" data-id="${esc(q.id)}">삭제</button></div>`).join(''):'<div class="bq-wait">아직 만든 문제가 없습니다.</div>'}</div></div>`;
    document.getElementById('bqAddCustom').onclick = renderCustomCreate;
    document.querySelectorAll('.bq-mini-delete').forEach((btn)=>btn.addEventListener('click', async()=>{
      if (!confirm('이 문제를 삭제하시겠어요?')) return;
      try { await api('customDelete',{id:btn.dataset.id}); await loadMeta(); renderCustomList(); } catch(e){ toast(errorText(e)); }
    }));
  } catch (error) {
    body().innerHTML = `<div class="bq-panel"><p class="bq-sub">${esc(errorText(error))}</p></div>`;
  }
}

function renderCompetitionMenu() {
  stopPolling();
  setHead('실시간 성경퀴즈 대회');
  body().innerHTML = `
    <div class="bq-panel"><h3>새 대회 만들기</h3><p class="bq-sub">방을 만든 뒤 참가 코드를 교인들에게 공유하세요.</p>
      <label class="bq-label">대회 이름</label><input class="bq-field" id="bqRoomTitle" value="우리 교회 성경퀴즈">
      <div class="bq-row"><div><label class="bq-label">문제 범위</label><select class="bq-field" id="bqRoomCategory">${['전체','기초','구약','예수님','신약','인물'].map(c=>`<option>${c}</option>`).join('')}</select></div><div><label class="bq-label">문제 수</label><select class="bq-field" id="bqRoomCount">${[5,10,15,20].map(n=>`<option value="${n}" ${n===10?'selected':''}>${n}문제</option>`).join('')}</select></div></div>
      <label class="bq-check" style="margin-top:12px"><input type="checkbox" id="bqRoomCustom" ${Number(quizState.meta?.customCount)>0?'':'disabled'}><span>내가 만든 문제도 섞기</span></label>
      <button class="bq-primary" id="bqCreateRoom">대회 방 만들기</button>
    </div>
    <div class="bq-panel"><h3>참가 코드로 들어가기</h3><p class="bq-sub">초대받은 6자리 코드를 입력하세요.</p><input class="bq-field" id="bqJoinCode" maxlength="6" placeholder="예: AB3K7M" style="text-transform:uppercase;text-align:center;font-size:20px;font-weight:900;letter-spacing:4px"><button class="bq-primary" id="bqJoinRoom">대회 참가</button></div>`;
  document.getElementById('bqCreateRoom').onclick = createRoom;
  document.getElementById('bqJoinRoom').onclick = () => joinRoom(document.getElementById('bqJoinCode').value);
}

function renderCompetitionJoin(code = '') {
  quizState.pendingRoomCode = '';
  setHead('대회 초대');
  body().innerHTML = `<div class="bq-panel"><h3>성경퀴즈 대회에 초대받았습니다</h3><p class="bq-sub">아래 참가 코드로 대회 방에 들어갈 수 있습니다.</p><div class="bq-code">${esc(String(code).toUpperCase())}</div><button class="bq-primary" id="bqInviteJoin">대회 참가하기</button><button class="bq-secondary" id="bqInviteHome">성경퀴즈 홈</button></div>`;
  document.getElementById('bqInviteJoin').onclick = () => joinRoom(code);
  document.getElementById('bqInviteHome').onclick = renderHub;
}

async function createRoom() {
  const btn = document.getElementById('bqCreateRoom');
  btn.disabled = true; btn.textContent = '방 만드는 중...';
  try {
    const room = await api('roomCreate', {
      title: document.getElementById('bqRoomTitle').value,
      category: document.getElementById('bqRoomCategory').value,
      count: Number(document.getElementById('bqRoomCount').value),
      includeCustom: document.getElementById('bqRoomCustom').checked
    });
    quizState.roomId = room.roomId;
    quizState.room = room;
    renderRoom(room);
    scheduleRoomPoll();
  } catch (error) {
    toast(errorText(error)); btn.disabled = false; btn.textContent = '대회 방 만들기';
  }
}

async function joinRoom(code) {
  code = String(code || '').trim().toUpperCase();
  if (!code) { toast('참가 코드를 입력해주세요'); return; }
  loading('대회 방에 들어가는 중...');
  try {
    const room = await api('roomJoin', { code });
    quizState.roomId = room.roomId;
    quizState.room = room;
    renderRoom(room);
    scheduleRoomPoll();
    const url = new URL(location.href); url.searchParams.delete('quizRoom'); history.replaceState({},'',url);
  } catch (error) {
    body().innerHTML = `<div class="bq-panel"><h3>참가하지 못했습니다</h3><p class="bq-sub">${esc(errorText(error))}</p><button class="bq-secondary" id="bqBackCompetition">다시 입력</button></div>`;
    document.getElementById('bqBackCompetition').onclick = renderCompetitionMenu;
  }
}

function scheduleRoomPoll() {
  stopPolling();
  quizState.pollTimer = setTimeout(async () => {
    if (!quizState.roomId || !document.getElementById('bibleQuizOverlay')?.classList.contains('show')) return;
    try {
      const room = await api('roomGet', { roomId: quizState.roomId });
      quizState.room = room;
      renderRoom(room);
      if (room.status !== 'finished') scheduleRoomPoll();
    } catch (error) {
      toast(errorText(error));
      quizState.pollTimer = setTimeout(scheduleRoomPoll, 3000);
    }
  }, 1500);
}

function peopleHtml(room) {
  return `<div class="bq-people">${(room.participants||[]).map((p,i)=>`<div class="bq-person"><span class="rank">${i+1}</span><span class="name">${esc(p.name)} ${p.uid===room.hostUid?'<span class="bq-host">방장</span>':''}</span><span class="score">${Number(p.score)||0}점</span></div>`).join('')}</div>`;
}

function renderRoom(room) {
  if (!room) return;
  setHead(room.title || '성경퀴즈 대회');
  if (room.status === 'lobby') {
    body().innerHTML = `<div class="bq-panel"><h3>참가 코드</h3><p class="bq-sub">교인들에게 이 코드를 알려주거나 초대 공유 버튼을 눌러주세요.</p><div class="bq-code">${esc(room.code)}</div><button class="bq-primary" id="bqShareRoom">초대 공유 · 카카오톡</button>${room.isHost?'<button class="bq-primary" id="bqStartRoom">대회 시작</button>':'<div class="bq-wait" style="margin-top:10px">방장이 시작할 때까지 기다려주세요.</div>'}<h3 style="margin-top:18px">참가자 ${room.participants?.length||0}명</h3>${peopleHtml(room)}</div>`;
    document.getElementById('bqShareRoom').onclick = () => shareRoom(room);
    if (room.isHost) document.getElementById('bqStartRoom').onclick = startRoom;
    return;
  }
  if (room.status === 'finished') {
    stopPolling();
    body().innerHTML = `<div class="bq-panel bq-result"><div style="font-size:42px">🏆</div><h3>대회가 끝났습니다</h3><p class="bq-sub">${room.total}문제 최종 순위</p>${peopleHtml(room)}<button class="bq-primary" id="bqRoomHome">성경퀴즈 홈</button></div>`;
    document.getElementById('bqRoomHome').onclick = async()=>{ await loadMeta(); renderHub(); };
    return;
  }

  const q = room.currentQuestion;
  const progress = Math.round(((Number(room.currentIndex)+1) / Math.max(1,Number(room.total))) * 100);
  body().innerHTML = `<div class="bq-panel"><div class="bq-qmeta"><span>${Number(room.currentIndex)+1} / ${room.total}</span><span>${room.answeredCount}/${room.participants?.length||0}명 답변</span></div><div class="bq-progress"><div style="width:${progress}%"></div></div>${q?`<div class="bq-question">${esc(q.question)}</div>${room.hasAnswered?'<div class="bq-wait">답 제출 완료 · 다른 참가자를 기다리는 중입니다.</div>':`<div class="bq-options" id="bqRoomOptions">${q.options.map((o,i)=>`<button class="bq-option" data-i="${i}" type="button"><span class="n">${String.fromCharCode(65+i)}</span><span>${esc(o)}</span></button>`).join('')}</div>`}`:'<div class="bq-wait">문제를 불러오는 중...</div>'}${room.isHost?`<button class="bq-primary" id="bqRoomNext">${Number(room.currentIndex)+1>=Number(room.total)?'대회 종료 · 결과 보기':'다음 문제로'}</button>`:''}<h3 style="margin-top:18px">현재 순위</h3>${peopleHtml(room)}</div>`;
  document.querySelectorAll('#bqRoomOptions .bq-option').forEach((btn)=>btn.addEventListener('click',()=>answerRoom(Number(btn.dataset.i))));
  if (room.isHost && document.getElementById('bqRoomNext')) document.getElementById('bqRoomNext').onclick = nextRoomQuestion;
}

async function startRoom() {
  loading('대회를 시작합니다...');
  try { const room = await api('roomStart',{roomId:quizState.roomId}); quizState.room=room; renderRoom(room); scheduleRoomPoll(); }
  catch(error){ toast(errorText(error)); if(quizState.room) renderRoom(quizState.room); }
}

async function answerRoom(selected) {
  const buttons=[...document.querySelectorAll('#bqRoomOptions .bq-option')];
  buttons.forEach(b=>b.disabled=true);
  try {
    const result=await api('roomAnswer',{roomId:quizState.roomId,selected});
    toast(result.correct?`정답! +${result.points}점`:'아쉽습니다. 다음 문제에 도전!');
    const room=await api('roomGet',{roomId:quizState.roomId}); quizState.room=room; renderRoom(room); scheduleRoomPoll();
  } catch(error){ toast(errorText(error)); buttons.forEach(b=>b.disabled=false); }
}

async function nextRoomQuestion() {
  const btn=document.getElementById('bqRoomNext'); if(btn){btn.disabled=true;btn.textContent='진행 중...';}
  try { const room=await api('roomNext',{roomId:quizState.roomId}); quizState.room=room; renderRoom(room); if(room.status!=='finished')scheduleRoomPoll(); }
  catch(error){ toast(errorText(error)); if(quizState.room)renderRoom(quizState.room); }
}

async function shareRoom(room) {
  const url=new URL(location.origin+location.pathname); url.searchParams.set('quizRoom',room.code);
  const data={ title:'천안남산교회 성경퀴즈', text:`성경퀴즈 대회에 초대합니다! 참가 코드: ${room.code}`, url:url.toString() };
  try {
    if(navigator.share){ await navigator.share(data); return; }
    await navigator.clipboard.writeText(`${data.text}\n${data.url}`); toast('초대 링크를 복사했습니다');
  } catch(error){ if(error?.name!=='AbortError') toast('공유하지 못했습니다'); }
}

function boot() {
  injectStyles();
  injectOverlay();
  injectEntryPoints();
  const observer=new MutationObserver(()=>injectEntryPoints());
  observer.observe(document.body,{childList:true,subtree:true});
  onAuthStateChanged(auth,(user)=>{
    if(user && quizState.pendingRoomCode) setTimeout(()=>openQuiz(),500);
  });
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
