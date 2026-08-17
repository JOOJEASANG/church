const test = require('node:test');
const assert = require('node:assert/strict');
const bank = require('../bible-quiz-data');

test('Bible quiz bank has at least 80 valid unique questions', () => {
  assert.ok(Array.isArray(bank));
  assert.ok(bank.length >= 80);
  const ids = new Set();
  for (const q of bank) {
    assert.equal(typeof q.id, 'string');
    assert.ok(q.id.length > 0);
    assert.equal(ids.has(q.id), false, `duplicate id: ${q.id}`);
    ids.add(q.id);
    assert.ok(['기초', '구약', '예수님', '신약', '인물'].includes(q.category));
    assert.ok(['쉬움', '보통', '어려움'].includes(q.difficulty));
    assert.equal(typeof q.question, 'string');
    assert.ok(q.question.length >= 4);
    assert.ok(Array.isArray(q.options));
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.ok(q.options.every((v) => typeof v === 'string' && v.trim().length > 0));
    assert.ok(Number.isInteger(q.answer));
    assert.ok(q.answer >= 0 && q.answer <= 3);
    assert.equal(typeof q.reference, 'string');
    assert.ok(q.reference.trim().length > 0);
    assert.equal(typeof q.explanation, 'string');
    assert.ok(q.explanation.trim().length > 0);
  }
});
