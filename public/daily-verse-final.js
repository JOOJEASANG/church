/* 오늘의 말씀 단일 적용 모듈
 * - Firebase dailyVerses 데이터만 사용
 * - 모바일/PC DOM 모두 지원
 * - 로그인 후 dailyVerses를 읽어 모바일 권한 오류 방지
 * - 하루 단위 순환 표시
 */
import { db, auth } from '/firebase-init.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

let items = [];
let applying = false;
let refreshTimer = null;
let observedCard = null;
let dailyUnsub = null;
let retryTimer = null;

function todayStart(){ const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),d.getDate()); }
function dateKey(){ const d=todayStart(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function dayNumber(){ return Math.floor(todayStart().getTime()/86400000); }
function hash(v){ const s=String(v||''); let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
function first(...vals){ return vals.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='') || ''; }
function normalize(raw){ return {...raw, ref:first(raw.ref,raw.reference,raw.verseRef,raw.bookChapterVerse,raw.address,raw.title), text:first(raw.text,raw.verseText,raw.content,raw.body,raw.message,raw.word)}; }
function activeList(){ return items.map(normalize).filter(v=>v&&v.text&&v.active!==false&&v.enabled!==false&&v.use!==false).sort((a,b)=>hash(`${a.id||''}|${a.ref||''}|${a.text||''}`)-hash(`${b.id||''}|${b.ref||''}|${b.text||''}`)||String(a.id||'').localeCompare(String(b.id||''))); }
function pick(){ const list=activeList(); return list.length ? list[dayNumber()%list.length] : null; }
function findTextEl(){ return document.querySelector('#verseText, .verse-card .verse-text, #dailyVerseText, [data-daily-verse-text]'); }
function findRefEl(){ return document.querySelector('#verseRef, .verse-card .verse-ref, #dailyVerseRef, [data-daily-verse-ref]'); }
function findCard(){ return document.querySelector('.verse-card, #verseCard'); }

function apply(){
  const verse=pick();
  if(!verse) return false;
  const textEl=findTextEl(), refEl=findRefEl();
  if(!textEl||!refEl) return false;
  const refText=verse.ref||'오늘의 말씀';
  if(textEl.textContent===verse.text && refEl.textContent===refText){
    window.__namsanTodayVerse={id:verse.id||'',ref:refText,text:verse.text||'',date:dateKey(),source:'firebaseDailyVerses'};
    return true;
  }
  applying=true;
  textEl.textContent=verse.text;
  refEl.textContent=refText;
  textEl.dataset.dailyVerseDate=dateKey();
  refEl.dataset.dailyVerseDate=dateKey();
  window.__namsanTodayVerse={id:verse.id||'',ref:refText,text:verse.text||'',date:dateKey(),source:'firebaseDailyVerses'};
  document.dispatchEvent(new CustomEvent('namsan:todayVerseChanged',{detail:window.__namsanTodayVerse}));
  requestAnimationFrame(()=>{ applying=false; });
  return true;
}
function observeCard(){
  const card=findCard();
  if(!card||observedCard===card) return;
  observedCard=card;
  new MutationObserver(()=>{ if(!applying) requestAnimationFrame(apply); }).observe(card,{childList:true,subtree:true,characterData:true});
}
function tryApplyOnce(){
  if(apply()){ observeCard(); return; }
  let tries=0;
  const id=setInterval(()=>{ tries++; if(apply()||tries>30){ clearInterval(id); observeCard(); } },200);
}
function scheduleRefresh(){
  clearTimeout(refreshTimer);
  tryApplyOnce();
  refreshTimer=setTimeout(scheduleRefresh,5*60*1000);
}
function bindDailyVerses(){
  if(dailyUnsub || !auth.currentUser) return;
  dailyUnsub=onValue(ref(db,'dailyVerses'),snap=>{
    const arr=[];
    snap.forEach(c=>arr.push({id:c.key,...c.val()}));
    items=arr;
    scheduleRefresh();
  },err=>{
    console.warn('[daily-verse-final] dailyVerses 읽기 실패:',err.code||err.message);
    if(dailyUnsub){ dailyUnsub(); dailyUnsub=null; }
    clearTimeout(retryTimer);
    retryTimer=setTimeout(()=>{ if(auth.currentUser) bindDailyVerses(); },1800);
  });
}
function unbindDailyVerses(){
  items=[];
  if(dailyUnsub){ dailyUnsub(); dailyUnsub=null; }
  clearTimeout(refreshTimer);
  clearTimeout(retryTimer);
}

onAuthStateChanged(auth,user=>{
  if(user){ bindDailyVerses(); scheduleRefresh(); }
  else unbindDailyVerses();
});

document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&auth.currentUser) scheduleRefresh(); });
window.addEventListener('focus',()=>{ if(auth.currentUser) scheduleRefresh(); });
document.addEventListener('namsan:forceTodayVerseRefresh',()=>{ if(auth.currentUser) scheduleRefresh(); });
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{ if(auth.currentUser){ bindDailyVerses(); scheduleRefresh(); }});
else if(auth.currentUser){ bindDailyVerses(); scheduleRefresh(); }
