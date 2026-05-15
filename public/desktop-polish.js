/* PC 모드 롤백
 * 직전 PC 홈페이지형 강제 재배치가 기존 앱 구조와 충돌하여 화면이 틀어지는 문제를 막습니다.
 * 모바일/기존 PC 기본 레이아웃은 index.html 원본 CSS를 그대로 사용합니다.
 * 다음 PC 홈페이지 개편은 별도 PC 전용 홈 DOM을 만든 뒤 단계적으로 적용합니다.
 */
(function(){
  document.getElementById('desktopPolishStyles')?.remove();
  document.getElementById('desktopNavSlot')?.remove();
})();
