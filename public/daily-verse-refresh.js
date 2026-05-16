/* 오늘의 말씀 자정 트리거
 * - 실제 적용은 daily-verse-final.js가 단독 담당
 * - 이 파일은 날짜 경계/포커스 시 forceRefresh 이벤트만 발화
 */
let lastKey = '';

function dateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function trigger() {
  const key = dateKey();
  if (key === lastKey) return;
  lastKey = key;
  document.dispatchEvent(new CustomEvent('namsan:forceTodayVerseRefresh'));
}

function tick() {
  trigger();
  setTimeout(tick, 60 * 1000);
}

lastKey = dateKey();
document.addEventListener('visibilitychange', () => { if (!document.hidden) trigger(); });
window.addEventListener('focus', trigger);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick);
else tick();
