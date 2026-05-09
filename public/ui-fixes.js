/* =============================================================
 * UI 보정 패치
 * - 관리자 사이드 메뉴 갤러리 제거
 * - 데스크탑 관리자 상단 중복 교회명 숨김
 * - 앱 설치 안내 배너 폭 보정
 * ============================================================= */

function isAdminPage() {
  return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
}

function injectUiFixStyles() {
  if (document.getElementById('uiFixStyles')) return;
  const style = document.createElement('style');
  style.id = 'uiFixStyles';
  style.textContent = `
    /* 사용자 앱: 설치 안내가 앱 레이아웃보다 넓어지지 않도록 제한 */
    html:not([data-admin-page]) .install-banner,
    html:not([data-admin-page]) #installBanner,
    html:not([data-admin-page]) .install-prompt,
    html:not([data-admin-page]) #installPrompt,
    html:not([data-admin-page]) .pwa-install,
    html:not([data-admin-page]) [data-install-banner] {
      box-sizing: border-box !important;
      width: calc(100% - 32px) !important;
      max-width: 688px !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }
    html:not([data-admin-page]) .install-banner[style*="fixed"],
    html:not([data-admin-page]) #installBanner[style*="fixed"],
    html:not([data-admin-page]) .install-prompt[style*="fixed"],
    html:not([data-admin-page]) #installPrompt[style*="fixed"],
    html:not([data-admin-page]) .pwa-install[style*="fixed"],
    html:not([data-admin-page]) [data-install-banner][style*="fixed"] {
      left: 50% !important;
      right: auto !important;
      transform: translateX(-50%) !important;
    }
    html:not([data-admin-page]) .app .install-banner,
    html:not([data-admin-page]) .app #installBanner,
    html:not([data-admin-page]) .app .install-prompt,
    html:not([data-admin-page]) .app #installPrompt,
    html:not([data-admin-page]) .app .pwa-install,
    html:not([data-admin-page]) .app [data-install-banner] {
      max-width: 100% !important;
    }

    /* 관리자 데스크탑: 사이드바가 브랜드 영역이면 상단 중복 제목은 숨김 */
    @media (min-width: 761px) {
      html[data-admin-page] .topbar h1 {
        display: none !important;
      }
      html[data-admin-page] .topbar {
        justify-content: flex-end !important;
        min-height: 52px;
      }
    }
  `;
  document.head.appendChild(style);
}

function removeAdminGalleryMenu() {
  if (!isAdminPage()) return;
  document.documentElement.setAttribute('data-admin-page', 'true');
  document.querySelectorAll('.nav-item[data-pane="gallery"]').forEach((el) => el.remove());
  document.getElementById('pane-gallery')?.remove();
}

function runUiFixes() {
  if (isAdminPage()) document.documentElement.setAttribute('data-admin-page', 'true');
  injectUiFixStyles();
  removeAdminGalleryMenu();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runUiFixes);
} else {
  runUiFixes();
}

[300, 800, 1600, 3000].forEach((ms) => setTimeout(runUiFixes, ms));
