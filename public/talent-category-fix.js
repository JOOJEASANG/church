/* 재능나눔방 개설 분야 옵션 보정: 기타 추가 */
function isAdminPage() {
  return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
}

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

  const nearby = select.closest('.field-row, .form-row, .grid-2, .panel, .modal, form, div');
  const text = nearby?.textContent || '';
  const optionText = Array.from(select.options || []).map((opt) => opt.textContent.trim()).join(' ');
  return /재능나눔|개설신청|방 개설|분야|카테고리/.test(text) && /교육|음악|운동|상담|봉사|요리|IT|미술|공예/.test(optionText);
}

function addEtcCategoryOption() {
  if (isAdminPage()) return;
  document.querySelectorAll('select').forEach((select) => {
    if (!looksLikeTalentCategorySelect(select)) return;
    if (hasOption(select, '기타')) return;
    const option = document.createElement('option');
    option.value = '기타';
    option.textContent = '기타';
    select.appendChild(option);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addEtcCategoryOption);
else addEtcCategoryOption();

[300, 800, 1600, 3000].forEach((ms) => setTimeout(addEtcCategoryOption, ms));
new MutationObserver(addEtcCategoryOption).observe(document.documentElement, { childList: true, subtree: true });
