/* =============================================================
 * UI 보정 패치
 * - 관리자 사이드 메뉴 갤러리 제거
 * - 관리자 사이드바 상단 로고 + 교회명 표시
 * - 관리자 화면의 "관리자" 브랜드 문구 제거
 * - PC모드 사용자 화면 상단 로고/교회명 중복 표시 정리
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

    /* 관리자 사이드바 브랜드 */
    html[data-admin-page] .admin-sidebar-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 10px 14px;
      margin: 0 0 8px;
      border-bottom: 1px solid var(--line, #ebece8);
    }
    html[data-admin-page] .admin-sidebar-brand img {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      flex: 0 0 auto;
      box-shadow: 0 2px 8px rgba(20, 22, 26, 0.08);
    }
    html[data-admin-page] .admin-sidebar-brand-title {
      font-size: 18px;
      line-height: 1.2;
      font-weight: 900;
      letter-spacing: -0.6px;
      color: var(--text, #15171a);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* 관리자 데스크탑: 상단바 중복 제목은 숨기고, 계정/로그아웃만 표시 */
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

function ensureAdminSidebarBrand() {
  if (!isAdminPage()) return;
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar || sidebar.querySelector('.admin-sidebar-brand')) return;

  const brand = document.createElement('div');
  brand.className = 'admin-sidebar-brand';
  brand.innerHTML = `
    <img src="/icons/icon.svg" alt="천안남산교회 로고" />
    <div class="admin-sidebar-brand-title">천안남산교회</div>
  `;
  sidebar.insertBefore(brand, sidebar.firstChild);
}

function removeAdminGalleryMenu() {
  if (!isAdminPage()) return;
  document.documentElement.setAttribute('data-admin-page', 'true');
  document.querySelectorAll('.nav-item[data-pane="gallery"]').forEach((el) => el.remove());
  document.getElementById('pane-gallery')?.remove();
}

function removeAdminWordFromBrand() {
  if (!isAdminPage()) return;
  document.querySelectorAll('.admin-sidebar-brand-title, .sidebar h1, .sidebar h2, .topbar h1').forEach((el) => {
    el.textContent = el.textContent.replace(/\s*[·\-–—|]?\s*관리자\s*/g, '').trim();
  });
}

function runUiFixes() {
  if (isAdminPage()) document.documentElement.setAttribute('data-admin-page', 'true');
  injectUiFixStyles();
  ensureAdminSidebarBrand();
  removeAdminGalleryMenu();
  removeAdminWordFromBrand();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runUiFixes);
} else {
  runUiFixes();
}

[300, 800, 1600, 3000].forEach((ms) => setTimeout(runUiFixes, ms));
