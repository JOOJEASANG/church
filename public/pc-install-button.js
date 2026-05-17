/* PC 모드 앱설치 버튼
 * - 모바일 설치 배너는 그대로 유지
 * - PC(761px 이상)에서는 헤더 오른쪽 아이콘 영역에 설치 버튼 표시
 */

let deferredInstallPrompt = null;
let installed = false;
const mq = window.matchMedia('(min-width: 761px)');

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isAdminPage() {
  return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
}

function injectStyles() {
  if (document.getElementById('pcInstallButtonStyles')) return;
  const style = document.createElement('style');
  style.id = 'pcInstallButtonStyles';
  style.textContent = `
    .pc-install-btn {
      width: 38px;
      height: 38px;
      min-width: 38px;
      border-radius: 999px;
      border: 1px solid var(--line, #ebece8);
      background: var(--paper, #fff);
      display: grid;
      place-items: center;
      cursor: pointer;
      font-size: 16px;
      color: var(--text, #15171a);
      position: relative;
      box-shadow: var(--shadow-xs, 0 1px 2px rgba(20,22,26,.04));
    }
    .pc-install-btn:hover { border-color: var(--line-strong, #d9dad4); }
    .pc-install-btn:active { background: var(--bg, #fafaf7); }
    @media (min-width: 761px) {
      html:not([data-admin-page]) .install-banner,
      html:not([data-admin-page]) #installBanner,
      html:not([data-admin-page]) .install-prompt,
      html:not([data-admin-page]) #installPrompt,
      html:not([data-admin-page]) .pwa-install,
      html:not([data-admin-page]) [data-install-banner] {
        display: none !important;
      }
    }
    @media (max-width: 760px) {
      .pc-install-btn { display: none !important; }
    }
  `;
  document.head.appendChild(style);
}

function findHeaderActions() {
  return document.querySelector('.app-header .header-actions, header .header-actions, .header-actions');
}

function findExistingInstallButton() {
  const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'));
  return candidates.find((el) => {
    if (el.id === 'pcInstallButton') return false;
    const label = `${el.textContent || ''} ${el.id || ''} ${el.className || ''} ${el.getAttribute('aria-label') || ''} ${el.title || ''}`;
    return /앱\s*설치|설치하기|install|pwa/i.test(label);
  }) || null;
}

function shouldShow() {
  return !isAdminPage() && mq.matches && !installed && !isStandalone() && (!!deferredInstallPrompt || !!findExistingInstallButton());
}

async function runInstall() {
  const existing = findExistingInstallButton();
  if (existing && existing.offsetParent !== null) {
    existing.click();
    return;
  }
  if (!deferredInstallPrompt) return;
  try {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
  } catch (e) {
    console.warn('[pc-install-button] 설치 프롬프트 실패:', e?.message || e);
  } finally {
    deferredInstallPrompt = null;
    render();
  }
}

function ensureButton() {
  const actions = findHeaderActions();
  if (!actions) return;
  let btn = document.getElementById('pcInstallButton');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'pcInstallButton';
    btn.type = 'button';
    btn.className = 'pc-install-btn';
    btn.title = '앱 설치';
    btn.setAttribute('aria-label', '앱 설치');
    btn.textContent = '⬇️';
    btn.addEventListener('click', runInstall);
  }
  if (btn.parentElement !== actions) {
    const searchBtn = Array.from(actions.querySelectorAll('button, a, [role="button"]')).find((el) => /검색|search|🔍/i.test(`${el.textContent || ''} ${el.id || ''} ${el.className || ''} ${el.getAttribute('aria-label') || ''} ${el.title || ''}`));
    if (searchBtn) searchBtn.insertAdjacentElement('afterend', btn);
    else actions.prepend(btn);
  }
}

function render() {
  injectStyles();
  if (!shouldShow()) {
    document.getElementById('pcInstallButton')?.remove();
    return;
  }
  ensureButton();
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installed = false;
  render();
});

window.addEventListener('appinstalled', () => {
  installed = true;
  deferredInstallPrompt = null;
  render();
});

mq.addEventListener?.('change', render);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
else render();
[400, 1000, 2000, 4000].forEach((ms) => setTimeout(render, ms));

// 헤더가 나중에 생성될 경우를 대비해 body 직접 자식만 감시
function startHeaderObserver() {
  const headerEl = document.querySelector('.app-header, header');
  if (headerEl) {
    new MutationObserver(render).observe(headerEl, { childList: true, subtree: true });
    return;
  }
  if (!document.body) return;
  const obs = new MutationObserver(() => {
    if (document.querySelector('.app-header, header')) {
      obs.disconnect();
      startHeaderObserver();
      render();
    }
  });
  obs.observe(document.body, { childList: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startHeaderObserver);
} else {
  startHeaderObserver();
}
