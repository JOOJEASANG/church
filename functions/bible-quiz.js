const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getDatabase } = require('firebase-admin/database');
const BANK = require('./bible-quiz-data');

const MAX_ROOM_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_PRACTICE_AGE_MS = 6 * 60 * 60 * 1000;
const CATEGORIES = ['전체', '기초', '구약', '예수님', '신약', '인물'];

function bad(message) {
  throw new HttpsError('invalid-argument', message);
}

function requireAuth(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  return uid;
}

async function requireMember(uid) {
  const db = getDatabase();
  const [userSnap, adminSnap] = await Promise.all([
    db.ref(`users/${uid}`).get(),
    db.ref(`admins/${uid}`).get()
  ]);
  const user = userSnap.val() || {};
  const isAdmin = adminSnap.exists();
  if (!isAdmin && user.status !== 'approved') {
    throw new HttpsError('permission-denied', '승인된 교인만 성경퀴즈에 참여할 수 있습니다.');
  }
  return {
    uid,
    isAdmin,
    name: String(user.displayName || adminSnap.val()?.name || '성도').trim().slice(0, 40) || '성도'
  };
}

function cleanText(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function clampCount(value, fallback = 10) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(5, Math.min(20, Math.floor(n)));
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function questionPublic(q) {
  return {
    id: q.id,
    category: q.category || '기초',
    difficulty: q.difficulty || '보통',
    question: q.question,
    options: Array.isArray(q.options) ? q.options : []
  };
}

function normalizeCustom(uid, id, raw) {
  if (!raw || typeof raw !== 'object') return null;
  const options = Array.isArray(raw.options) ? raw.options.map((v) => cleanText(v, 120)) : [];
  if (!raw.question || options.length !== 4) return null;
  return {
    id: `c:${uid}:${id}`,
    category: '내 문제',
    difficulty: raw.difficulty === '어려움' ? '어려움' : (raw.difficulty === '쉬움' ? '쉬움' : '보통'),
    question: cleanText(raw.question, 300),
    options,
    answer: Number(raw.answer),
    reference: cleanText(raw.reference, 120),
    explanation: cleanText(raw.explanation, 600),
    customOwnerUid: uid,
    customId: id
  };
}

async function ownCustomQuestions(uid) {
  const snap = await getDatabase().ref(`quizCustomQuestionsServer/${uid}`).get();
  if (!snap.exists()) return [];
  const out = [];
  snap.forEach((child) => {
    const q = normalizeCustom(uid, child.key, child.val());
    if (q && Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3) out.push(q);
  });
  return out;
}

async function selectQuestions(uid, { category = '전체', count = 10, includeCustom = false } = {}) {
  const wantedCategory = CATEGORIES.includes(category) ? category : '전체';
  let pool = wantedCategory === '전체' ? BANK : BANK.filter((q) => q.category === wantedCategory);
  if (includeCustom) pool = [...pool, ...(await ownCustomQuestions(uid))];
  if (pool.length < 1) throw new HttpsError('failed-precondition', '선택한 범위에 문제가 없습니다.');
  return shuffle(pool).slice(0, Math.min(clampCount(count), pool.length));
}

function validateCustomQuestion(data) {
  const question = cleanText(data.question, 300);
  const options = Array.isArray(data.options) ? data.options.map((v) => cleanText(v, 120)) : [];
  const answer = Number(data.answer);
  const reference = cleanText(data.reference, 120);
  const explanation = cleanText(data.explanation, 600);
  const difficulty = ['쉬움', '보통', '어려움'].includes(data.difficulty) ? data.difficulty : '보통';

  if (question.length < 4) bad('문제를 4글자 이상 입력해주세요.');
  if (options.length !== 4 || options.some((v) => !v)) bad('보기 4개를 모두 입력해주세요.');
  if (new Set(options).size !== 4) bad('보기 4개는 서로 달라야 합니다.');
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) bad('정답을 선택해주세요.');
  if (!reference) bad('정답을 확인할 수 있는 성경 위치를 입력해주세요.');
  if (!explanation) bad('짧은 해설을 입력해주세요.');
  return { question, options, answer, reference, explanation, difficulty };
}

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

async function uniqueRoomCode() {
  const db = getDatabase();
  for (let i = 0; i < 12; i += 1) {
    const code = roomCode();
    const snap = await db.ref(`quizCompetitionCodes/${code}`).get();
    if (!snap.exists()) return code;
  }
  throw new HttpsError('resource-exhausted', '방 코드를 만들지 못했습니다. 다시 시도해주세요.');
}

