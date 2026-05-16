/* 오늘의 말씀 최종 보정
 * - 외부 성경 API 대신 Firebase dailyVerses만 사용
 * - 모바일/PC 실제 DOM ID 모두 지원
 * - 매일 날짜 기준으로 순환 표시
 */
import { db } from '/firebase-init.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

let items = [];
let applying = false;
let timer = null;

function todayStart(){ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function dateKey(){ const d=todayStart(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function dayNumber(){ return Math.floor(todayStart().getTime()/86400000); }
function hash(v){ const s=String(v||''); let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
function first(...vals){ return vals.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='') || ''; }
function normalize(raw){
  const refText = first(raw.ref, raw.reference, raw.verseRef, raw.bookChapterVerse, raw.address, raw.title);
  const bodyText = first(raw.text, raw.verseText, raw.content, raw.body, raw.message, raw.word);
  return { ...raw, ref: refText, text: bodyText };
}
function activeList(){
  return items.map(normalize)
    .filter(v => v && v.text && v.active !== false && v.enabled !== false && v.use !== false)
    .sort((a,b)=>hash(`${a.id||''}|${a.ref||''}|${a.text||''}`)-hash(`${b.id||''}|${b.ref||''}|${b.text||''}`)||String(a.id||'').localeCompare(String(b.id||'')));
}
function pick(){ const list=activeList(); return list.length ? list[dayNumber() % list.length] : null; }
function findTextEl(){ return document.querySelector('#verseText, .verse-card .verse-text, #dailyVerseText, [data-daily-verse-text]'); }
function findRefEl(){ return document.querySelector('#verseRef, .verse-card .verse-ref, #dailyVerseRef, [data-daily-verse-ref]'); }
function apply(){
  const verse=pick();
  if(!verse) return false;
  const textEl=findTextEl();
  const refEl=findRefEl();
  if(!textEl || !refEl) return false;
  applying=true;
  textEl.textContent=verse.text;
  refEl.textContent=verse.ref || '오늘의 말씀';
  window.__namsanTodayVerse={ id:verse.id||'', ref:verse.ref||'오늘의 말씀', text:verse.text||'', date:dateKey(), source:'firebaseDailyVerses' };
  document.dispatchEvent(new CustomEvent('namsan:todayVerseChanged',{detail:window.__namsanTodayVerse}));
  requestAnimationFrame(()=>{ applying=false; });
  return true;
}
function schedule(){
  apply();
  [50,120,250,500,1000,2000,4000,7000].forEach(ms=>setTimeout(apply,ms));
  clearTimeout(timer);
  timer=setTimeout(schedule,5*60*1000);
}

onValue(ref(db,'dailyVerses'),snap=>{
  const arr=[];
  snap.forEach(c=>arr.push({id:c.key,...c.val()}));
  items=arr;
  schedule();
},err=>console.warn('[daily-verse-final] dailyVerses 읽기 실패:',err.code||err.message));

new MutationObserver(()=>{ if(!applying) requestAnimationFrame(apply); }).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) schedule(); });
window.addEventListener('focus',schedule);
document.addEventListener('namsan:forceTodayVerseRefresh',schedule);
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',schedule); else schedule();
