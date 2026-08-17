/* 성경퀴즈 V2 — 66권/난이도/연령 필터, 힌트, 해설, 실시간 대회 */
import { app, auth } from '/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-functions.js';

const callQuiz = httpsCallable(getFunctions(app, 'asia-northeast3'), 'bibleQuizV2');
const state = {
  meta:null, category:'전체', testament:'전체', book:'전체', difficulty:'전체', audience:'전체', count:10, includeCustom:false,
  sessionId:'', questions:[], index:0, score:0, mode:'quiz', hintShown:false, roomId:'', room:null, poll:null,
  inviteCode:new URL(location.href).searchParams.get('quiz2Room') || ''
};
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const err = (e) => String(e?.message || '잠시 후 다시 시도해주세요.').replace(/^FirebaseError:\s*/i,'').replace(/^functions\/[\w-]+:\s*/i,'');
async function api(action, payload={}) { return (await callQuiz({ action, ...payload })).data || {}; }

function toast(message) {
  let el = $('#bq2Toast');
  if (!el) { el=document.createElement('div'); el.id='bq2Toast'; el.className='bq2-toast'; document.body.appendChild(el); }
  el.textContent=message; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),1900);
}
function styles() {
  if ($('#bq2Style')) return;
  const s=document.createElement('style'); s.id='bq2Style'; s.textContent=`
  .bq2-overlay{display:none;position:fixed;inset:0;z-index:13000;background:var(--bg,#f8f8f5);color:var(--text,#17191c);overflow:auto}.bq2-overlay.show{display:block}.bq2-shell{max-width:760px;min-height:100dvh;margin:auto;padding:0 15px 42px}.bq2-head{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top,0px) + 10px) 0 10px;background:color-mix(in srgb,var(--bg,#f8f8f5) 94%,transparent);backdrop-filter:blur(12px)}.bq2-title{font-weight:900;font-size:18px;flex:1}.bq2-icon{width:40px;height:40px;border:1px solid var(--line,#ddd);border-radius:12px;background:var(--paper,#fff);font-size:20px}.bq2-hero{padding:23px 20px;border-radius:23px;color:#fff;background:linear-gradient(140deg,#101f3a,#244c73 68%,#a47d38 145%);box-shadow:0 12px 30px rgba(16,38,67,.18);margin:10px 0 14px}.bq2-hero small{font-weight:800;letter-spacing:.7px;opacity:.7}.bq2-hero h2{font-size:24px;line-height:1.25;margin:7px 0}.bq2-hero p{font-size:13px;opacity:.85;line-height:1.55}.bq2-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:15px}.bq2-stat{padding:10px 6px;text-align:center;border-radius:13px;background:rgba(255,255,255,.1)}.bq2-stat b{display:block;font-size:19px}.bq2-stat span{font-size:10px;opacity:.8}.bq2-panel{background:var(--paper,#fff);border:1px solid var(--line,#e4e4de);border-radius:19px;padding:16px;margin:12px 0;box-shadow:0 3px 12px rgba(0,0,0,.025)}.bq2-panel h3{margin:0 0 5px;font-size:17px}.bq2-sub{font-size:12px;line-height:1.55;color:var(--muted,#73777e);margin:0 0 12px}.bq2-grid2{display:grid;grid-template-columns:1fr 1fr;gap:9px}.bq2-field{width:100%;min-height:44px;border:1px solid var(--line,#ddd);border-radius:11px;background:var(--paper,#fff);color:var(--text,#17191c);padding:10px 11px;font-size:13px;box-sizing:border-box}.bq2-label{display:block;font-size:11px;font-weight:800;color:var(--muted,#70757c);margin:10px 0 5px}.bq2-check{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;margin:11px 0}.bq2-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px}.bq2-card{border:1px solid var(--line,#ddd);border-radius:16px;background:var(--paper,#fff);padding:16px;text-align:left;color:inherit}.bq2-card b{display:block;font-size:15px;margin:5px 0}.bq2-card span{font-size:11px;line-height:1.45;color:var(--muted,#73777e)}.bq2-card .ico{font-size:25px}.bq2-card.featured{background:linear-gradient(145deg,#17365d,#28557c);color:#fff;border:0}.bq2-card.featured span{color:rgba(255,255,255,.8)}.bq2-primary,.bq2-secondary,.bq2-hint{width:100%;min-height:46px;border-radius:12px;font-weight:900;font-size:13px;margin-top:9px}.bq2-primary{border:0;background:#214f77;color:#fff}.bq2-secondary{border:1px solid var(--line,#d9d9d2);background:var(--paper,#fff);color:inherit}.bq2-hint{border:1px dashed #b69659;background:#fffaf0;color:#80622c}.bq2-qmeta{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:800;color:var(--muted,#73777e)}.bq2-pill{padding:5px 8px;border-radius:999px;background:#eef2f5;color:#476071}.bq2-progress{height:5px;background:#ecece7;border-radius:99px;margin:10px 0 20px;overflow:hidden}.bq2-progress>div{height:100%;background:#2b5d84}.bq2-question{font-size:20px;font-weight:900;line-height:1.45;letter-spacing:-.45px;margin:8px 0 16px}.bq2-options{display:grid;gap:8px}.bq2-option{display:flex;align-items:center;gap:10px;text-align:left;border:1px solid var(--line,#ddd);border-radius:13px;background:var(--paper,#fff);padding:12px;color:inherit;font-size:13px;font-weight:700}.bq2-option .n{width:27px;height:27px;display:grid;place-items:center;border-radius:9px;background:#eef2f5;font-weight:900}.bq2-option.correct{border-color:#4a9167;background:#eef8f1}.bq2-option.wrong{border-color:#c66c6c;background:#fff0f0}.bq2-hintbox,.bq2-explain{margin-top:12px;border-radius:13px;padding:12px;font-size:12px;line-height:1.6}.bq2-hintbox{background:#fff8e8;border:1px solid #ead6a7}.bq2-explain{background:#eef5fa;border:1px solid #ccdde9}.bq2-explain b{display:block;font-size:13px;margin-bottom:4px}.bq2-code{text-align:center;font-size:28px;font-weight:950;letter-spacing:5px;padding:14px;border:1px dashed #9ba9b4;border-radius:15px;background:#f6f8fa}.bq2-person{display:grid;grid-template-columns:28px 1fr auto;gap:7px;padding:9px 0;border-bottom:1px solid var(--line,#eee);font-size:12px}.bq2-person .rank{font-weight:900}.bq2-person .score{font-weight:900}.bq2-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translate(-50%,8px);z-index:15000;background:#17201b;color:#fff;padding:10px 15px;border-radius:999px;font-size:12px;font-weight:800;opacity:0;pointer-events:none;transition:.18s;max-width:calc(100% - 30px);text-align:center}.bq2-toast.show{opacity:1;transform:translate(-50%,0)}
  @media(max-width:440px){.bq2-actions,.bq2-grid2{grid-template-columns:1fr 1fr}.bq2-question{font-size:19px}}
  `; document.head.appendChild(s);
}
function overlay() {
  if ($('#bq2Overlay')) return;
  const el=document.createElement('div'); el.id='bq2Overlay'; el.className='bq2-overlay';
  el.innerHTML='<div class="bq2-shell"><div class="bq2-head"><button class="bq2-icon" id="bq2Back" style="visibility:hidden">‹</button><div class="bq2-title" id="bq2Title">성경퀴즈</div><button class="bq2-icon" id="bq2Close">×</button></div><div id="bq2Body"></div></div>';
  document.body.appendChild(el); $('#bq2Close').onclick=closeQuiz; $('#bq2Back').onclick=renderHome;
}
function body(html) { $('#bq2Body').innerHTML=html; }
function head(title, back=true) { $('#bq2Title').textContent=title; $('#bq2Back').style.visibility=back?'visible':'hidden'; }
function loading(text='불러오는 중...') { body(`<div class="bq2-panel" style="text-align:center;padding:45px 15px;color:var(--muted,#777)">${esc(text)}</div>`); }
function stopPoll(){ if(state.poll) clearTimeout(state.poll); state.poll=null; }
function closeQuiz(){ stopPoll(); $('#bq2Overlay')?.classList.remove('show'); document.body.style.overflow=''; }