async function resolveRoomId(data) {
  if (data.roomId) return cleanText(data.roomId, 120);
  const code = cleanText(data.code, 12).toUpperCase();
  if (!code) bad('참가 코드를 입력해주세요.');
  const snap = await getDatabase().ref(`quizCompetitionCodes/${code}`).get();
  if (!snap.exists()) throw new HttpsError('not-found', '해당 참가 코드를 찾을 수 없습니다.');
  const value = snap.val() || {};
  if (value.expiresAt && value.expiresAt < Date.now()) throw new HttpsError('not-found', '종료된 대회입니다.');
  return value.roomId;
}

function participantList(room) {
  const entries = Object.entries(room.participants || {}).map(([uid, p]) => ({
    uid,
    name: cleanText(p?.name || '성도', 40),
    score: Number(p?.score) || 0,
    correctCount: Number(p?.correctCount) || 0,
    answerCount: Number(p?.answerCount) || 0,
    joinedAt: Number(p?.joinedAt) || 0
  }));
  entries.sort((a, b) => (b.score - a.score) || (b.correctCount - a.correctCount) || (a.joinedAt - b.joinedAt));
  return entries;
}

function roomView(roomId, room, uid) {
  const participants = participantList(room);
  const joined = Boolean(room.participants?.[uid]);
  const index = Number(room.currentIndex);
  const questions = Array.isArray(room.questions) ? room.questions : [];
  const current = room.status === 'playing' && index >= 0 && index < questions.length ? questions[index] : null;
  const me = room.participants?.[uid] || null;
  const answeredCount = room.status === 'playing'
    ? Object.values(room.participants || {}).filter((p) => Number(p?.lastAnsweredIndex) === index).length
    : 0;
  return {
    roomId,
    code: room.code,
    title: room.title,
    status: room.status,
    hostUid: room.hostUid,
    hostName: room.hostName,
    isHost: room.hostUid === uid,
    joined,
    total: questions.length,
    currentIndex: index,
    currentQuestion: joined && current ? questionPublic(current) : null,
    hasAnswered: Boolean(me && Number(me.lastAnsweredIndex) === index),
    answeredCount,
    participants,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt
  };
}

async function getRoom(roomId) {
  const snap = await getDatabase().ref(`quizCompetitionRooms/${roomId}`).get();
  if (!snap.exists()) throw new HttpsError('not-found', '대회 방을 찾을 수 없습니다.');
  const room = snap.val();
  if (room.expiresAt && room.expiresAt < Date.now()) throw new HttpsError('not-found', '종료된 대회입니다.');
  return room;
}

async function handlePracticeStart(uid, data) {
  const questions = await selectQuestions(uid, {
    category: data.category || '전체',
    count: data.count,
    includeCustom: Boolean(data.includeCustom)
  });
  const ref = getDatabase().ref(`quizPracticeSessions/${uid}`).push();
  const now = Date.now();
  await ref.set({
    questions,
    answers: {},
    score: 0,
    createdAt: now,
    expiresAt: now + MAX_PRACTICE_AGE_MS,
    mode: data.mode === 'study' ? 'study' : 'quiz'
  });
  return { sessionId: ref.key, questions: questions.map(questionPublic) };
}

async function handlePracticeAnswer(uid, data) {
  const sessionId = cleanText(data.sessionId, 120);
  const index = Number(data.index);
  const selected = Number(data.selected);
  if (!sessionId || !Number.isInteger(index) || !Number.isInteger(selected) || selected < 0 || selected > 3) bad('정답 제출 정보가 올바르지 않습니다.');

  const sessionRef = getDatabase().ref(`quizPracticeSessions/${uid}/${sessionId}`);
  const snap = await sessionRef.get();
  if (!snap.exists()) throw new HttpsError('not-found', '퀴즈 세션이 없습니다.');
  const session = snap.val();
  if (session.expiresAt < Date.now()) throw new HttpsError('deadline-exceeded', '퀴즈 시간이 만료되었습니다.');
  const questions = Array.isArray(session.questions) ? session.questions : [];
  const q = questions[index];
  if (!q) bad('문제 번호가 올바르지 않습니다.');
  if (session.answers && session.answers[index] != null) throw new HttpsError('already-exists', '이미 답한 문제입니다.');

  const correct = Number(q.answer) === selected;
  const answerRecord = { selected, correct, answeredAt: Date.now() };
  await sessionRef.child(`answers/${index}`).set(answerRecord);
  if (correct) await sessionRef.child('score').transaction((v) => (Number(v) || 0) + 1);

  return {
    correct,
    correctIndex: Number(q.answer),
    reference: q.reference || '',
    explanation: q.explanation || ''
  };
}

