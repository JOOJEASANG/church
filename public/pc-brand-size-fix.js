/* PC모드 사이드바 상단 교회명 크기 보정
 * - 기존 앱형 PC 레이아웃 유지
 * - 왼쪽 사이드바 로고 옆 교회이름만 크게 표시
 */
(function () {
  function inject() {
    if (document.getElementById('pcBrandSizeFixStyle')) return;
    const style = document.createElement('style');
    style.id = 'pcBrandSizeFixStyle';
    style.textContent = `
      @media (min-width: 900px) {
        html:not([data-admin-page]) .tabbar .sidebar-brand {
          padding: 24px 18px 20px !important;
          gap: 14px !important;
          align-items: center !important;
        }
        html:not([data-admin-page]) .tabbar .sidebar-brand .brand-mark {
          width: 48px !important;
          height: 48px !important;
          border-radius: 14px !important;
          flex: 0 0 48px !important;
        }
        html:not([data-admin-page]) .tabbar .sidebar-brand .sb-name,
        html:not([data-admin-page]) .sidebar-brand .sb-name,
        html:not([data-admin-page]) .tabbar .sidebar-brand [data-church="name"] {
          font-size: 22px !important;
          line-height: 1.15 !important;
          font-weight: 950 !important;
          letter-spacing: -1px !important;
          color: var(--text, #15171a) !important;
          white-space: normal !important;
          word-break: keep-all !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
