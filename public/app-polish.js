/* 천안남산교회 공통 사용성·접근성 디테일 보정
 * - 모바일 확대 허용
 * - 키보드 포커스 가시성
 * - OS 모션 최소화 설정 존중
 * - 터치 반응/비활성 버튼 상태 정리
 * - 관리자 모바일 헤더 아이콘 간격 통일
 */

function improveViewport() {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) return;
  viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
}

function injectPolishStyles() {
  if (document.getElementById('appPolishStyles')) return;
  const style = document.createElement('style');
  style.id = 'appPolishStyles';
  style.textContent = `
    html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }

    button, a, [role="button"], input, select, textarea {
      -webkit-tap-highlight-color: transparent;
    }
    button, a, [role="button"] { touch-action: manipulation; }

    :where(button, a, input, select, textarea, [role="button"], [tabindex]):focus-visible {
      outline: 3px solid color-mix(in srgb, var(--primary, #73926d) 55%, transparent);
      outline-offset: 2px;
    }

    button:disabled, input:disabled, select:disabled, textarea:disabled {
      cursor: not-allowed;
    }

    @media (hover: hover) and (pointer: fine) {
      :where(.card, .feed-card, .bq-card, .quick-action, .menu-item, .nav-item) {
        transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, background-color .16s ease;
      }
      :where(.bq-card, .quick-action, .menu-item):hover {
        transform: translateY(-1px);
      }
    }

    @media (max-width: 760px) {
      html[data-admin-page] .topbar .row {
        gap: 8px !important;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto !important; }
      *, *::before, *::after {
        scroll-behavior: auto !important;
        animation-duration: .01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: .01ms !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function boot() {
  improveViewport();
  injectPolishStyles();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
