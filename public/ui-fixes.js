/* =============================================================
 * UI 보정 패치
 * - 관리자 사이드 메뉴 갤러리 제거
 * - 관리자 사이드바 브랜드는 유지
 * - PC모드 사용자 화면 상단 로고/교회명 중복 표시 정리
 * - 데스크탑 관리자 상단 중복 교회명 정리
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

    /* 사용자 앱 PC모드: 좌측/사이드 영역에 브랜드가 있을 때 우측 상단 로고·교회명만 숨김 */
    @media (min-width: 761px) {
      html:not([data-admin-page]) .app-header .greeting-block {
        display: none !important;
      }
      html:not([data-admin-page]) .app-header .header-row {
        justify-content: flex-end !important;
      }
      html:not([data-admin-page]) .app-header {
        padding-top: 14px !important;
        padding-bottom: 8px !important;
      }
    }

    /* 관리자 데스크탑: 사이드바 브랜드는 유지하고, 상단바 중복 제목만 숨김 */
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