async function handlePracticeFinish(uid, data) {
  const sessionId = cleanText(data.sessionId, 120);
  if (!sessionId) bad('퀴즈 세션이 없습니다.');
  const ref = getDatabase().ref(`quizPracticeSessions/${uid}/${sessionId}`);
  const snap = await ref.get();
  if (!snap.exists()) throw new HttpsError('not-found', '퀴즈 세션이 없습니다.');
  const session = snap.val();
  const total = Array.isArray(session.questions) ? session.questions.length : 0;
  const score = Number(session.score) || 0;
  const percent = total ? Math.round((score / total) * 100) : 0;
  const now = Date.now();

  await getDatabase().ref(`quizStatsServer/${uid}`).transaction((stats) => {
    const s = stats && typeof stats === 'object' ? stats : {};
    s.plays = (Number(s.plays) || 0) + 1;
    s.totalCorrect = (Number(s.totalCorrect) || 0) + score;
    s.totalQuestions = (Number(s.totalQuestions) || 0) + total;
    s.bestPercent = Math.max(Number(s.bestPercent) || 0, percent);
    s.lastPlayedAt = now;
    return s;
  });
  await ref.child('finishedAt').set(now);
  return { score, total, percent };
}

async function handleCustomCreate(uid, data) {
  const q = validateCustomQuestion(data);
  const ref = getDatabase().ref(`quizCustomQuestionsServer/${uid}`).push();
  await ref.set({ ...q, createdAt: Date.now() });
  return { id: ref.key };
}

async function handleCustomList(uid) {
  const list = await ownCustomQuestions(uid);
  return {
    questions: list.map((q) => ({
      id: q.customId,
      question: q.question,
      options: q.options,
      answer: q.answer,
      reference: q.reference,
      explanation: q.explanation,
      difficulty: q.difficulty
    }))
  };
}

async function handleRoomCreate(member, data) {
  const count = clampCount(data.count, 10);
  const questions = await selectQuestions(member.uid, {
    category: data.category || '전체',
    count,
    includeCustom: Boolean(data.includeCustom)
  });
  const code = await uniqueRoomCode();
  const db = getDatabase();
  const roomRef = db.ref('quizCompetitionRooms').push();
  const now = Date.now();
  const room = {
    code,
    title: cleanText(data.title, 80) || '우리 교회 성경퀴즈',
    hostUid: member.uid,
    hostName: member.name,
    status: 'lobby',
    questions,
    currentIndex: -1,
    currentStartedAt: 0,
    createdAt: now,
    expiresAt: now + MAX_ROOM_AGE_MS,
    participants: {
      [member.uid]: {
        name: member.name,
        score: 0,
        correctCount: 0,
        answerCount: 0,
        lastAnsweredIndex: -1,
        joinedAt: now
      }
    }
  };
  await Promise.all([
    roomRef.set(room),
    db.ref(`quizCompetitionCodes/${code}`).set({ roomId: roomRef.key, expiresAt: room.expiresAt })
  ]);
  return roomView(roomRef.key, room, member.uid);
}

async function handleRoomJoin(member, data) {
  const roomId = await resolveRoomId(data);
  const db = getDatabase();
  const room = await getRoom(roomId);
  if (room.status === 'finished') throw new HttpsError('failed-precondition', '이미 종료된 대회입니다.');
  const participantRef = db.ref(`quizCompetitionRooms/${roomId}/participants/${member.uid}`);
  const existing = await participantRef.get();
  if (!existing.exists()) {
    await participantRef.set({
      name: member.name,
      score: 0,
      correctCount: 0,
      answerCount: 0,
      lastAnsweredIndex: -1,
      joinedAt: Date.now()
    });
  }
  const fresh = await getRoom(roomId);
  return roomView(roomId, fresh, member.uid);
}

async function handleRoomStart(member, data) {
  const roomId = await resolveRoomId(data);
  const room = await getRoom(roomId);
  if (room.hostUid !== member.uid) throw new HttpsError('permission-denied', '방장만 시작할 수 있습니다.');
  if (room.status !== 'lobby') throw new HttpsError('failed-precondition', '이미 시작했거나 종료된 대회입니다.');
  const now = Date.now();
  await getDatabase().ref(`quizCompetitionRooms/${roomId}`).update({
    status: 'playing',
    currentIndex: 0,
    currentStartedAt: now,
    startedAt: now
  });
  const fresh = await getRoom(roomId);
  return roomView(roomId, fresh, member.uid);
}

