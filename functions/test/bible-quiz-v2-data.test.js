const test = require('node:test');
const assert = require('node:assert/strict');
const base = require('../bible-quiz-data');
const expanded = require('../bible-quiz-expanded-data');
const { BOOKS, questionBook, questionAudiences } = require('../bible-quiz-taxonomy');

const bank = [...base, ...expanded];

test('Bible quiz v2 has at least 212 unique questions', () => {
  assert.ok(bank.length >= 212, `expected >=212 questions, got ${bank.length}`);
  const ids = new Set();
  for (const q of bank) {
    assert.ok(q.id && !ids.has(q.id), `duplicate or missing id: ${q.id}`);
    ids.add(q.id);
    assert.equal(q.options.length, 4);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3);
    assert.ok(String(q.reference || '').trim());
    assert.ok(String(q.explanation || '').trim());
    assert.ok(['쉬움','보통','어려움'].includes(q.difficulty));
    assert.ok(questionAudiences(q).length >= 1);
  }
});

test('all 66 Protestant Bible books have at least two questions', () => {
  assert.equal(BOOKS.length, 66);
  const counts = Object.fromEntries(BOOKS.map((book) => [book, 0]));
  for (const q of bank) {
    const book = questionBook(q);
    if (book in counts) counts[book] += 1;
  }
  for (const book of BOOKS) assert.ok(counts[book] >= 2, `${book}: only ${counts[book]} question(s)`);
});
