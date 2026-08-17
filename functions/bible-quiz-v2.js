const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getDatabase } = require('firebase-admin/database');
const BASE = require('./bible-quiz-data');
const EXPANDED = require('./bible-quiz-expanded-data');
const { BOOKS, OLD_TESTAMENT, NEW_TESTAMENT, DIFFICULTIES, AUDIENCES, questionBook, questionAudiences } = require('./bible-quiz-taxonomy');

const BANK = [...BASE, ...EXPANDED];
const CATEGORIES = ['전체', '기초', '구약', '예수님', '신약', '인물'];
const MAX_PRACTICE_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_ROOM_AGE_MS = 24 * 60 * 60 * 1000;

function clean(value, max = 300) { return String(value ?? '').trim().slice(0, max); }
function bad(message) { throw new HttpsError('invalid-argument', message); }
function clampCount(value, fallback = 10) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(5, Math.min(30, Math.floor(n))) : fallback;
}
function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function requireUid(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  return request.auth.uid;
}
async function requireMember(uid) {
  const db = getDatabase();
  const [userSnap, adminSnap] = await Promise.all([db.ref(`users/${uid}`).get(), db.ref(`admins/${uid}`).get()]);
  const user = userSnap.val() || {};
  const admin = adminSnap.val() || {};
  if (!adminSnap.exists() && user.status !== 'approved') throw new HttpsError('permission-denied', '승인된 교인만 이용할 수 있습니다.');
  return { uid, name: clean(user.displayName || admin.name || '성도', 40) || '성도' };
}

function publicQuestion(q) {
  return {
    id: q.id,
    category: q.category || '기초',
    difficulty: q.difficulty || '보통',
    book: questionBook(q),
    question: q.question,
    options: Array.isArray(q.options) ? q.options : []
  };
}
function safeHint(q) {
  if (clean(q.hint, 240)) return clean(q.hint, 240);
  const ref = clean(q.reference, 120);
  const answerText = Array.isArray(q.options) ? clean(q.options[Number(q.answer)], 120) : '';
  let safeRef = ref;
  if (answerText && safeRef.includes(answerText)) safeRef = safeRef.split(answerText).join('○○');
  const book = questionBook(q);
  if (book && answerText === book && safeRef.includes(book)) safeRef = safeRef.replace(book, '해당 성경책');
  return safeRef ? `관련 말씀은 ${safeRef}입니다. 그 장면의 인물과 사건 흐름을 떠올려 보세요.` : '문제의 인물, 장소, 사건 순서를 천천히 떠올려 보세요.';
}

function normalizeCustom(uid, id, raw) {
  if (!raw || typeof raw !== 'object') return null;
  const options = Array.isArray(raw.options) ? raw.options.map((v) => clean(v, 120)) : [];
  const answer = Number(raw.answer);
  if (clean(raw.question).length < 4 || options.length !== 4 || options.some((v) => !v) || !Number.isInteger(answer) || answer < 0 || answer > 3) return null;
  const book = BOOKS.includes(raw.book) ? raw.book : '';
  const audience = AUDIENCES.includes(raw.audience) && raw.audience !== '전체' ? [raw.audience] : ['청소년', '일반'];
  return {
    id: `c:${uid}:${id}`, customId: id, customOwnerUid: uid, category: '내 문제',
    difficulty: ['쉬움', '보통', '어려움'].includes(raw.difficulty) ? raw.difficulty : '보통',
    audience, book, question: clean(raw.question), options, answer,
    reference: clean(raw.reference, 120), explanation: clean(raw.explanation, 600), hint: clean(raw.hint, 240)
  };
}
async function customQuestions(uid) {
  const snap = await getDatabase().ref(`quizCustomQuestionsServer/${uid}`).get();
  const result = [];
  if (snap.exists()) snap.forEach((child) => { const q = normalizeCustom(uid, child.key, child.val()); if (q) result.push(q); });
  return result;
}