async function handleRoomAnswer(member, data) {
  const roomId = await resolveRoomId(data);
  const selected = Number(data.selected);
  if (!Number.isInteger(selected) || selected < 0 || selected > 3) bad('답을 하나 선택해주세요.');
  const room = await getRoom(roomId);
  if (room.status !== 'playing') throw new HttpsError('failed-precondition', '대회가 진행 중이 아닙니다.');
  const index = Number(room.currentIndex);
  const questions = Array.isArray(room.questions) ? room.questions : [];
  const q = questions[index];
  if (!q) throw new HttpsError('failed-precondition', '현재 문제를 찾을 수 없습니다.');
  if (!room.participants?.[member.uid]) throw new HttpsError('permission-denied', '먼저 대회에 참가해주세요.');

  const elapsedMs = Math.max(0, Date.now() - (Number(room.currentStartedAt) || Date.now()));
  const correct = Number(q.answer) === selected;
  const speedBonus = correct ? Math.max(0, 50 - Math.floor(elapsedMs / 400)) : 0;
  const points = correct ? 100 + speedBonus : 0;
  let accepted = false;

  await getDatabase().ref(`quizCompetitionRooms/${roomId}/participants/${member.uid}`).transaction((p) => {
    if (!p || Number(p.lastAnsweredIndex) === index) return;
    accepted = true;
    p.score = (Number(p.score) || 0) + points;
    p.correctCount = (Number(p.correctCount) || 0) + (correct ? 1 : 0);
    p.answerCount = (Number(p.answerCount) || 0) + 1;
    p.lastAnsweredIndex = index;
    p.lastAnsweredAt = Date.now();
    return p;
  });
  if (!accepted) throw new HttpsError('already-exists', '이 문제에는 이미 답했습니다.');
  return { correct, points };
}

async function handleRoomNext(member, data) {
  const roomId = await resolveRoomId(data);
  const room = await getRoom(roomId);
  if (room.hostUid !== member.uid) throw new HttpsError('permission-denied', '방장만 다음 문제로 진행할 수 있습니다.');
  if (room.status !== 'playing') throw new HttpsError('failed-precondition', '대회가 진행 중이 아닙니다.');
  const questions = Array.isArray(room.questions) ? room.questions : [];
  const nextIndex = Number(room.currentIndex) + 1;
  const updates = nextIndex >= questions.length
    ? { status: 'finished', finishedAt: Date.now() }
    : { currentIndex: nextIndex, currentStartedAt: Date.now() };
  await getDatabase().ref(`quizCompetitionRooms/${roomId}`).update(updates);
  const fresh = await getRoom(roomId);
  return roomView(roomId, fresh, member.uid);
}

async function handleRoomGet(member, data) {
  const roomId = await resolveRoomId(data);
  const room = await getRoom(roomId);
  return roomView(roomId, room, member.uid);
}

exports.bibleQuiz = onCall({ cors: true }, async (request) => {
  const uid = requireAuth(request);
  const member = await requireMember(uid);
  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const action = cleanText(data.action, 40);

  switch (action) {
    case 'meta': {
      const stats = (await getDatabase().ref(`quizStatsServer/${uid}`).get()).val() || {};
      const customCount = (await ownCustomQuestions(uid)).length;
      return { bankCount: BANK.length, categories: CATEGORIES, customCount, stats };
    }
    case 'practiceStart': return handlePracticeStart(uid, data);
    case 'practiceAnswer': return handlePracticeAnswer(uid, data);
    case 'practiceFinish': return handlePracticeFinish(uid, data);
    case 'customCreate': return handleCustomCreate(uid, data);
    case 'customList': return handleCustomList(uid);
    case 'customDelete': {
      const id = cleanText(data.id, 120);
      if (!id) bad('삭제할 문제를 선택해주세요.');
      await getDatabase().ref(`quizCustomQuestionsServer/${uid}/${id}`).remove();
      return { ok: true };
    }
    case 'roomCreate': return handleRoomCreate(member, data);
    case 'roomJoin': return handleRoomJoin(member, data);
    case 'roomGet': return handleRoomGet(member, data);
    case 'roomStart': return handleRoomStart(member, data);
    case 'roomAnswer': return handleRoomAnswer(member, data);
    case 'roomNext': return handleRoomNext(member, data);
    default: bad('지원하지 않는 성경퀴즈 요청입니다.');
  }
});
