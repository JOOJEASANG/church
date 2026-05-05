// 자동 하이픈 포매터
// 사용: <input data-format="phone"> 또는 <input data-format="biz">

(function () {
  'use strict';

  function formatPhone(raw) {
    const d = String(raw).replace(/\D/g, '').slice(0, 11);
    if (!d) return '';
    if (d.startsWith('02')) {
      if (d.length <= 2) return d;
      if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
      if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
      return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
    }
    if (d.length <= 3) return d;
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
    if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }

  function formatBiz(raw) {
    const d = String(raw).replace(/\D/g, '').slice(0, 10);
    if (!d) return '';
    if (d.length <= 3) return d;
    if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  }

  const FORMATTERS = { phone: formatPhone, biz: formatBiz };

  function attach(el) {
    if (!el || el.dataset.formatBound === '1') return;
    const kind = el.dataset.format;
    const fn = FORMATTERS[kind];
    if (!fn) return;
    el.dataset.formatBound = '1';
    if (!el.getAttribute('inputmode')) el.setAttribute('inputmode', 'numeric');
    if (!el.getAttribute('autocomplete')) {
      el.setAttribute('autocomplete', kind === 'phone' ? 'tel' : 'off');
    }
    if (kind === 'phone' && !el.type) el.type = 'tel';

    const reformat = (preserveCursor) => {
      const before = el.value;
      const cursor = preserveCursor ? (el.selectionStart || 0) : before.length;
      const digitsBefore = before.slice(0, cursor).replace(/\D/g, '').length;
      const formatted = fn(before);
      if (formatted === before) return;
      el.value = formatted;
      if (!preserveCursor) return;
      let pos = 0, count = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (count >= digitsBefore) { pos = i; break; }
        if (/\d/.test(formatted[i])) count++;
        pos = i + 1;
      }
      try { el.setSelectionRange(pos, pos); } catch (_) {}
    };

    el.addEventListener('input', () => reformat(true));
    el.addEventListener('blur', () => reformat(false));
    if (el.value) reformat(false);
  }

  function scan(root) {
    (root || document).querySelectorAll('[data-format]').forEach(attach);
  }

  function init() {
    scan(document);
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.matches && n.matches('[data-format]')) attach(n);
          if (n.querySelectorAll) scan(n);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AutoFormat = { formatPhone, formatBiz, attach, scan };
})();
