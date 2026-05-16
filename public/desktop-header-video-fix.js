/* PC 헤더/영상 보정 임시 비활성화
 * desktop-polish.js 비활성화와 함께 최근 PC 전용 보정 충돌을 막습니다.
 */
(function(){
  document.getElementById('desktopHeaderVideoFixStyle')?.remove();
  document.getElementById('desktopUserChip')?.remove();
  document.getElementById('desktopLatestVideo')?.remove();
  document.getElementById('desktopNewsRooms')?.remove();
})();
