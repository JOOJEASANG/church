/* PC 전용 홈페이지 셸 임시 비활성화
 * 최근 PC 전용 DOM/레이아웃 보정이 기존 앱 구조와 충돌할 수 있어 긴급 복구합니다.
 * 기존 index.html 원본 PC/모바일 화면을 그대로 사용합니다.
 */
(function(){
  document.body?.classList.remove('desktop-site-ready');
  document.getElementById('desktopSite')?.remove();
  document.getElementById('desktopPolishStyles')?.remove();
})();