function matches(q, data) {
  const category = CATEGORIES.includes(data.category) ? data.category : '전체';
  const difficulty = DIFFICULTIES.includes(data.difficulty) ? data.difficulty : '전체';
  const audience = AUDIENCES.includes(data.audience) ? data.audience : '전체';
  const testament = ['전체', '구약', '신약'].includes(data.testament) ? data.testament : '전체';
  const book = BOOKS.includes(data.book) ? data.book : '전체';
  const qBook = questionBook(q);
  if (category !== '전체' && q.category !== category) return false;
  if (difficulty !== '전체' && q.difficulty !== difficulty) return false;
  if (audience !== '전체' && !questionAudiences(q).includes(audience)) return false;
  if (testament === '구약' && !OLD_TESTAMENT.includes(qBook)) return false;
  if (testament === '신약' && !NEW_TESTAMENT.includes(qBook)) return false;
  if (book !== '전체' && qBook !== book) return false;
  return true;
}
async function selectQuestions(uid, data) {
  let pool = BANK.filter((q) => matches(q, data));
  if (data.includeCustom) {
    const customs = await customQuestions(uid);
    pool.push(...customs.filter((q) => matches(q, data)));
  }
  if (!pool.length) throw new HttpsError('failed-precondition', '선택한 조건에 맞는 문제가 없습니다. 범위를 조금 넓혀주세요.');
  return shuffle(pool).slice(0, Math.min(clampCount(data.count), pool.length));
}

function validateCustom(data) {
  const question = clean(data.question); const options = Array.isArray(data.options) ? data.options.map((v) => clean(v, 120)) : [];
  const answer = Number(data.answer); const reference = clean(data.reference, 120); const explanation = clean(data.explanation, 600);
  const hint = clean(data.hint, 240); const book = BOOKS.includes(data.book) ? data.book : '';
  const difficulty = ['쉬움', '보통', '어려움'].includes(data.difficulty) ? data.difficulty : '보통';
  const audience = AUDIENCES.includes(data.audience) && data.audience !== '전체' ? data.audience : '청소년';
  if (question.length < 4) bad('문제를 4글자 이상 입력해주세요.');
  if (options.length !== 4 || options.some((v) => !v) || new Set(options).size !== 4) bad('서로 다른 보기 4개를 모두 입력해주세요.');
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) bad('정답을 선택해주세요.');
  if (!reference) bad('성경 위치를 입력해주세요.');
  if (!explanation) bad('정답 해설을 입력해주세요.');
  return { question, options, answer, reference, explanation, hint, book, difficulty, audience, createdAt: Date.now() };
}

