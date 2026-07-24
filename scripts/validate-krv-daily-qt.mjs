import fs from 'node:fs';
import vm from 'node:vm';

const init = fs.readFileSync('public/firebase-init.js', 'utf8');
const daily = fs.readFileSync('public/bible-daily-qt.js', 'utf8');
const rules = JSON.parse(fs.readFileSync('database.rules.json', 'utf8'));
const failures = [];

for (const legacy of [
  '/daily-verses.js',
  '/daily-verses-list-fix.js',
  '/daily-verses-seed.js',
  '/daily-verse-final.js'
]) {
  if (init.includes(legacy)) failures.push(`레거시 말씀 모듈 로딩이 남아 있습니다: ${legacy}`);
}

for (const [condition, message] of [
  [init.includes("loadModule('/bible-daily-qt.js'"), '개역한글판/성경큐티 모듈이 사용자 앱에 로드되지 않습니다.'],
  [daily.includes("timeZone: 'Asia/Seoul'"), '오늘의 말씀과 큐티가 한국 날짜를 사용하지 않습니다.'],
  [daily.includes('개역한글판'), '개역한글판 표기가 없습니다.'],
  [daily.includes('boardQtPane'), '커뮤니티 성경큐티 영역이 없습니다.'],
  [daily.includes('namsanQtComplete:'), '일일 큐티 완료 기록이 없습니다.'],
  [!Object.hasOwn(rules.rules || {}, 'dailyVerses'), 'database.rules.json에 레거시 dailyVerses 경로가 남아 있습니다.']
]) {
  if (!condition) failures.push(message);
}

const match = daily.match(/const KRV_DAILY = (\[[\s\S]*?\n\]);\n\nconst QT_TEMPLATES/);
if (!match) {
  failures.push('KRV_DAILY 배열을 찾지 못했습니다.');
} else {
  const verses = vm.runInNewContext(match[1]);
  if (verses.length < 60) failures.push(`개역한글판 말씀 수가 너무 적습니다: ${verses.length}개`);
  const refs = verses.map((verse) => verse.ref);
  if (new Set(refs).size !== refs.length) failures.push('중복된 성경 구절 주소가 있습니다.');
  if (verses.some((verse) => !verse.ref || !verse.text || !verse.topic)) failures.push('필수 값이 빠진 말씀 데이터가 있습니다.');
  const index = (year, month, day) => {
    const n = Math.floor(Date.UTC(year, month - 1, day) / 86400000);
    return ((n % verses.length) + verses.length) % verses.length;
  };
  const dates = [[2026, 7, 25], [2026, 7, 26], [2026, 12, 31], [2027, 1, 1]];
  for (let i = 1; i < dates.length; i += 1) {
    if (index(...dates[i - 1]) === index(...dates[i])) {
      failures.push(`연속 날짜의 말씀 번호가 같습니다: ${dates[i - 1].join('-')} / ${dates[i].join('-')}`);
    }
  }
}

if (failures.length) {
  console.error(`개역한글판/성경큐티 검증 실패 (${failures.length}건)`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('개역한글판 오늘의 말씀 및 일일 성경큐티 검증 통과');
