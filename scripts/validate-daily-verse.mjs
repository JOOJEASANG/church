import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('public/app.js', 'utf8');
const failures = [];

for (const [condition, message] of [
  [source.includes("timeZone: 'Asia/Seoul'"), '오늘의 말씀 날짜가 한국 시간대를 사용하지 않습니다.'],
  [source.includes('function refreshDailyVerseIfDateChanged()'), '날짜 변경 감지 함수가 없습니다.'],
  [source.includes('renderedDailyVerseKey !== todayKey()'), '날짜 키 변경 검사가 없습니다.'],
  [!source.includes('FALLBACK_VERSES[ref]'), '배열 번호를 성경 구절명으로 사용하는 기존 오류가 남아 있습니다.'],
  [!source.includes('fetchVerseText(ref)'), '배열 번호 기반 외부 본문 조회 코드가 남아 있습니다.']
]) {
  if (!condition) failures.push(message);
}

const arrayMatch = source.match(/const DAILY_VERSES = (\[[\s\S]*?\n\]);\n\nfunction getSeoulDateParts/);
if (!arrayMatch) {
  failures.push('DAILY_VERSES 배열 또는 수정된 날짜 함수를 찾지 못했습니다.');
} else {
  const dailyVerses = vm.runInNewContext(arrayMatch[1]);
  const dayIndex = (year, month, day) => {
    const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86400000);
    return ((dayNumber % dailyVerses.length) + dailyVerses.length) % dailyVerses.length;
  };

  const dates = [
    [2026, 7, 24],
    [2026, 7, 25],
    [2026, 7, 26],
    [2026, 12, 31],
    [2027, 1, 1]
  ];
  for (let i = 1; i < dates.length; i++) {
    const previous = dayIndex(...dates[i - 1]);
    const current = dayIndex(...dates[i]);
    if (previous === current) failures.push(`연속 날짜의 말씀 인덱스가 같습니다: ${dates[i - 1].join('-')} / ${dates[i].join('-')}`);
  }
}

if (failures.length) {
  console.error(`오늘의 말씀 검증 실패 (${failures.length}건)`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('오늘의 말씀 일일 변경 검증 통과');
