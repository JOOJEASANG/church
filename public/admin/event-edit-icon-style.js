/* 교회일정 수정 버튼에 DOM 변경 없이 연필 아이콘만 표시합니다. */

function installEventEditIconStyle() {
  if (document.getElementById('eventEditIconStyle')) return;

  const style = document.createElement('style');
  style.id = 'eventEditIconStyle';
  style.textContent = `
    #eventsList [data-edit-ev] {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      gap: 5px;
      min-width: 74px;
      white-space: nowrap;
    }

    #eventsList [data-edit-ev]::before {
      content: '';
      display: block;
      width: 14px;
      height: 14px;
      flex: 0 0 14px;
      background-color: currentColor;
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 16.5V20h3.5L18.3 9.2l-3.5-3.5L4 16.5Zm16.7-9.6a1 1 0 0 0 0-1.4l-2.2-2.2a1 1 0 0 0-1.4 0l-1.7 1.7 3.5 3.5 1.8-1.6Z'/%3E%3C/svg%3E") center / contain no-repeat;
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 16.5V20h3.5L18.3 9.2l-3.5-3.5L4 16.5Zm16.7-9.6a1 1 0 0 0 0-1.4l-2.2-2.2a1 1 0 0 0-1.4 0l-1.7 1.7 3.5 3.5 1.8-1.6Z'/%3E%3C/svg%3E") center / contain no-repeat;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installEventEditIconStyle, { once: true });
} else {
  installEventEditIconStyle();
}