async function practiceStart(uid, data) {
  const questions = await selectQuestions(uid, data);
  const ref = getDatabase().ref(`quizV2PracticeSessions/${uid}`).push();
  const now = Date.now();
  await ref.set({ questions, answers: {}, hints: {}, score: 0, createdAt: now, expiresAt: now + MAX_PRACTICE_AGE_MS, mode: data.mode === 'study' ? 'study' : 'quiz' });
  return { sessionId: ref.key, questions: questions.map(publicQuestion) };
}
async function getPractice(uid, sessionId) {
  const ref = getDatabase().ref(`quizV2PracticeSessions/${uid}/${sessionId}`);
  const snap = await ref.get();
  if (!snap.exists()) throw new HttpsError('not-found', '퀴즈 세션이 없습니다.');
  const session = snap.val();
  if (Number(session.expiresAt) < Date.now()) throw new HttpsError('deadline-exceeded', '퀴즈 시간이 만료되었습니다.');
  return { ref, session };
}
async function practiceHint(uid, data) {
  const sessionId = clean(data.sessionId, 120); const index = Number(data.index);
  if (!sessionId || !Number.isInteger(index)) bad('힌트 요청이 올바르지 않습니다.');
  const { ref, session } = await getPractice(uid, sessionId);
  const q = Array.isArray(session.questions) ? session.questions[index] : null;
  if (!q) bad('문제 번호가 올바르지 않습니다.');
  if (session.answers && session.answers[index] != null) throw new HttpsError('failed-precondition', '이미 답한 문제입니다.');
  await ref.child(`hints/${index}`).set(true);
  return { hint: safeHint(q) };
}
async function practiceAnswer(uid, data) {
  const sessionId = clean(data.sessionId, 120); const index = Number(data.index); const selected = Number(data.selected);
  if (!sessionId || !Number.isInteger(index) || !Number.isInteger(selected) || selected < 0 || selected > 3) bad('정답 제출 정보가 올바르지 않습니다.');
  const { ref, session } = await getPractice(uid, sessionId);
  const q = Array.isArray(session.questions) ? session.questions[index] : null;
  if (!q) bad('문제 번호가 올바르지 않습니다.');
  if (session.answers && session.answers[index] != null) throw new HttpsError('already-exists', '이미 답한 문제입니다.');
  const correct = Number(q.answer) === selected;
  await ref.child(`answers/${index}`).set({ selected, correct, answeredAt: Date.now() });
  if (correct) await ref.child('score').transaction((v) => (Number(v) || 0) + 1);
  return { correct, correctIndex: Number(q.answer), reference: q.reference || '', explanation: q.explanation || '', hintUsed: Boolean(session.hints?.[index]) };
}
async function practiceFinish(uid, data) {
  const sessionId = clean(data.sessionId, 120); if (!sessionId) bad('퀴즈 세션이 없습니다.');
  const { ref, session } = await getPractice(uid, sessionId);
  const total = Array.isArray(session.questions) ? session.questions.length : 0; const score = Number(session.score) || 0;
  const percent = total ? Math.round((score / total) * 100) : 0; const hintCount = Object.keys(session.hints || {}).length; const now = Date.now();
  await getDatabase().ref(`quizStatsServer/${uid}`).transaction((stats) => {
    const s = stats && typeof stats === 'object' ? stats : {};
    s.plays = (Number(s.plays) || 0) + 1; s.totalCorrect = (Number(s.totalCorrect) || 0) + score; s.totalQuestions = (Number(s.totalQuestions) || 0) + total;
    s.bestPercent = Math.max(Number(s.bestPercent) || 0, percent); s.lastPlayedAt = now; s.hintsUsed = (Number(s.hintsUsed) || 0) + hintCount; return s;
  });
  await ref.child('finishedAt').set(now);
  return { score, total, percent, hintCount };
}

