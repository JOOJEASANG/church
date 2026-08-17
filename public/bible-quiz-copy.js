// 성경퀴즈 메인 카드 안내 문구를 일관되게 유지합니다.
// 카드가 생성되는 순간만 감시하고 적용 후 즉시 종료해 불필요한 DOM 감시를 남기지 않습니다.
const QUIZ_COPY = '혼자 공부하고, 문제를 내고, 성도들과 퀴즈를 풀어보세요';

function applyQuizCopy() {
  const subtitle = document.querySelector('#bqLaunch .bq-launch-copy span');
  if (!subtitle) return false;
  if (subtitle.textContent !== QUIZ_COPY) subtitle.textContent = QUIZ_COPY;
  return true;
}

function bootQuizCopy() {
  if (applyQuizCopy()) return;

  const target = document.body || document.documentElement;
  const observer = new MutationObserver(() => {
    if (applyQuizCopy()) observer.disconnect();
  });
  observer.observe(target, { childList: true, subtree: true });

  // 비정상적으로 카드가 생성되지 않더라도 감시가 영구 유지되지 않도록 종료합니다.
  setTimeout(() => observer.disconnect(), 10000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootQuizCopy, { once: true });
} else {
  bootQuizCopy();
}
