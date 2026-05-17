/* 재능나눔방 개설 분야 옵션 보정: 기타 추가
 * - 모달이 열릴 때만 한 번 처리 (document 전수 감시 제거)
 */
import { isAdminPage } from '/firebase-init.js';

function hasOption(select, value) {
  return Array.from(select.options || []).some((opt) => opt.value === value || opt.textContent.trim() === value);
}

function looksLikeTalentCategorySelect(select) {
  const key = `${select.id || ''} ${select.name || ''} ${select.className || ''}`.toLowerCase();
  if (/room|talent|category|cate|field|type/.test(key)) return true;

  const labelText = Array.from(document.querySelectorAll('label'))
    .filter((label) => label.htmlFor && label.htmlFor === select.id)
    .map((label) => label.textContent || '')
    .join(' ');
  if (/분야|카테고리|재능|종류/.test(labelText)) return true;

  const nearby = select.closest('.field-row, .form-row, .grid-2, .panel, .modal, form');
  const text = nearby?.textContent || '';
  const optionText = Array.from(select.options || []).map((opt) => opt.textContent.trim()).join(' ');
  return /재능나눔|개설신청|방 개설|분야|카테고리/.test(text) && /교육|음악|운동|상담|봉사|요리|IT|미술|공예/.test(optionText);
}

function addEtcCategoryOption(root = document) {
  if (isAdminPage()) return;
  root.querySelectorAll('select').forEach((select) => {
    if (!looksLikeTalentCategorySelect(select)) return;
    if (hasOption(select, '기타')) return;
    const option = document.createElement('option');
    option.value = '기타';
    option.textContent = '기타';
    select.appendChild(option);
  });
}

function watchModals() {
  if (isAdminPage()) return;
  // 모달이 새로 등장(.show 클래스가 붙음)할 때에만 처리
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.target.classList?.contains('show')) {
        addEtcCategoryOption(m.target);
      } else if (m.type === 'childList') {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches?.('.modal, .modal-bg, [role="dialog"]')) addEtcCategoryOption(node);
          if (node.querySelectorAll) addEtcCategoryOption(node);
        });
      }
    }
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { addEtcCategoryOption(); watchModals(); });
} else {
  addEtcCategoryOption();
  watchModals();
}
