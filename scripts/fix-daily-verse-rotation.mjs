import fs from 'node:fs';

const filePath = 'public/app.js';
let source = fs.readFileSync(filePath, 'utf8');
let changes = 0;

function replaceRegex(regex, replacement, marker) {
  if (source.includes(marker)) return;
  const globalRegex = regex.global ? regex : new RegExp(regex.source, `${regex.flags}g`);
  const matches = [...source.matchAll(globalRegex)];
  if (matches.length !== 1) {
    throw new Error(`오늘의 말씀 패치 위치 오류: 예상 1개, 실제 ${matches.length}개`);
  }
  source = source.replace(regex, replacement);
  changes++;
}

replaceRegex(
  /function getTodaysVerseRef\(\) \{[\s\S]*?\n\}\n\nfunction getTodaysVerse\(\) \{[\s\S]*?\n\}\n\nfunction todayKey\(\) \{[\s\S]*?\n\}/,
  `function getSeoulDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  };
}

function getTodaysVerseRef(date = new Date()) {
  // 한국 날짜가 하루 증가할 때 인덱스도 반드시 1씩 증가합니다.
  // 해시 충돌 때문에 연속된 날짜에 같은 말씀이 나오는 문제를 방지합니다.
  const { year, month, day } = getSeoulDateParts(date);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  return ((dayNumber % DAILY_VERSES.length) + DAILY_VERSES.length) % DAILY_VERSES.length;
}

function getTodaysVerse(date = new Date()) {
  return DAILY_VERSES[getTodaysVerseRef(date)] || DAILY_VERSES[0];
}

function todayKey(date = new Date()) {
  const { year, month, day } = getSeoulDateParts(date);
  return \`${'${year}'}${'${String(month).padStart(2, \'0\')}'}${'${String(day).padStart(2, \'0\')}'}\`;
}`,
  'function getSeoulDateParts(date = new Date())'
);

replaceRegex(
  /async function setDailyVerse\(\) \{[\s\S]*?\n\}\nsetDailyVerse\(\);\n\n\/\/ 자정 자동 갱신[\s\S]*?document\.addEventListener\('visibilitychange', \(\) => \{[\s\S]*?\n\}\);/,
  `let renderedDailyVerseKey = '';

function setDailyVerse() {
  const verse = getTodaysVerse();
  const key = todayKey();
  const textEl = document.getElementById('verseText');
  const refEl = document.getElementById('verseRef');
  if (textEl) textEl.textContent = verse.text;
  if (refEl) refEl.textContent = verse.ref;
  renderedDailyVerseKey = key;
}

function refreshDailyVerseIfDateChanged() {
  if (renderedDailyVerseKey !== todayKey()) setDailyVerse();
}

setDailyVerse();

// 한국 날짜 변경을 1분 이내에 감지합니다. 기기 시간대와 무관하게 서울 날짜를 사용합니다.
setInterval(refreshDailyVerseIfDateChanged, 60 * 1000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshDailyVerseIfDateChanged();
});
window.addEventListener('pageshow', refreshDailyVerseIfDateChanged);`,
  'function refreshDailyVerseIfDateChanged()'
);

fs.writeFileSync(filePath, source);
console.log(`오늘의 말씀 일일 변경 로직 수정 완료: ${changes}개 변경`);
