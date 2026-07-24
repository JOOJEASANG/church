/* 봉사신청에서 가능시간 입력 항목을 제거합니다.
 * 기존 app.js와의 호환을 위해 vTime은 숨김 입력으로만 유지하며 항상 빈 값으로 둡니다.
 */
function removeVolunteerTimeField() {
  const modal = document.getElementById('volunteerModal');
  if (!modal) return;

  const subtitle = modal.querySelector('.modal-head .sub');
  if (subtitle) subtitle.textContent = '원하는 봉사 종류를 선택해주세요';

  const timeInput = document.getElementById('vTime');
  if (!timeInput) return;

  const label = timeInput.previousElementSibling;
  if (label?.tagName === 'LABEL' && label.textContent.trim() === '가능 시간') {
    label.remove();
  }

  timeInput.type = 'hidden';
  timeInput.value = '';
  timeInput.removeAttribute('class');
  timeInput.removeAttribute('placeholder');
  timeInput.setAttribute('aria-hidden', 'true');
  timeInput.tabIndex = -1;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', removeVolunteerTimeField, { once: true });
} else {
  removeVolunteerTimeField();
}
