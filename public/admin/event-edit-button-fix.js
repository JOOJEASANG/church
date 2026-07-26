/* 교회일정 수정 버튼의 연필 아이콘을 모든 행에서 동일하게 표시합니다. */

const BUTTON_SELECTOR = '#eventsList [data-edit-ev]';
const ICON_HTML = `
  <svg class="event-edit-pencil" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M4 16.5V20h3.5L18.3 9.2l-3.5-3.5L4 16.5Zm16.7-9.6a1 1 0 0 0 0-1.4l-2.2-2.2a1 1 0 0 0-1.4 0l-1.7 1.7 3.5 3.5 1.8-1.6Z" fill="currentColor"/>
  </svg>
  <span>수정</span>`;

function injectStyle() {
  if (document.getElementById('eventEditButtonFixStyle')) return;
  const style = document.createElement('style');
  style.id = 'eventEditButtonFixStyle';
  style.textContent = `
    ${BUTTON_SELECTOR} {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      gap: 4px;
      min-width: 72px;
      white-space: nowrap;
    }
    ${BUTTON_SELECTOR} .event-edit-pencil {
      width: 14px;
      height: 14px;
      flex: 0 0 14px;
      display: block;
    }
  `;
  document.head.appendChild(style);
}

function normalizeButtons(root = document) {
  const buttons = root.matches?.('[data-edit-ev]')
    ? [root]
    : Array.from(root.querySelectorAll?.(BUTTON_SELECTOR) || []);

  buttons.forEach((button) => {
    if (button.querySelector('.event-edit-pencil') && button.querySelector('span')?.textContent === '수정') return;
    button.innerHTML = ICON_HTML;
    button.setAttribute('aria-label', '일정 수정');
    button.title = '일정 수정';
  });
}

function boot() {
  injectStyle();
  normalizeButtons();

  const target = document.getElementById('eventsList') || document.body;
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) normalizeButtons(node);
      });
    });
    normalizeButtons();
  });
  observer.observe(target, { childList: true, subtree: true, characterData: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
