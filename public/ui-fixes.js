/* =============================================================
 * UI 보정 패치
 * - 관리자 사이드 메뉴 갤러리 제거
 * - PC: 관리자 사이드바 상단 로고 + 교회명 크게 표시
 * - 모바일: 관리자 헤더에 로고 + 교회명 표시, 이메일 숨김, 로그아웃만 표시
 * - 관리자 화면의 "관리자" 브랜드 문구 제거
 * - PC모드 사용자 화면 상단 로고/교회명 중복 표시 정리
 * - 사용자 페이지 사이드바 상단 교회명 확대
 * - 앱 설치 안내 배너 폭 보정
 * ============================================================= */

import { db } from '/firebase-init.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

let churchBrand = {
  name: '천안남산교회',
  logoUrl: '/icons/icon.svg'
};
let churchBrandListening = false;

function isAdminPage() {
  return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
}

function safeAssetUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url, location.href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  } catch {
    return '';
  }
}

function pickChurchName(church = {}) {
  return church.name || church.churchName || church.title || '천안남산교회';
}

function pickChurchLogo(church = {}) {
  return safeAssetUrl(
    church.logoUrl ||
    church.logoURL ||
    church.logo ||
    church.logoImageUrl ||
    church.logoImageURL ||
    church.logoImage ||
    church.logoFileUrl ||
    church.logoFileURL ||
    church.iconUrl ||
    church.iconURL ||
    ''
  ) || '/icons/icon.svg';
}