function code() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let value = '';
  for (let i = 0; i < 6; i += 1) value += alphabet[Math.floor(Math.random() * alphabet.length)];
  return value;
}
async function uniqueCode() {
  const db = getDatabase();
  for (let i = 0; i < 15; i += 1) { const value = code(); if (!(await db.ref(`quizV2CompetitionCodes/${value}`).get()).exists()) return value; }
  throw new HttpsError('resource-exhausted', '참가 코드를 만들지 못했습니다. 다시 시도해주세요.');
}
async function resolveRoomId(data) {
  if (data.roomId) return clean(data.roomId, 120);
  const value = clean(data.code, 12).toUpperCase(); if (!value) bad('참가 코드를 입력해주세요.');
  const snap = await getDatabase().ref(`quizV2CompetitionCodes/${value}`).get();
  if (!snap.exists() || Number(snap.val()?.expiresAt) < Date.now()) throw new HttpsError('not-found', '대회 방을 찾을 수 없습니다.');
  return snap.val().roomId;
}
async function roomById(roomId) {
  const snap = await getDatabase().ref(`quizV2CompetitionRooms/${roomId}`).get();
  if (!snap.exists() || Number(snap.val()?.expiresAt) < Date.now()) throw new HttpsError('not-found', '대회 방을 찾을 수 없습니다.');
  return snap.val();
}
function people(room) {
  const list = Object.entries(room.participants || {}).map(([uid, p]) => ({ uid, name: clean(p?.name || '성도', 40), score: Number(p?.score) || 0, correctCount: Number(p?.correctCount) || 0, answerCount: Number(p?.answerCount) || 0, joinedAt: Number(p?.joinedAt) || 0 }));
  list.sort((a, b) => (b.score - a.score) || (b.correctCount - a.correctCount) || (a.joinedAt - b.joinedAt)); return list;
}
function roomView(roomId, room, uid) {
  const index = Number(room.currentIndex); const questions = Array.isArray(room.questions) ? room.questions : []; const current = room.status === 'playing' ? questions[index] : null; const me = room.participants?.[uid];
  return { roomId, code: room.code, title: room.title, status: room.status, isHost: room.hostUid === uid, hostUid: room.hostUid, total: questions.length, currentIndex: index,
    currentQuestion: me && current ? publicQuestion(current) : null, hasAnswered: Boolean(me && Number(me.lastAnsweredIndex) === index), participants: people(room),
    answeredCount: room.status === 'playing' ? Object.values(room.participants || {}).filter((p) => Number(p?.lastAnsweredIndex) === index).length : 0, expiresAt: room.expiresAt };
}
async function roomCreate(member, data) {
  const questions = await selectQuestions(member.uid, data); const roomCode = await uniqueCode(); const db = getDatabase(); const ref = db.ref('quizV2CompetitionRooms').push(); const now = Date.now();
  const room = { code: roomCode, title: clean(data.title, 80) || '우리 교회 성경퀴즈', hostUid: member.uid, status: 'lobby', questions, currentIndex: -1, currentStartedAt: 0, createdAt: now, expiresAt: now + MAX_ROOM_AGE_MS,
    participants: { [member.uid]: { name: member.name, score: 0, correctCount: 0, answerCount: 0, lastAnsweredIndex: -1, joinedAt: now } } };
  await Promise.all([ref.set(room), db.ref(`quizV2CompetitionCodes/${roomCode}`).set({ roomId: ref.key, expiresAt: room.expiresAt })]); return roomView(ref.key, room, member.uid);
}
async function roomJoin(member, data) {
  const roomId = await resolveRoomId(data); const room = await roomById(roomId); if (room.status === 'finished') throw new HttpsError('failed-precondition', '이미 종료된 대회입니다.');
  const ref = getDatabase().ref(`quizV2CompetitionRooms/${roomId}/participants/${member.uid}`); if (!(await ref.get()).exists()) await ref.set({ name: member.name, score: 0, correctCount: 0, answerCount: 0, lastAnsweredIndex: -1, joinedAt: Date.now() });
  return roomView(roomId, await roomById(roomId), member.uid);
}
async function roomStart(member, data) {
  const roomId = await resolveRoomId(data); const room = await roomById(roomId); if (room.hostUid !== member.uid) throw new HttpsError('permission-denied', '방장만 시작할 수 있습니다.');
  if (room.status !== 'lobby') throw new HttpsError('failed-precondition', '이미 시작했거나 종료된 대회입니다.');
  await getDatabase().ref(`quizV2CompetitionRooms/${roomId}`).update({ status: 'playing', currentIndex: 0, currentStartedAt: Date.now(), startedAt: Date.now() }); return roomView(roomId, await roomById(roomId), member.uid);
}
async function roomAnswer(member, data) {
  const roomId = await resolveRoomId(data); const selected = Number(data.selected); if (!Number.isInteger(selected) || selected < 0 || selected > 3) bad('답을 선택해주세요.');
  const room = await roomById(roomId); const index = Number(room.currentIndex); const q = Array.isArray(room.questions) ? room.questions[index] : null;
  if (room.status !== 'playing' || !q || !room.participants?.[member.uid]) throw new HttpsError('failed-precondition', '현재 답을 제출할 수 없습니다.');
  const correct = Number(q.answer) === selected; const elapsed = Math.max(0, Date.now() - (Number(room.currentStartedAt) || Date.now())); const points = correct ? 100 + Math.max(0, 50 - Math.floor(elapsed / 400)) : 0; let accepted = false;
  await getDatabase().ref(`quizV2CompetitionRooms/${roomId}/participants/${member.uid}`).transaction((p) => { if (!p || Number(p.lastAnsweredIndex) === index) return; accepted = true; p.score = (Number(p.score) || 0) + points; p.correctCount = (Number(p.correctCount) || 0) + (correct ? 1 : 0); p.answerCount = (Number(p.answerCount) || 0) + 1; p.lastAnsweredIndex = index; return p; });
  if (!accepted) throw new HttpsError('already-exists', '이미 답한 문제입니다.'); return { correct, points };
}
async function roomNext(member, data) {
  const roomId = await resolveRoomId(data); const room = await roomById(roomId); if (room.hostUid !== member.uid) throw new HttpsError('permission-denied', '방장만 진행할 수 있습니다.');
  const next = Number(room.currentIndex) + 1; const total = Array.isArray(room.questions) ? room.questions.length : 0; const update = next >= total ? { status: 'finished', finishedAt: Date.now() } : { currentIndex: next, currentStartedAt: Date.now() };
  await getDatabase().ref(`quizV2CompetitionRooms/${roomId}`).update(update); return roomView(roomId, await roomById(roomId), member.uid);
}

