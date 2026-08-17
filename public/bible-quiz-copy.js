// 성경퀴즈 메인 카드 안내 문구를 일관되게 유지합니다.
const QUIZ_COPY = '혼자 공부하고, 문제를 내고, 성도들과 퀴즈를 풀어보세요';

function applyQuizCopy() {
  const subtitle = document.querySelector('#bqLaunch .bq-launch-copy span');
  if (subtitle && subtitle.textContent !== QUIZ_COPY) subtitle.textContent = QUIZ_COPY;
}

applyQuizCopy();

const observer = new MutationObserver(() => applyQuizCopy());
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