function injectUiFixStyles() {
  if (document.getElementById('uiFixStyles')) return;
  const style = document.createElement('style');
  style.id = 'uiFixStyles';
  style.textContent = `
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

      /* 사용자 페이지 PC 사이드바 상단 교회명 확대 */
      html:not([data-admin-page]) .app-sidebar .brand-title,
      html:not([data-admin-page]) .app-sidebar .brand-name,
      html:not([data-admin-page]) .app-sidebar .church-name,
      html:not([data-admin-page]) .app-sidebar .church-title,
      html:not([data-admin-page]) .desktop-sidebar .brand-title,
      html:not([data-admin-page]) .desktop-sidebar .brand-name,
      html:not([data-admin-page]) .desktop-sidebar .church-name,
      html:not([data-admin-page]) .desktop-sidebar .church-title,
      html:not([data-admin-page]) .desktop-nav .brand-title,
      html:not([data-admin-page]) .desktop-nav .brand-name,
      html:not([data-admin-page]) .desktop-nav .church-name,
      html:not([data-admin-page]) .desktop-nav .church-title,
      html:not([data-admin-page]) aside .brand-title,
      html:not([data-admin-page]) aside .brand-name,
      html:not([data-admin-page]) aside .church-name,
      html:not([data-admin-page]) aside .church-title,
      html:not([data-admin-page]) aside [class*="brand-title"],
      html:not([data-admin-page]) aside [class*="brand-name"],
      html:not([data-admin-page]) aside [class*="church-name"],
      html:not([data-admin-page]) aside [class*="church-title"] {
        font-size: 24px !important;
        line-height: 1.15 !important;
        font-weight: 950 !important;
        letter-spacing: -0.9px !important;
      }
    }

    html[data-admin-page] .admin-sidebar-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 13px 10px 15px;
      margin: 0 0 8px;
      border-bottom: 1px solid var(--line, #ebece8);
    }
    html[data-admin-page] .admin-sidebar-brand img {
      width: 38px;
      height: 38px;
      border-radius: 11px;
      flex: 0 0 auto;
      object-fit: contain;
      background: #fff;
      box-shadow: 0 2px 8px rgba(20, 22, 26, 0.08);
      border: 1px solid var(--line, #ebece8);
    }
    html[data-admin-page] .admin-sidebar-brand-title {
      font-size: 20px;
      line-height: 1.18;
      font-weight: 900;
      letter-spacing: -0.75px;
      color: var(--text, #15171a);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    html[data-admin-page] .admin-mobile-header-brand {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
      font-size: 17px;
      line-height: 1.2;
      font-weight: 900;
      letter-spacing: -0.55px;
      color: var(--text, #15171a);
    }
    html[data-admin-page] .admin-mobile-header-brand img {
      width: 30px;
      height: 30px;
      border-radius: 9px;
      object-fit: contain;
      background: #fff;
      flex: 0 0 auto;
      border: 1px solid var(--line, #ebece8);
    }
    html[data-admin-page] .admin-mobile-header-brand span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (min-width: 761px) {
      html[data-admin-page] .topbar h1 {
        display: none !important;
      }
      html[data-admin-page] .topbar {
        justify-content: flex-end !important;
        min-height: 52px;
      }
    }

    @media (max-width: 760px) {
      html[data-admin-page] .topbar {
        justify-content: space-between !important;
        gap: 12px !important;
        padding: 12px 16px !important;
      }
      html[data-admin-page] .topbar h1 {
        display: block !important;
        min-width: 0 !important;
        flex: 1 1 auto !important;
        margin: 0 !important;
      }
      html[data-admin-page] .topbar .row {
        flex: 0 0 auto !important;
        gap: 0 !important;
      }
      html[data-admin-page] .topbar .who {
        display: none !important;
      }
      html[data-admin-page] .admin-sidebar-brand {
        display: none !important;
      }
      html[data-admin-page] .sidebar {
        margin-top: 0 !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureAdminSidebarBrand() {
  if (!isAdminPage()) return;
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  let brand = sidebar.querySelector('.admin-sidebar-brand');
  if (!brand) {
    brand = document.createElement('div');
    brand.className = 'admin-sidebar-brand';
    brand.innerHTML = `
      <img src="/icons/icon.svg" alt="교회 로고" />
      <div class="admin-sidebar-brand-title">천안남산교회</div>
    `;
    sidebar.insertBefore(brand, sidebar.firstChild);
  }
  applyChurchBrand();
}

function ensureAdminMobileHeaderBrand() {
  if (!isAdminPage()) return;
  const topTitle = document.querySelector('.topbar h1');
  if (!topTitle) return;

  if (!topTitle.querySelector('.admin-mobile-header-brand')) {
    topTitle.innerHTML = `
      <span class="admin-mobile-header-brand">
        <img src="/icons/icon.svg" alt="교회 로고" />
        <span>천안남산교회</span>
      </span>
    `;
  }
  applyChurchBrand();
}

function applyChurchBrand() {
  document.querySelectorAll('.admin-sidebar-brand img, .admin-mobile-header-brand img').forEach((img) => {
    if (img.getAttribute('src') !== churchBrand.logoUrl) img.setAttribute('src', churchBrand.logoUrl);
  });
  document.querySelectorAll('.admin-sidebar-brand-title').forEach((el) => {
    if (el.textContent !== churchBrand.name) el.textContent = churchBrand.name;
  });
  document.querySelectorAll('.admin-mobile-header-brand > span').forEach((el) => {
    if (el.textContent !== churchBrand.name) el.textContent = churchBrand.name;
  });
}

function listenChurchBrand() {
  if (!isAdminPage() || churchBrandListening) return;
  churchBrandListening = true;
  onValue(ref(db, 'config/church'), (snap) => {
    const church = snap.val() || {};
    churchBrand = {
      name: pickChurchName(church),
      logoUrl: pickChurchLogo(church)
    };
    applyChurchBrand();
  }, () => {
    churchBrand = { name: '천안남산교회', logoUrl: '/icons/icon.svg' };
    applyChurchBrand();
  });
}

function removeAdminGalleryMenu() {
  if (!isAdminPage()) return;
  document.documentElement.setAttribute('data-admin-page', 'true');
  document.querySelectorAll('.nav-item[data-pane="gallery"]').forEach((el) => el.remove());
  document.getElementById('pane-gallery')?.remove();
}

function removeAdminWordFromBrand() {
  if (!isAdminPage()) return;
  document.querySelectorAll('.admin-sidebar-brand-title, .topbar h1').forEach((el) => {
    if (el.querySelector('.admin-mobile-header-brand')) return;
    el.textContent = el.textContent.replace(/\s*[·\-–—|]?\s*관리자\s*/g, '').trim();
  });
}

function runUiFixes() {
  if (isAdminPage()) document.documentElement.setAttribute('data-admin-page', 'true');
  injectUiFixStyles();
  ensureAdminSidebarBrand();
  ensureAdminMobileHeaderBrand();
  listenChurchBrand();
  removeAdminGalleryMenu();
  removeAdminWordFromBrand();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runUiFixes);
} else {
  runUiFixes();
}

[300, 800, 1600, 3000].forEach((ms) => setTimeout(runUiFixes, ms));
