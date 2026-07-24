import fs from 'node:fs';

const path = 'database.rules.json';
const rules = JSON.parse(fs.readFileSync(path, 'utf8'));

if (!rules.rules || typeof rules.rules !== 'object') {
  throw new Error('database.rules.json의 rules 루트를 찾지 못했습니다.');
}

if (Object.hasOwn(rules.rules, 'dailyVerses')) {
  delete rules.rules.dailyVerses;
  fs.writeFileSync(path, `${JSON.stringify(rules, null, 2)}\n`);
  console.log('레거시 /dailyVerses 데이터베이스 규칙을 제거했습니다.');
} else {
  console.log('레거시 /dailyVerses 규칙이 이미 제거되어 있습니다.');
}
