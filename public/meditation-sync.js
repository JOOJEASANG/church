/* 오늘의 말씀 ↔ 오늘의 묵상 동기화 */
import { db, auth } from '/firebase-init.js';
import { ref, onValue, push } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

let items = [];
let modal = null;

function seed(){ const d=new Date(); return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate(); }
function today(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function idx(n){ if(!n) return 0; let x=(seed()^0x9e3779b9)>>>0; x=Math.imul(x^(x>>>16),2246822507); x=Math.imul(x^(x>>>13),3266489909); x=(x^(x>>>16))>>>0; return x%n; }
function pick(){ const a=items.filter(v=>v&&v.text&&v.active!==false).sort((x,y)=>String(x.ref||'').localeCompare(String(y.ref||''))||String(x.id||'').localeCompare(String(y.id||''))); return a.length?a[idx(a.length)]:null; }
function toast(msg){ if(typeof window.toast==='function') return window.toast(msg); alert(msg); }
function current(){ const v=pick(); if(!v) return null; const p={id:v.id||'', ref:v.ref||'오늘의 말씀', text:v.text||'', date:today(), source:'managedDailyVerse'}; window.__namsanTodayVerse=p; return p; }

function ensureModal(){
  if(modal) return modal;
  modal=document.createElement('div');
  modal.id='managedMeditationModal';
  modal.className='modal-bg';
  modal.innerHTML=`<div class="modal"><div class="modal-grip"></div><div class="modal-head"><div><h3>오늘의 묵상</h3><p class="sub" style="font-size:12px;color:var(--muted);margin-top:4px;">오늘의 말씀과 함께 묵상을 남겨보세요</p></div><button class="close-btn" type="button" data-close>×</button></div><div style="background:var(--bg-2,#f4f1ea);border:1px solid var(--line,#ebece8);border-radius:14px;padding:14px 15px;margin-bottom:12px;"><div data-ref style="font-size:12px;font-weight:900;color:var(--primary,#73926d);margin-bottom:7px;"></div><div data-text style="font-size:14px;font-weight:700;line-height:1.55;color:var(--text,#15171a);"></div></div><label>묵상 내용</label><textarea class="field" id="managedMeditationNote" placeholder="오늘 말씀을 붙들고 떠오른 감사, 기도, 결단을 적어보세요" style="min-height:130px;"></textarea><button class="submit-btn" type="button" id="managedMeditationSave">묵상 저장</button></div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').addEventListener('click', closeModal);
  modal.addEventListener('click',e=>{ if(e.target===modal) closeModal(); });
  modal.querySelector('#managedMeditationSave').addEventListener('click', save);
  return modal;
}
function openModal(){ const v=current(); if(!v) return false; const m=ensureModal(); m.querySelector('[data-ref]').textContent=v.ref; m.querySelector('[data-text]').textContent=v.text; const n=m.querySelector('#managedMeditationNote'); n.value=''; m.classList.add('show'); document.body.style.overflow='hidden'; setTimeout(()=>n.focus(),80); return true; }
function closeModal(){ if(!modal) return; modal.classList.remove('show'); document.body.style.overflow=''; }
async function save(){ const user=auth.currentUser; if(!user) return toast('로그인 후 사용할 수 있습니다'); const v=current(); const n=document.getElementById('managedMeditationNote'); const note=(n?.value||'').trim(); if(!note){ n?.focus(); return toast('묵상 내용을 입력해주세요'); } const btn=document.getElementById('managedMeditationSave'); btn.disabled=true; btn.textContent='저장 중...'; try{ await push(ref(db,`userNotes/${user.uid}`),{title:'오늘의 묵상',body:note,note,content:note,verseRef:v.ref,verseText:v.text,ref:v.ref,text:v.text,date:v.date,source:v.source,timestamp:Date.now()}); closeModal(); toast('오늘의 묵상이 저장되었습니다'); }catch(e){ toast('저장 실패: '+(e.code||e.message)); }finally{ btn.disabled=false; btn.textContent='묵상 저장'; }}

function syncExisting(){ const v=current(); if(!v) return; document.querySelectorAll('.modal-bg.show,.modal.show,[role="dialog"]').forEach(box=>{ if(!/묵상|노트|말씀/.test(box.textContent||'')) return; box.querySelectorAll('.verse-ref,.note-verse-ref,.meditation-verse-ref,[data-note-verse-ref]').forEach(el=>el.textContent=v.ref); box.querySelectorAll('.verse-text,.note-verse-text,.meditation-verse-text,[data-note-verse-text]').forEach(el=>el.textContent=v.text); }); }
document.addEventListener('click',e=>{ const v=current(); if(!v) return; const t=e.target.closest('button,a,[role="button"],.verse-action-btn,.quick-action,.action-card'); if(!t) return; const label=(t.textContent||t.getAttribute('aria-label')||t.title||'').trim(); if(!/오늘의\s*묵상|묵상\s*쓰기|묵상/.test(label)) return; if(!t.closest('.verse-card,#home,[data-tab="home"],.tab-pane.active')) return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); openModal(); },true);
onValue(ref(db,'dailyVerses'),snap=>{ const arr=[]; snap.forEach(c=>arr.push({id:c.key,...c.val()})); items=arr; current(); syncExisting(); },err=>console.warn('[meditation-sync] dailyVerses 읽기 실패:',err.code||err.message));
new MutationObserver(()=>requestAnimationFrame(syncExisting)).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