exports.bibleQuizV2 = onCall({ cors: true }, async (request) => {
  const uid = requireUid(request); const member = await requireMember(uid); const data = request.data && typeof request.data === 'object' ? request.data : {}; const action = clean(data.action, 40);
  switch (action) {
    case 'meta': {
      const [statsSnap, customs] = await Promise.all([getDatabase().ref(`quizStatsServer/${uid}`).get(), customQuestions(uid)]);
      const bookCounts = {}; for (const q of BANK) { const book = questionBook(q); if (book) bookCounts[book] = (bookCounts[book] || 0) + 1; }
      return { bankCount: BANK.length, categories: CATEGORIES, difficulties: DIFFICULTIES, audiences: AUDIENCES, books: BOOKS, oldTestament: OLD_TESTAMENT, newTestament: NEW_TESTAMENT, bookCounts, customCount: customs.length, stats: statsSnap.val() || {} };
    }
    case 'practiceStart': return practiceStart(uid, data);
    case 'practiceHint': return practiceHint(uid, data);
    case 'practiceAnswer': return practiceAnswer(uid, data);
    case 'practiceFinish': return practiceFinish(uid, data);
    case 'customCreate': { const q = validateCustom(data); const ref = getDatabase().ref(`quizCustomQuestionsServer/${uid}`).push(); await ref.set(q); return { id: ref.key }; }
    case 'customList': return { questions: (await customQuestions(uid)).map((q) => ({ id: q.customId, question: q.question, options: q.options, answer: q.answer, reference: q.reference, explanation: q.explanation, hint: q.hint, difficulty: q.difficulty, audience: q.audience?.[0] || '청소년', book: q.book || '' })) };
    case 'customDelete': { const id = clean(data.id, 120); if (!id) bad('삭제할 문제가 없습니다.'); await getDatabase().ref(`quizCustomQuestionsServer/${uid}/${id}`).remove(); return { ok: true }; }
    case 'roomCreate': return roomCreate(member, data);
    case 'roomJoin': return roomJoin(member, data);
    case 'roomGet': { const roomId = await resolveRoomId(data); return roomView(roomId, await roomById(roomId), uid); }
    case 'roomStart': return roomStart(member, data);
    case 'roomAnswer': return roomAnswer(member, data);
    case 'roomNext': return roomNext(member, data);
    default: bad('지원하지 않는 성경퀴즈 요청입니다.');
  }
});
