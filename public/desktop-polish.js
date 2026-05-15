/* PC 모드 전용 일반 교회 홈페이지형 레이아웃
 * - 기존 모바일 앱 구조는 유지
 * - PC에서는 좌측 사이드바를 없애고 상단 메뉴형 홈페이지처럼 표시
 * - 가상 데이터/이미지 추가 없이 현재 운영 데이터 DOM만 재배치/스타일링
 */
(function(){
  const mq = window.matchMedia('(min-width: 980px)');
  let originalNavParent = null;
  let originalNavNext = null;

  function installStyles(){
    if(document.getElementById('desktopPolishStyles')) return;
    const s=document.createElement('style');
    s.id='desktopPolishStyles';
    s.textContent=`
      @media (min-width:980px){
        html{background:#fff!important}body{background:#fff!important;min-height:100vh;color:var(--text,#15171a)}
        body::before{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(180deg,#ffffff 0%,#fbfaf6 62%,#f4efe5 100%)}
        .app{display:block!important;max-width:none!important;width:100%!important;margin:0!important;min-height:100vh!important;background:#fff!important;border:0!important;border-radius:0!important;box-shadow:none!important;overflow:visible!important;padding-left:0!important}
        .app-header{position:sticky!important;top:0!important;z-index:80!important;width:100%!important;margin:0!important;padding:0!important;background:rgba(255,255,255,.96)!important;border:0!important;border-bottom:1px solid rgba(20,22,26,.08)!important;border-radius:0!important;box-shadow:0 6px 22px rgba(20,22,26,.04)!important;backdrop-filter:blur(14px)!important}
        .header-row{max-width:1180px!important;margin:0 auto!important;height:76px!important;padding:0 24px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:28px!important}
        .greeting-block{gap:12px!important;flex:0 0 auto!important}.brand-mark{width:42px!important;height:42px!important;border-radius:12px!important}.greeting .name{font-size:22px!important;font-weight:950!important;letter-spacing:-.8px!important;color:#163526!important}
        .header-actions{display:flex!important;align-items:center!important;gap:8px!important;flex:0 0 auto!important}.icon-btn,.admin-icon-shortcut{width:42px!important;height:42px!important;min-width:42px!important;border-radius:999px!important;background:#fff!important;border:1px solid rgba(20,22,26,.12)!important;box-shadow:none!important}
        .desktop-nav-slot{display:flex!important;align-items:center!important;justify-content:center!important;flex:1 1 auto!important;min-width:0!important}
        .tabbar{position:static!important;left:auto!important;right:auto!important;bottom:auto!important;top:auto!important;transform:none!important;width:auto!important;height:auto!important;max-width:none!important;padding:0!important;margin:0!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;backdrop-filter:none!important;display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:center!important;gap:6px!important;overflow:visible!important;z-index:auto!important}
        .sidebar-brand{display:none!important}.tabbar-item{width:auto!important;min-width:auto!important;height:auto!important;margin:0!important;padding:9px 13px!important;border-radius:999px!important;display:inline-flex!important;flex-direction:row!important;align-items:center!important;justify-content:center!important;gap:6px!important;color:#30342f!important;background:transparent!important;border:0!important;box-shadow:none!important;white-space:nowrap!important;flex:0 0 auto!important}.tabbar-item .ti{display:none!important}.tabbar-item .tl{font-size:14px!important;font-weight:850!important;letter-spacing:-.35px!important}.tabbar-item.active{background:#eff5eb!important;color:#315b37!important}.tabbar-item:hover{background:#f6f5f0!important;color:#315b37!important}
        .main{max-width:1180px!important;margin:0 auto!important;padding:0 24px 84px!important;overflow:visible!important}.tab-pane.active{max-width:none!important;margin:0!important}.tab-pane:not(.active){display:none!important}
        #tab-home.active{display:grid!important;grid-template-columns:1.05fr .95fr!important;column-gap:32px!important;row-gap:34px!important;align-items:start!important}.hero{grid-column:1 / -1!important;margin:0 -24px 0!important;border-radius:0!important;min-height:430px!important;background:#eef2ea!important;box-shadow:none!important;overflow:hidden!important}.hero-img{width:100%!important;height:430px!important;min-height:430px!important;max-height:none!important;object-fit:cover!important;object-position:center!important;display:block!important}.hero.has-custom-img .hero-img{height:430px!important;min-height:430px!important;object-fit:cover!important}.hero-overlay{background:linear-gradient(90deg,rgba(255,255,255,.92) 0%,rgba(255,255,255,.72) 39%,rgba(255,255,255,.08) 68%,rgba(0,0,0,.18) 100%)!important}.hero-content{position:absolute!important;inset:0 auto 0 0!important;width:min(560px,52%)!important;padding:72px 0 72px max(58px,calc((100vw - 1180px)/2 + 24px))!important;display:flex!important;justify-content:center!important;align-items:flex-start!important;color:#173424!important}.hero h1{font-size:clamp(42px,4vw,58px)!important;line-height:1.18!important;letter-spacing:-2.2px!important;font-weight:950!important;margin:0 0 18px!important}.hero p{font-size:18px!important;line-height:1.7!important;color:#4a5149!important;margin:0!important;max-width:420px!important}
        .hero-content::after{content:'예배안내 보기  →';display:inline-flex;align-items:center;justify-content:center;margin-top:28px;padding:15px 24px;border-radius:12px;background:#174b31;color:#fff;font-size:15px;font-weight:900;box-shadow:0 10px 24px rgba(23,75,49,.18)}
        .quick-actions{grid-column:1 / -1!important;transform:translateY(-46px)!important;margin:0 auto -32px!important;max-width:1080px!important;width:100%!important;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:0!important;background:#fff!important;border:1px solid rgba(20,22,26,.08)!important;border-radius:24px!important;box-shadow:0 18px 44px rgba(20,22,26,.10)!important;overflow:hidden!important;padding:0!important}.quick-action{min-height:112px!important;border:0!important;border-right:1px solid rgba(20,22,26,.08)!important;border-radius:0!important;background:#fff!important;padding:18px 12px!important;box-shadow:none!important}.quick-action:last-child{border-right:0!important}.quick-action .ico{width:44px!important;height:44px!important;margin:0 auto 8px!important;border-radius:16px!important;background:#f3f7f0!important;font-size:22px!important}.quick-action span{font-size:15px!important;font-weight:900!important;line-height:1.35!important}
        .service-times{grid-column:1!important;margin:0!important;border:1px solid rgba(20,22,26,.09)!important;border-radius:20px!important;background:#fff!important;box-shadow:0 10px 28px rgba(20,22,26,.05)!important;overflow:hidden!important}.service-times-head{cursor:default!important;padding:22px 24px!important}.service-times-head .service-times-toggle{display:none!important}.service-list{display:block!important;padding:0 24px 24px!important;max-height:none!important}.service-row{padding:12px 0!important;border-top:1px solid rgba(20,22,26,.08)!important}.service-row .name{font-size:15px!important}.service-row .time{font-size:15px!important;font-weight:800!important;color:#315b37!important}
        .verse-card{grid-column:2!important;margin:0!important;min-height:100%!important;border:1px solid rgba(200,145,96,.42)!important;border-radius:20px!important;background:linear-gradient(135deg,#fffdf8 0%,#f8f0df 100%)!important;box-shadow:0 10px 28px rgba(200,145,96,.10)!important;padding:28px 30px!important;display:flex!important;flex-direction:column!important;justify-content:center!important}.verse-label{font-size:17px!important;font-weight:950!important;color:#174b31!important;margin-bottom:18px!important}.verse-text{font-size:22px!important;line-height:1.75!important;text-align:center!important;font-weight:850!important;color:#2b2d29!important;margin:8px 0 16px!important}.verse-ref{font-size:15px!important;text-align:center!important;color:#8b5c2d!important;font-weight:900!important}.verse-actions{justify-content:center!important;margin-top:22px!important}.verse-action-btn{border-radius:999px!important;padding:9px 15px!important}
        #tab-home>.section{grid-column:1!important;margin:0!important}.section-title{margin:0 0 16px!important}.section-title h2,.section-head h2{font-size:24px!important;font-weight:950!important;letter-spacing:-.9px!important}.section-title a{font-size:14px!important;font-weight:850!important;color:#666!important}.feed{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:16px!important}.feed-card{border:1px solid rgba(20,22,26,.09)!important;border-radius:18px!important;background:#fff!important;box-shadow:0 8px 22px rgba(20,22,26,.05)!important;padding:18px!important;min-height:142px!important}.feed-card h3{font-size:16px!important;line-height:1.45!important}.feed-card p{font-size:14px!important;line-height:1.55!important}
        .video-card,.panel,.card,.prayer-card,.post-card,.room-card,.list-row{border-radius:20px!important;box-shadow:0 8px 22px rgba(20,22,26,.05)!important}.video-card{display:grid!important;grid-template-columns:1.2fr .8fr!important;gap:0!important;max-width:none!important}.video-frame{border-radius:20px 0 0 20px!important;overflow:hidden!important}.video-info{padding:28px!important}.prayer-feed,.post-feed,.room-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:16px!important}.apply-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:16px!important}.gallery-grid{grid-template-columns:repeat(6,1fr)!important;gap:10px!important}
        .modal{border-radius:26px!important;max-width:640px!important}.install-banner{left:50%!important;right:auto!important;bottom:18px!important;transform:translateX(-50%)!important;max-width:720px!important;width:calc(100% - 96px)!important}.toast{bottom:24px!important}
      }
      @media (min-width:1280px){.main,.header-row{max-width:1240px!important}#tab-home.active{column-gap:38px!important}.hero-content{padding-left:max(64px,calc((100vw - 1240px)/2 + 24px))!important}}
      @media (min-width:980px) and (max-width:1120px){.tabbar-item{padding:8px 9px!important}.tabbar-item .tl{font-size:13px!important}.header-row{gap:16px!important}.hero h1{font-size:40px!important}}
    `;
    document.head.appendChild(s);
  }

  function ensureDesktopNavSlot(){
    const row=document.querySelector('.app-header .header-row');
    if(!row) return null;
    let slot=document.getElementById('desktopNavSlot');
    if(!slot){
      slot=document.createElement('div');
      slot.id='desktopNavSlot';
      slot.className='desktop-nav-slot';
      const actions=row.querySelector('.header-actions');
      if(actions) row.insertBefore(slot,actions); else row.appendChild(slot);
    }
    return slot;
  }

  function moveNav(){
    const nav=document.querySelector('.tabbar');
    if(!nav) return;
    if(!originalNavParent){ originalNavParent=nav.parentNode; originalNavNext=nav.nextSibling; }
    if(mq.matches){
      const slot=ensureDesktopNavSlot();
      if(slot && nav.parentNode!==slot) slot.appendChild(nav);
    }else if(originalNavParent && nav.parentNode!==originalNavParent){
      if(originalNavNext && originalNavNext.parentNode===originalNavParent) originalNavParent.insertBefore(nav,originalNavNext);
      else originalNavParent.appendChild(nav);
      document.getElementById('desktopNavSlot')?.remove();
    }
  }

  function renameDesktopLabels(){
    const map={home:'홈',word:'말씀/설교',calendar:'예배·일정',community:'재능나눔',board:'공지·나눔',me:'내정보'};
    document.querySelectorAll('.tabbar-item').forEach(btn=>{
      const key=btn.dataset.tab;
      const label=btn.querySelector('.tl');
      if(label&&map[key]) label.textContent=map[key];
    });
  }

  installStyles();
  renameDesktopLabels();
  moveNav();
  mq.addEventListener?.('change',moveNav);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{renameDesktopLabels();moveNav();});
  new MutationObserver(()=>{renameDesktopLabels();moveNav();}).observe(document.documentElement,{childList:true,subtree:true});
})();