async function openQuiz(){
  overlay(); $('#bq2Overlay').classList.add('show'); document.body.style.overflow='hidden';
  if(!auth.currentUser){ head('성경퀴즈',false); body('<div class="bq2-panel"><h3>로그인이 필요합니다</h3><p class="bq2-sub">승인된 교회 회원으로 로그인한 뒤 이용해주세요.</p></div>'); return; }
  loading('성경퀴즈를 준비하고 있습니다...');
  try { state.meta=await api('meta'); updateLaunchText(); if(state.inviteCode) renderInvite(state.inviteCode); else renderHome(); }
  catch(e){ body(`<div class="bq2-panel"><h3>불러오지 못했습니다</h3><p class="bq2-sub">${esc(err(e))}</p></div>`); }
}
function updateLaunchText(){
  const copy=$('#bqLaunch .bq-launch-copy span'); if(copy&&state.meta) copy.textContent=`성경 66권 · ${Number(state.meta.bankCount)||212}문제 · 힌트와 해설 · 교인 대회`;
}
function optionList(values,current,suffix=''){ return values.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(v)}${suffix}</option>`).join(''); }
function bookOptions(){
  const meta=state.meta||{}; const old=meta.oldTestament||[]; const neo=meta.newTestament||[];
  const source=state.testament==='구약'?old:state.testament==='신약'?neo:(meta.books||[]);
  return '<option value="전체">전체 성경책</option>'+source.map(b=>`<option value="${esc(b)}" ${b===state.book?'selected':''}>${esc(b)} (${Number(meta.bookCounts?.[b])||0})</option>`).join('');
}
function filters(prefix='bq2'){
  const m=state.meta||{};
  return `<div class="bq2-grid2">
    <div><label class="bq2-label">대상</label><select class="bq2-field" id="${prefix}Audience">${optionList(m.audiences||['전체','어린이','청소년','일반'],state.audience)}</select></div>
    <div><label class="bq2-label">난이도</label><select class="bq2-field" id="${prefix}Difficulty">${optionList(m.difficulties||['전체','쉬움','보통','어려움'],state.difficulty)}</select></div>
    <div><label class="bq2-label">성경 구분</label><select class="bq2-field" id="${prefix}Testament">${optionList(['전체','구약','신약'],state.testament)}</select></div>
    <div><label class="bq2-label">성경책</label><select class="bq2-field" id="${prefix}Book">${bookOptions()}</select></div>
    <div><label class="bq2-label">분류</label><select class="bq2-field" id="${prefix}Category">${optionList(m.categories||['전체','기초','구약','예수님','신약','인물'],state.category)}</select></div>
    <div><label class="bq2-label">문제 수</label><select class="bq2-field" id="${prefix}Count">${[5,10,15,20,30].map(n=>`<option value="${n}" ${n===state.count?'selected':''}>${n}문제</option>`).join('')}</select></div>
  </div>`;
}
function bindFilters(prefix='bq2'){
  $(`#${prefix}Audience`).onchange=e=>state.audience=e.target.value; $(`#${prefix}Difficulty`).onchange=e=>state.difficulty=e.target.value;
  $(`#${prefix}Category`).onchange=e=>state.category=e.target.value; $(`#${prefix}Count`).onchange=e=>state.count=Number(e.target.value);
  $(`#${prefix}Testament`).onchange=e=>{state.testament=e.target.value; state.book='전체'; $(`#${prefix}Book`).innerHTML=bookOptions();};
  $(`#${prefix}Book`).onchange=e=>state.book=e.target.value;
}
function renderHome(){
  stopPoll(); head('성경퀴즈 · 말씀공부',false); const m=state.meta||{}; const st=m.stats||{};
  body(`<div class="bq2-hero"><small>BIBLE STUDY & QUIZ 2.0</small><h2>성경 66권을<br>재미있게 배우고 기억해요</h2><p>연령·난이도·성경책을 골라 공부하고, 막히면 힌트를 보고 정답 뒤에는 해설까지 확인할 수 있습니다.</p><div class="bq2-stats"><div class="bq2-stat"><b>${Number(m.bankCount)||212}</b><span>기본 문제</span></div><div class="bq2-stat"><b>66</b><span>성경 전체</span></div><div class="bq2-stat"><b>${Number(st.bestPercent)||0}%</b><span>최고 점수</span></div></div></div>
  <div class="bq2-panel"><h3>오늘 무엇을 공부할까요?</h3><p class="bq2-sub">조건을 여러 개 고르면 모두 만족하는 문제만 출제됩니다.</p>${filters()}<label class="bq2-check"><input type="checkbox" id="bq2Custom" ${state.includeCustom?'checked':''} ${Number(m.customCount)>0?'':'disabled'}> 내가 만든 문제도 섞기 ${Number(m.customCount)>0?`(${m.customCount}개)`:''}</label></div>
  <div class="bq2-actions"><button class="bq2-card" id="bq2Quiz"><div class="ico">🏆</div><b>퀴즈 도전</b><span>기록을 남기며 풀고 필요하면 힌트를 사용합니다.</span></button><button class="bq2-card" id="bq2Study"><div class="ico">📚</div><b>공부 모드</b><span>문제마다 성경 위치와 해설을 확인합니다.</span></button><button class="bq2-card featured" id="bq2Comp"><div class="ico">⚡</div><b>교인들과 대회</b><span>같은 문제를 동시에 풀고 실시간 순위를 확인합니다.</span></button><button class="bq2-card" id="bq2Make"><div class="ico">✍️</div><b>내가 문제 내기</b><span>힌트와 정답 해설까지 직접 만들 수 있습니다.</span></button><button class="bq2-card" id="bq2Mine"><div class="ico">🗂️</div><b>내 문제 관리</b><span>직접 만든 문제를 확인하고 삭제합니다.</span></button></div>`);
  bindFilters(); $('#bq2Custom').onchange=e=>state.includeCustom=e.target.checked; $('#bq2Quiz').onclick=()=>startPractice('quiz'); $('#bq2Study').onclick=()=>startPractice('study'); $('#bq2Comp').onclick=renderCompetitionMenu; $('#bq2Make').onclick=renderCustomForm; $('#bq2Mine').onclick=renderCustomList;
}
function filterPayload(){ return { category:state.category,testament:state.testament,book:state.book,difficulty:state.difficulty,audience:state.audience,count:state.count,includeCustom:state.includeCustom }; }
async function startPractice(mode){
  state.mode=mode; head(mode==='study'?'공부 모드':'퀴즈 도전'); loading('조건에 맞는 문제를 고르고 있습니다...');
  try { const r=await api('practiceStart',{mode,...filterPayload()}); state.sessionId=r.sessionId; state.questions=r.questions||[]; state.index=0; state.score=0; renderQuestion(); }
  catch(e){ body(`<div class="bq2-panel"><h3>문제를 시작하지 못했습니다</h3><p class="bq2-sub">${esc(err(e))}</p><button class="bq2-secondary" id="bq2Home">조건 다시 선택</button></div>`); $('#bq2Home').onclick=renderHome; }
}
function renderQuestion(){
  const q=state.questions[state.index]; if(!q) return finishPractice(); state.hintShown=false; const pct=Math.round((state.index/state.questions.length)*100);
  body(`<div class="bq2-panel"><div class="bq2-qmeta"><span>${state.index+1} / ${state.questions.length}</span><span class="bq2-pill">${esc(q.book||q.category)} · ${esc(q.difficulty)}</span></div><div class="bq2-progress"><div style="width:${pct}%"></div></div><div class="bq2-question">${esc(q.question)}</div><div class="bq2-options" id="bq2Options">${q.options.map((o,i)=>`<button class="bq2-option" data-i="${i}"><span class="n">${String.fromCharCode(65+i)}</span><span>${esc(o)}</span></button>`).join('')}</div><button class="bq2-hint" id="bq2Hint">💡 힌트 보기</button><div id="bq2HintBox"></div><div id="bq2Feedback"></div></div>`);
  $$('#bq2Options .bq2-option').forEach(b=>b.onclick=()=>answerPractice(Number(b.dataset.i))); $('#bq2Hint').onclick=showHint;
}
async function showHint(){
  if(state.hintShown) return; const btn=$('#bq2Hint'); btn.disabled=true; btn.textContent='힌트를 찾는 중...';
  try { const r=await api('practiceHint',{sessionId:state.sessionId,index:state.index}); state.hintShown=true; $('#bq2HintBox').innerHTML=`<div class="bq2-hintbox"><b>💡 힌트</b><br>${esc(r.hint)}</div>`; btn.style.display='none'; }
  catch(e){ btn.disabled=false; btn.textContent='💡 힌트 보기'; toast(err(e)); }
}
async function answerPractice(selected){
  const buttons=$$('#bq2Options .bq2-option'); buttons.forEach(b=>b.disabled=true); $('#bq2Hint').disabled=true;
  try { const r=await api('practiceAnswer',{sessionId:state.sessionId,index:state.index,selected}); if(r.correct) state.score++;
    buttons.forEach(b=>{const i=Number(b.dataset.i); if(i===Number(r.correctIndex))b.classList.add('correct'); else if(i===selected)b.classList.add('wrong');});
    $('#bq2Feedback').innerHTML=`<div class="bq2-explain"><b>${r.correct?'정답입니다':'정답을 확인해보세요'} · ${esc(r.reference)}</b>${esc(r.explanation)}${r.hintUsed?'<br><small>이번 문제에서는 힌트를 사용했습니다.</small>':''}</div><button class="bq2-primary" id="bq2Next">${state.index+1>=state.questions.length?'결과 보기':'다음 문제'}</button>`;
    $('#bq2Next').onclick=()=>{state.index++; state.index>=state.questions.length?finishPractice():renderQuestion();};
  } catch(e){ buttons.forEach(b=>b.disabled=false); $('#bq2Hint').disabled=false; toast(err(e)); }
}
async function finishPractice(){
  head('학습 결과'); loading('학습 기록을 정리하고 있습니다...');
  try { const r=await api('practiceFinish',{sessionId:state.sessionId}); const msg=r.percent>=90?'아주 훌륭합니다!':r.percent>=70?'잘 알고 계시네요!':r.percent>=50?'조금만 더 복습해봐요':'해설을 다시 보며 천천히 익혀봐요';
    body(`<div class="bq2-panel" style="text-align:center"><div style="font-size:48px;font-weight:950;color:#214f77">${r.percent}%</div><h3>${msg}</h3><p class="bq2-sub">${r.total}문제 중 ${r.score}문제 정답 · 힌트 ${r.hintCount||0}회 사용</p><button class="bq2-primary" id="bq2Again">같은 조건 다시 풀기</button><button class="bq2-secondary" id="bq2ResultHome">성경퀴즈 홈</button></div>`); $('#bq2Again').onclick=()=>startPractice(state.mode); $('#bq2ResultHome').onclick=async()=>{state.meta=await api('meta');renderHome();};
  } catch(e){ body(`<div class="bq2-panel"><p class="bq2-sub">${esc(err(e))}</p><button class="bq2-secondary" id="bq2ResultHome">홈으로</button></div>`); $('#bq2ResultHome').onclick=renderHome; }
}
function renderCustomForm(){
  head('내가 문제 내기'); const books=state.meta?.books||[];
  body(`<div class="bq2-panel"><h3>직접 성경문제 만들기</h3><p class="bq2-sub">힌트는 정답을 바로 말하지 않도록 적고, 해설에는 왜 그 답인지 설명해주세요.</p><label class="bq2-label">성경책</label><select class="bq2-field" id="bq2CQBook"><option value="">선택 안 함</option>${books.map(b=>`<option>${esc(b)}</option>`).join('')}</select><div class="bq2-grid2"><div><label class="bq2-label">대상</label><select class="bq2-field" id="bq2CQAudience"><option>어린이</option><option selected>청소년</option><option>일반</option></select></div><div><label class="bq2-label">난이도</label><select class="bq2-field" id="bq2CQDiff"><option>쉬움</option><option selected>보통</option><option>어려움</option></select></div></div><label class="bq2-label">문제</label><textarea class="bq2-field" id="bq2CQQ" rows="3"></textarea>${['A','B','C','D'].map((x,i)=>`<label class="bq2-label">보기 ${x}</label><input class="bq2-field" id="bq2CQO${i}">`).join('')}<label class="bq2-label">정답</label><select class="bq2-field" id="bq2CQA"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select><label class="bq2-label">성경 위치</label><input class="bq2-field" id="bq2CQRef" placeholder="예: 요한복음 11장"><label class="bq2-label">힌트 (선택)</label><textarea class="bq2-field" id="bq2CQHint" rows="2" placeholder="예: 베다니에서 있었던 사건을 떠올려보세요."></textarea><label class="bq2-label">정답 해설</label><textarea class="bq2-field" id="bq2CQExp" rows="3" placeholder="왜 이 답이 맞는지 짧게 설명해주세요."></textarea><button class="bq2-primary" id="bq2CQSave">내 문제 저장</button></div>`); $('#bq2CQSave').onclick=saveCustom;
}
async function saveCustom(){
  const btn=$('#bq2CQSave'); btn.disabled=true; btn.textContent='저장 중...';
  try { await api('customCreate',{book:$('#bq2CQBook').value,audience:$('#bq2CQAudience').value,difficulty:$('#bq2CQDiff').value,question:$('#bq2CQQ').value,options:[0,1,2,3].map(i=>$(`#bq2CQO${i}`).value),answer:Number($('#bq2CQA').value),reference:$('#bq2CQRef').value,hint:$('#bq2CQHint').value,explanation:$('#bq2CQExp').value}); state.meta=await api('meta'); toast('문제가 저장되었습니다'); renderCustomList(); }
  catch(e){btn.disabled=false;btn.textContent='내 문제 저장';toast(err(e));}
}
async function renderCustomList(){
  head('내 문제 관리'); loading('내 문제를 불러오는 중...');
  try { const r=await api('customList'); const list=r.questions||[]; body(`<div class="bq2-panel"><h3>내가 만든 문제 ${list.length}개</h3><button class="bq2-primary" id="bq2Add">+ 문제 추가</button>${list.map(q=>`<div style="padding:12px 0;border-bottom:1px solid var(--line,#eee)"><b style="font-size:13px">${esc(q.question)}</b><div class="bq2-sub" style="margin:4px 0">${esc(q.book||'성경 전체')} · ${esc(q.audience)} · ${esc(q.difficulty)} · 정답 ${String.fromCharCode(65+Number(q.answer))}<br>힌트: ${esc(q.hint||'자동 힌트')}</div><button class="bq2-secondary bq2-del" data-id="${esc(q.id)}" style="min-height:34px;width:auto;padding:5px 10px">삭제</button></div>`).join('')||'<p class="bq2-sub">아직 만든 문제가 없습니다.</p>'}</div>`); $('#bq2Add').onclick=renderCustomForm; $$('.bq2-del').forEach(b=>b.onclick=async()=>{if(!confirm('이 문제를 삭제하시겠어요?'))return;await api('customDelete',{id:b.dataset.id});state.meta=await api('meta');renderCustomList();}); }
  catch(e){body(`<div class="bq2-panel"><p class="bq2-sub">${esc(err(e))}</p></div>`);}
}
function renderCompetitionMenu(){
  stopPoll(); head('교인들과 성경퀴즈 대회'); body(`<div class="bq2-panel"><h3>새 대회 만들기</h3><p class="bq2-sub">대회에서는 공정성을 위해 힌트와 정답 해설이 문제 진행 중에는 표시되지 않습니다.</p><label class="bq2-label">대회 이름</label><input class="bq2-field" id="bq2RoomTitle" value="우리 교회 성경퀴즈">${filters('bq2R')}<label class="bq2-check"><input type="checkbox" id="bq2RCustom" ${Number(state.meta?.customCount)>0?'':'disabled'}> 내가 만든 문제도 섞기</label><button class="bq2-primary" id="bq2CreateRoom">대회 방 만들기</button></div><div class="bq2-panel"><h3>참가 코드로 들어가기</h3><input class="bq2-field" id="bq2JoinCode" maxlength="6" style="text-transform:uppercase;text-align:center;font-size:19px;letter-spacing:4px" placeholder="6자리 코드"><button class="bq2-primary" id="bq2Join">대회 참가</button></div>`); bindFilters('bq2R'); $('#bq2CreateRoom').onclick=createRoom; $('#bq2Join').onclick=()=>joinRoom($('#bq2JoinCode').value);
}
async function createRoom(){
  loading('대회 방을 만들고 있습니다...'); try {const room=await api('roomCreate',{title:$('#bq2RoomTitle')?.value||'우리 교회 성경퀴즈',...filterPayload(),includeCustom:$('#bq2RCustom')?.checked||false}); state.roomId=room.roomId;state.room=room;renderRoom(room);schedulePoll();}catch(e){toast(err(e));renderCompetitionMenu();}
}
function renderInvite(code){ state.inviteCode=''; head('성경퀴즈 대회 초대'); body(`<div class="bq2-panel" style="text-align:center"><h3>대회에 초대받았습니다</h3><p class="bq2-sub">아래 코드로 교인들과 함께 참여할 수 있습니다.</p><div class="bq2-code">${esc(String(code).toUpperCase())}</div><button class="bq2-primary" id="bq2InviteJoin">대회 참가하기</button><button class="bq2-secondary" id="bq2InviteHome">성경퀴즈 홈</button></div>`); $('#bq2InviteJoin').onclick=()=>joinRoom(code); $('#bq2InviteHome').onclick=renderHome; }
async function joinRoom(code){code=String(code||'').trim().toUpperCase();if(!code){toast('참가 코드를 입력해주세요');return;}loading('대회 방에 들어가는 중...');try{const room=await api('roomJoin',{code});state.roomId=room.roomId;state.room=room;renderRoom(room);schedulePoll();const u=new URL(location.href);u.searchParams.delete('quiz2Room');history.replaceState({},'',u);}catch(e){body(`<div class="bq2-panel"><h3>참가하지 못했습니다</h3><p class="bq2-sub">${esc(err(e))}</p><button class="bq2-secondary" id="bq2RetryJoin">다시 입력</button></div>`);$('#bq2RetryJoin').onclick=renderCompetitionMenu;}}
function people(room){return (room.participants||[]).map((p,i)=>`<div class="bq2-person"><span class="rank">${i+1}</span><span>${esc(p.name)}${p.uid===room.hostUid?' · 방장':''}</span><span class="score">${Number(p.score)||0}점</span></div>`).join('');}
function renderRoom(room){
  head(room.title||'성경퀴즈 대회'); if(room.status==='lobby'){body(`<div class="bq2-panel"><h3>참가 코드</h3><p class="bq2-sub">카카오톡을 포함한 휴대폰 공유창으로 초대 링크를 보낼 수 있습니다.</p><div class="bq2-code">${esc(room.code)}</div><button class="bq2-primary" id="bq2Share">초대 공유 · 카카오톡</button>${room.isHost?'<button class="bq2-primary" id="bq2StartRoom">대회 시작</button>':'<p class="bq2-sub" style="margin-top:12px">방장이 시작할 때까지 기다려주세요.</p>'}<h3 style="margin-top:18px">참가자</h3>${people(room)}</div>`);$('#bq2Share').onclick=()=>shareRoom(room);if(room.isHost)$('#bq2StartRoom').onclick=startRoom;return;}
  if(room.status==='finished'){stopPoll();body(`<div class="bq2-panel" style="text-align:center"><div style="font-size:42px">🏆</div><h3>대회가 끝났습니다</h3><p class="bq2-sub">최종 순위</p>${people(room)}<button class="bq2-primary" id="bq2RoomHome">성경퀴즈 홈</button></div>`);$('#bq2RoomHome').onclick=renderHome;return;}
  const q=room.currentQuestion;body(`<div class="bq2-panel"><div class="bq2-qmeta"><span>${Number(room.currentIndex)+1} / ${room.total}</span><span>${room.answeredCount}/${room.participants?.length||0}명 답변</span></div><div class="bq2-progress"><div style="width:${Math.round(((Number(room.currentIndex)+1)/Math.max(1,room.total))*100)}%"></div></div>${q?`<div class="bq2-question">${esc(q.question)}</div>${room.hasAnswered?'<div class="bq2-hintbox">답 제출 완료 · 다른 참가자를 기다리는 중입니다.</div>':`<div class="bq2-options" id="bq2RoomOpts">${q.options.map((o,i)=>`<button class="bq2-option" data-i="${i}"><span class="n">${String.fromCharCode(65+i)}</span><span>${esc(o)}</span></button>`).join('')}</div>`}`:'<p class="bq2-sub">문제를 불러오는 중...</p>'}${room.isHost?`<button class="bq2-primary" id="bq2RoomNext">${Number(room.currentIndex)+1>=room.total?'대회 종료':'다음 문제'}</button>`:''}<h3 style="margin-top:18px">현재 순위</h3>${people(room)}</div>`);$$('#bq2RoomOpts .bq2-option').forEach(b=>b.onclick=()=>answerRoom(Number(b.dataset.i)));if(room.isHost&&$('#bq2RoomNext'))$('#bq2RoomNext').onclick=nextRoom;
}
async function startRoom(){loading('대회를 시작합니다...');try{const r=await api('roomStart',{roomId:state.roomId});state.room=r;renderRoom(r);schedulePoll();}catch(e){toast(err(e));renderRoom(state.room);}}
async function answerRoom(selected){$$('#bq2RoomOpts .bq2-option').forEach(b=>b.disabled=true);try{const r=await api('roomAnswer',{roomId:state.roomId,selected});toast(r.correct?`정답! +${r.points}점`:'아쉽습니다. 다음 문제에 도전!');state.room=await api('roomGet',{roomId:state.roomId});renderRoom(state.room);schedulePoll();}catch(e){toast(err(e));renderRoom(state.room);}}
async function nextRoom(){try{const r=await api('roomNext',{roomId:state.roomId});state.room=r;renderRoom(r);if(r.status!=='finished')schedulePoll();}catch(e){toast(err(e));}}
function schedulePoll(){stopPoll();state.poll=setTimeout(async()=>{if(!state.roomId||!$('#bq2Overlay')?.classList.contains('show'))return;try{state.room=await api('roomGet',{roomId:state.roomId});renderRoom(state.room);if(state.room.status!=='finished')schedulePoll();}catch(e){toast(err(e));state.poll=setTimeout(schedulePoll,3000);}},1500);}
async function shareRoom(room){const u=new URL(location.origin+location.pathname);u.searchParams.set('quiz2Room',room.code);const data={title:'천안남산교회 성경퀴즈',text:`성경퀴즈 대회에 초대합니다! 참가 코드: ${room.code}`,url:u.toString()};try{if(navigator.share){await navigator.share(data);return;}await navigator.clipboard.writeText(`${data.text}\n${data.url}`);toast('초대 링크를 복사했습니다');}catch(e){if(e?.name!=='AbortError')toast('공유하지 못했습니다');}}

function hookLaunch(){
  for(const selector of ['#bqLaunch','#bqMeMenu']){const el=$(selector);if(!el||el.dataset.bq2Hook)return;el.dataset.bq2Hook='1';el.addEventListener('click',(e)=>{e.preventDefault();e.stopImmediatePropagation();openQuiz();},true);}
}
function boot(){styles();overlay();hookLaunch();const ob=new MutationObserver(hookLaunch);ob.observe(document.body,{childList:true,subtree:true});onAuthStateChanged(auth,(user)=>{if(user&&state.inviteCode)setTimeout(openQuiz,550);});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
