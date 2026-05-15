/* PC 전용 홈페이지 DOM
 * - 모바일 앱 DOM은 그대로 유지
 * - PC(980px 이상)에서는 별도 홈페이지 레이아웃을 생성
 * - 데이터는 Firebase 운영 데이터만 사용
 */
import { db, auth } from '/firebase-init.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

const isAdminPage = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
const mq = window.matchMedia('(min-width: 980px)');
const state = {
  user: null,
  config: {},
  services: [],
  announcements: [],
  sermons: [],
  sermonHistory: [],
  bulletins: [],
  rooms: [],
  dailyVerses: [],
  events: []
};

if (!isAdminPage) boot();

function boot() {
  injectStyles();
  ensureShell();
  bindAuth();
  bindMq();
}

function esc(v) {
  return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function arr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return Object.entries(v).map(([id, item]) => ({ id, ...(item || {}) }));
}
function first(...vals) {
  return vals.find((v) => v !== undefined && v !== null && String(v).trim() !== '') || '';
}
function dateText(ts) {
  if (!ts) return '';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(String(ts));
  if (Number.isNaN(d.getTime())) return String(ts).slice(0, 10);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}
function sortRecent(list) {
  return [...list].sort((a,b) => Number(b.timestamp || b.createdAt || b.updatedAt || 0) - Number(a.timestamp || a.createdAt || a.updatedAt || 0));
}
function church() {
  const c = state.config || {};
  const cc = c.church || c.info || c.site || c.home || {};
  return {
    name: first(c.name, cc.name, '천안남산교회'),
    tagline: first(c.tagline, cc.tagline, c.heroTitle, c.hero?.title, '함께 예배하고, 함께 섬깁니다'),
    subtitle: first(c.subtitle, cc.subtitle, c.heroSubtitle, c.hero?.subtitle, ''),
    logo: first(c.logoUrl, c.logo, cc.logoUrl, cc.logo, c.churchLogoUrl),
    hero: first(c.heroImageUrl, c.heroImg, c.heroImage, c.hero?.imageUrl, c.hero?.url, cc.heroImageUrl),
    address: first(c.address, cc.address, c.location?.address),
    phone: first(c.phone, cc.phone, c.tel, cc.tel),
    naver: first(c.naverMapUrl, c.naverUrl, cc.naverMapUrl, cc.naverUrl),
    email: first(c.email, cc.email)
  };
}
function todayStart() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function dayNo() { return Math.floor(todayStart().getTime() / 86400000); }
function hash(v) { let h=2166136261, s=String(v||''); for(let i=0;i<s.length;i++){h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; }
function todayVerse() {
  const list = state.dailyVerses.filter(v => v && v.text && v.active !== false).sort((a,b)=>hash(`${a.id||''}|${a.ref||''}|${a.text||''}`)-hash(`${b.id||''}|${b.ref||''}|${b.text||''}`));
  return list.length ? list[dayNo() % list.length] : null;
}

function injectStyles() {
  if (document.getElementById('desktopPolishStyles')) return;
  const s = document.createElement('style');
  s.id = 'desktopPolishStyles';
  s.textContent = `
    .desktop-site{display:none;}
    @media (min-width:980px){
      body.desktop-site-ready .app{display:none!important;}
      body.desktop-site-ready .install-banner{display:none!important;}
      body.desktop-site-ready{background:#fff!important;}
      body.desktop-site-ready .desktop-site{display:block;min-height:100vh;background:#fff;color:#171a16;font-family:inherit;}
      .desktop-home-header{position:sticky;top:0;z-index:90;background:rgba(255,255,255,.96);border-bottom:1px solid rgba(20,22,26,.08);backdrop-filter:blur(16px);box-shadow:0 6px 24px rgba(20,22,26,.04)}
      .desktop-home-inner{max-width:1180px;margin:0 auto;padding:0 24px;}
      .desktop-home-top{height:78px;display:flex;align-items:center;justify-content:space-between;gap:28px;}
      .desktop-home-brand{display:flex;align-items:center;gap:12px;min-width:210px;font-weight:950;font-size:23px;letter-spacing:-.9px;color:#153522;}
      .desktop-home-logo{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#73926d,#315b37);display:grid;place-items:center;color:#fff;font-size:19px;font-weight:950;overflow:hidden;flex:0 0 auto;}
      .desktop-home-logo img{width:100%;height:100%;object-fit:cover;display:block;}
      .desktop-home-nav{display:flex;align-items:center;justify-content:center;gap:6px;flex:1;}
      .desktop-home-nav button{border:0;background:transparent;border-radius:999px;padding:9px 13px;font-size:14px;font-weight:850;color:#2c302b;cursor:pointer;white-space:nowrap;}
      .desktop-home-nav button:hover,.desktop-home-nav button.active{background:#eff5eb;color:#315b37;}
      .desktop-home-actions{display:flex;align-items:center;gap:8px;min-width:190px;justify-content:flex-end;}
      .desktop-round-btn{width:42px;height:42px;border-radius:999px;border:1px solid rgba(20,22,26,.12);background:#fff;display:grid;place-items:center;cursor:pointer;font-size:16px;}
      .desktop-login-btn{height:42px;border-radius:11px;border:1px solid rgba(20,22,26,.12);background:#fff;padding:0 14px;font-weight:850;cursor:pointer;color:#2c302b;}
      .desktop-hero{position:relative;min-height:430px;overflow:hidden;background:linear-gradient(135deg,#f7f2e8,#edf4ea);}
      .desktop-hero-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;}
      .desktop-hero::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,.94) 0%,rgba(255,255,255,.78) 42%,rgba(255,255,255,.12) 70%,rgba(0,0,0,.18) 100%);}
      .desktop-hero-content{position:relative;z-index:1;max-width:1180px;margin:0 auto;padding:72px 24px;min-height:430px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;}
      .desktop-hero-content h1{margin:0;font-size:clamp(42px,4vw,58px);line-height:1.18;letter-spacing:-2.2px;font-weight:950;color:#163522;max-width:560px;white-space:pre-line;}
      .desktop-hero-content p{margin:18px 0 0;font-size:18px;line-height:1.7;color:#4b514a;max-width:470px;white-space:pre-line;}
      .desktop-hero-buttons{display:flex;gap:12px;margin-top:28px;}
      .desktop-primary,.desktop-secondary{height:48px;padding:0 24px;border-radius:12px;font-size:15px;font-weight:900;cursor:pointer;}
      .desktop-primary{border:0;background:#174b31;color:#fff;box-shadow:0 10px 24px rgba(23,75,49,.18)}
      .desktop-secondary{border:1px solid rgba(20,22,26,.12);background:#fff;color:#222;}
      .desktop-quick{max-width:1100px;margin:-48px auto 42px;position:relative;z-index:2;display:grid;grid-template-columns:repeat(6,1fr);background:#fff;border:1px solid rgba(20,22,26,.08);border-radius:22px;box-shadow:0 18px 44px rgba(20,22,26,.10);overflow:hidden;}
      .desktop-quick button{height:112px;border:0;border-right:1px solid rgba(20,22,26,.08);background:#fff;cursor:pointer;font-weight:900;font-size:15px;color:#222;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;}
      .desktop-quick button:last-child{border-right:0}.desktop-quick i{font-style:normal;width:42px;height:42px;border-radius:15px;background:#f3f7f0;display:grid;place-items:center;font-size:22px;}
      .desktop-section{max-width:1180px;margin:0 auto 44px;padding:0 24px;}
      .desktop-section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
      .desktop-section-head h2{margin:0;font-size:25px;font-weight:950;letter-spacing:-.9px;color:#20241f;}
      .desktop-more{border:0;background:transparent;color:#666;font-size:14px;font-weight:850;cursor:pointer;}
      .desktop-home-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:stretch;}
      .desktop-card{background:#fff;border:1px solid rgba(20,22,26,.09);border-radius:20px;box-shadow:0 8px 22px rgba(20,22,26,.05);overflow:hidden;}
      .desktop-card-pad{padding:26px;}
      .desktop-service-list{display:grid;gap:0;}.desktop-service-row{display:flex;justify-content:space-between;gap:20px;padding:13px 0;border-top:1px solid rgba(20,22,26,.08);font-size:15px;}.desktop-service-row:first-child{border-top:0}.desktop-service-row b{font-weight:900}.desktop-service-row span{font-weight:850;color:#315b37;text-align:right;}
      .desktop-verse{background:linear-gradient(135deg,#fffdf8 0%,#f8f0df 100%);border-color:rgba(200,145,96,.42);display:flex;flex-direction:column;justify-content:center;min-height:280px;text-align:center;}.desktop-verse .label{font-size:17px;font-weight:950;color:#174b31;margin-bottom:18px}.desktop-verse .text{font-size:22px;line-height:1.75;font-weight:850;color:#2b2d29;white-space:pre-line}.desktop-verse .ref{margin-top:18px;font-size:15px;font-weight:950;color:#8b5c2d;}
      .desktop-card-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}.desktop-news-card{min-height:164px;display:flex;flex-direction:column;}.desktop-news-card img{width:100%;height:132px;object-fit:cover;display:block;background:#f2f2ed}.desktop-news-body{padding:16px;}.desktop-news-body h3{margin:0;font-size:16px;line-height:1.45;font-weight:900;color:#222;}.desktop-news-body p{margin:8px 0 0;font-size:13.5px;color:#666;line-height:1.55;}.desktop-date{margin-top:14px;font-size:12.5px;color:#8b8f85;font-weight:800;}
      .desktop-video-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:16px;}.desktop-video-main{min-height:310px;background:#1b1c1a;color:#fff;position:relative;display:flex;align-items:flex-end;padding:24px;border-radius:20px;overflow:hidden;}.desktop-video-main img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.72}.desktop-video-main .info{position:relative;z-index:1}.desktop-video-main h3{margin:8px 0 0;font-size:24px;line-height:1.35}.desktop-video-side{display:grid;gap:16px}.desktop-small-video{min-height:147px;background:#222;color:#fff;border-radius:18px;padding:18px;display:flex;align-items:flex-end;position:relative;overflow:hidden}.desktop-small-video img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.65}.desktop-small-video div{position:relative;z-index:1;font-weight:900;}
      .desktop-map-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:0;}.desktop-map{min-height:300px;background:linear-gradient(135deg,#e8eee5,#f7f4ed);display:grid;place-items:center;color:#315b37;font-size:54px}.desktop-contact p{margin:10px 0;font-size:15px;color:#414640;}.desktop-contact b{display:inline-block;min-width:58px;color:#111}.desktop-footer{margin-top:56px;background:#174b31;color:#fff;}.desktop-footer .desktop-home-inner{padding:28px 24px;display:flex;justify-content:space-between;gap:24px;align-items:flex-start}.desktop-footer p{margin:6px 0 0;color:rgba(255,255,255,.72);font-size:13px;line-height:1.6}.desktop-empty{padding:28px;border:1px dashed rgba(20,22,26,.16);border-radius:18px;text-align:center;color:#777;background:#fff;font-weight:800;}
      @media (max-width:1160px){.desktop-home-nav button{padding:8px 9px;font-size:13px}.desktop-quick{grid-template-columns:repeat(3,1fr);margin-left:24px;margin-right:24px}.desktop-card-grid{grid-template-columns:repeat(2,1fr)}}
    }
  `;
  document.head.appendChild(s);
}

function ensureShell() {
  if (document.getElementById('desktopSite')) return;
  const el = document.createElement('div');
  el.id = 'desktopSite';
  el.className = 'desktop-site';
  document.body.appendChild(el);
}
function bindMq() {
  mq.addEventListener?.('change', updateVisibility);
  updateVisibility();
}
function updateVisibility() {
  document.body.classList.toggle('desktop-site-ready', mq.matches && !!state.user && !isAdminPage);
  render();
}
function bindAuth() {
  onAuthStateChanged(auth, (user) => {
    state.user = user;
    updateVisibility();
    if (user) bindData();
  });
}
let dataBound = false;
function bindData() {
  if (dataBound) return;
  dataBound = true;
  listen('config', (v) => state.config = v || {});
  listen('services', (v) => state.services = arr(v));
  listen('config/services', (v) => { if (arr(v).length) state.services = arr(v); });
  listen('announcements', (v) => state.announcements = sortRecent(arr(v)));
  listen('sermons', (v) => state.sermons = sortRecent(arr(v)));
  listen('sermonHistory', (v) => state.sermonHistory = sortRecent(arr(v)));
  listen('bulletins', (v) => state.bulletins = sortRecent(arr(v)));
  listen('rooms', (v) => state.rooms = sortRecent(arr(v).filter(r => r.approved !== false)));
  listen('dailyVerses', (v) => state.dailyVerses = arr(v));
  listen('events', (v) => state.events = sortRecent(arr(v)));
}
function listen(path, cb) {
  onValue(ref(db, path), (snap) => { cb(snap.val()); render(); }, () => {});
}

function render() {
  const root = document.getElementById('desktopSite');
  if (!root || !mq.matches || !state.user) return;
  const c = church();
  const verse = todayVerse();
  const anns = state.announcements.slice(0, 3);
  const sermons = [...state.sermons, ...state.sermonHistory].slice(0, 3);
  const rooms = state.rooms.slice(0, 3);
  const services = state.services.slice(0, 8);
  root.innerHTML = `
    <header class="desktop-home-header">
      <div class="desktop-home-top desktop-home-inner">
        <div class="desktop-home-brand"><div class="desktop-home-logo">${c.logo ? `<img src="${esc(c.logo)}" alt="">` : '⛪'}</div><span>${esc(c.name)}</span></div>
        <nav class="desktop-home-nav">
          ${navBtn('home','교회소개',true)}${navBtn('service','예배안내')}${navBtn('word','말씀/설교')}${navBtn('verse','오늘의 말씀')}${navBtn('news','공지사항')}${navBtn('rooms','재능나눔')}${navBtn('map','오시는 길')}
        </nav>
        <div class="desktop-home-actions"><button class="desktop-round-btn" data-desk-search>🔍</button><button class="desktop-login-btn" data-desk-logout>로그아웃</button></div>
      </div>
    </header>
    <section class="desktop-hero" id="desk-home">
      ${c.hero ? `<img class="desktop-hero-img" src="${esc(c.hero)}" alt="">` : ''}
      <div class="desktop-hero-content"><h1>${esc(c.tagline)}</h1>${c.subtitle ? `<p>${esc(c.subtitle)}</p>` : ''}<div class="desktop-hero-buttons"><button class="desktop-primary" data-scroll="service">예배안내 보기</button><button class="desktop-secondary" data-scroll="map">오시는 길</button></div></div>
    </section>
    <div class="desktop-quick">
      <button data-scroll="word"><i>📄</i>주보/말씀</button><button data-scroll="word"><i>▶️</i>설교영상</button><button data-scroll="verse"><i>📖</i>오늘의 말씀</button><button data-scroll="rooms"><i>🤝</i>재능나눔</button><button data-scroll="map"><i>📍</i>오시는 길</button><button data-open-app="me"><i>👤</i>내정보</button>
    </div>
    <section class="desktop-section" id="desk-service"><div class="desktop-home-grid">
      <div class="desktop-card desktop-card-pad"><div class="desktop-section-head"><h2>예배 안내</h2></div>${serviceHtml(services)}</div>
      <div class="desktop-card desktop-card-pad desktop-verse" id="desk-verse"><div class="label">📖 오늘의 말씀</div>${verse ? `<div class="text">“ ${esc(verse.text)} ”</div><div class="ref">${esc(verse.ref || '오늘의 말씀')}</div>` : `<div class="desktop-empty">등록된 오늘의 말씀이 없습니다.</div>`}</div>
    </div></section>
    <section class="desktop-section" id="desk-news"><div class="desktop-section-head"><h2>교회 소식</h2><button class="desktop-more" data-open-app="home">더보기 ›</button></div>${cards(anns,'공지사항')}</section>
    <section class="desktop-section" id="desk-word"><div class="desktop-section-head"><h2>주일 설교 / 말씀 영상</h2><button class="desktop-more" data-open-app="word">더보기 ›</button></div>${sermonHtml(sermons)}</section>
    <section class="desktop-section" id="desk-rooms"><div class="desktop-section-head"><h2>재능나눔</h2><button class="desktop-more" data-open-app="community">더보기 ›</button></div>${cards(rooms,'재능나눔')}</section>
    <section class="desktop-section" id="desk-map"><div class="desktop-section-head"><h2>오시는 길</h2></div><div class="desktop-card desktop-map-grid"><div class="desktop-map">📍</div><div class="desktop-card-pad desktop-contact"><p><b>주소</b>${esc(c.address || '관리자페이지에서 주소를 등록해주세요.')}</p><p><b>전화</b>${esc(c.phone || '관리자페이지에서 전화번호를 등록해주세요.')}</p>${c.email ? `<p><b>이메일</b>${esc(c.email)}</p>` : ''}<button class="desktop-primary" data-map>네이버지도 보기 →</button></div></div></section>
    <footer class="desktop-footer"><div class="desktop-home-inner"><div><b>${esc(c.name)}</b><p>${esc(c.address || '')}<br>${esc(c.phone || '')}</p></div><p>© ${new Date().getFullYear()} ${esc(c.name)}. All rights reserved.</p></div></footer>
  `;
  bindDesktopClicks(c);
}
function navBtn(id, label, active=false) { return `<button class="${active?'active':''}" data-scroll="${id}">${label}</button>`; }
function serviceHtml(list) {
  if (!list.length) return '<div class="desktop-empty">등록된 예배 시간이 없습니다.</div>';
  return `<div class="desktop-service-list">${list.map(s => `<div class="desktop-service-row"><b>${esc(first(s.name,s.title,s.label,'예배'))}</b><span>${esc(first(s.time,s.when,s.desc,s.description,''))}</span></div>`).join('')}</div>`;
}
function imgOf(x) { return first(x.imageUrl,x.imgUrl,x.thumbnail,x.thumb,x.photoUrl,x.coverUrl,x.image,x.url); }
function titleOf(x, fallback) { return first(x.title,x.name,x.subject,x.ref,fallback); }
function bodyOf(x) { return first(x.body,x.text,x.desc,x.description,x.content,''); }
function cards(list, emptyLabel) {
  if (!list.length) return `<div class="desktop-empty">등록된 ${esc(emptyLabel)} 데이터가 없습니다.</div>`;
  return `<div class="desktop-card-grid">${list.map(x => `<article class="desktop-card desktop-news-card">${imgOf(x) ? `<img src="${esc(imgOf(x))}" alt="">` : ''}<div class="desktop-news-body"><h3>${esc(titleOf(x, emptyLabel))}</h3>${bodyOf(x) ? `<p>${esc(bodyOf(x)).slice(0,90)}</p>` : ''}<div class="desktop-date">${esc(dateText(first(x.date,x.timestamp,x.createdAt,x.updatedAt)))}</div></div></article>`).join('')}</div>`;
}
function sermonHtml(list) {
  if (!list.length) return `<div class="desktop-empty">등록된 설교/말씀 영상이 없습니다.</div>`;
  const [main, ...side] = list;
  return `<div class="desktop-video-grid"><article class="desktop-video-main">${imgOf(main)?`<img src="${esc(imgOf(main))}" alt="">`:''}<div class="info"><div>${esc(dateText(first(main.date,main.timestamp,main.createdAt)))}</div><h3>${esc(titleOf(main,'말씀 영상'))}</h3></div></article><div class="desktop-video-side">${side.slice(0,2).map(s=>`<article class="desktop-small-video">${imgOf(s)?`<img src="${esc(imgOf(s))}" alt="">`:''}<div>${esc(titleOf(s,'말씀 영상'))}</div></article>`).join('')}</div></div>`;
}
function bindDesktopClicks(c) {
  document.querySelectorAll('[data-scroll]').forEach(btn => btn.onclick = () => {
    const id = btn.dataset.scroll;
    const target = id === 'home' ? document.querySelector('.desktop-hero') : document.getElementById(`desk-${id}`);
    target?.scrollIntoView({ behavior:'smooth', block:'start' });
  });
  document.querySelector('[data-desk-logout]')?.addEventListener('click', () => signOut(auth));
  document.querySelector('[data-map]')?.addEventListener('click', () => { if (c.naver) window.open(c.naver, '_blank', 'noopener'); });
  document.querySelectorAll('[data-open-app]').forEach(btn => btn.onclick = () => openAppTab(btn.dataset.openApp));
}
function openAppTab(tab) {
  document.body.classList.remove('desktop-site-ready');
  document.querySelector(`.tabbar-item[data-tab="${tab}"]`)?.click();
  setTimeout(() => window.scrollTo({ top:0, behavior:'smooth' }), 50);
}
