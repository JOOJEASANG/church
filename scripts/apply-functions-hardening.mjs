import fs from 'node:fs';

const filePath = 'functions/index.js';
let source = fs.readFileSync(filePath, 'utf8');

if (source.includes('exports.submitCapacityApplication = onCall')) {
  console.log('functions/index.js 정원 신청 Callable 이미 적용됨');
  process.exit(0);
}

const marker = 'async function sumApplications(field, id, countField = null) {';
if (!source.includes(marker)) throw new Error('Functions 삽입 위치를 찾지 못했습니다.');

const code = `function seoulDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return \`\${values.year}-\${values.month}-\${values.day}\`;
}

function applicationInput(data) {
  const targetType = typeof data?.targetType === 'string' ? data.targetType : '';
  const targetId = typeof data?.targetId === 'string' ? data.targetId.trim() : '';
  const name = typeof data?.name === 'string' ? data.name.trim() : '';
  const phone = typeof data?.phone === 'string' ? data.phone.trim() : '';
  const note = typeof data?.note === 'string' ? data.note.trim() : '';
  const count = Number(data?.count || 1);

  if (!['room', 'post', 'announcement'].includes(targetType)) {
    throw new HttpsError('invalid-argument', '지원하지 않는 신청 유형입니다.');
  }
  if (!targetId || /[.#$\\[\\]\\/]/.test(targetId) || targetId.length > 160) {
    throw new HttpsError('invalid-argument', '신청 대상 ID가 올바르지 않습니다.');
  }
  if (!name || name.length > 80) {
    throw new HttpsError('invalid-argument', '이름을 확인해주세요.');
  }
  if (!phone || phone.length > 40) {
    throw new HttpsError('invalid-argument', '연락처를 확인해주세요.');
  }
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new HttpsError('invalid-argument', '신청 인원을 확인해주세요.');
  }
  if (note.length > 3000) {
    throw new HttpsError('invalid-argument', '요청사항은 3,000자 이하로 입력해주세요.');
  }
  return { targetType, targetId, name, phone, note, count };
}

exports.submitCapacityApplication = onCall({ timeoutSeconds: 30 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');

  const input = applicationInput(request.data);
  const db = getDatabase();
  const [profileSnap, adminSnap] = await Promise.all([
    db.ref(\`users/\${uid}\`).get(),
    db.ref(\`admins/\${uid}\`).get()
  ]);
  if (!adminSnap.exists() && profileSnap.child('status').val() !== 'approved') {
    throw new HttpsError('permission-denied', '관리자 승인 후 신청할 수 있습니다.');
  }

  const specs = {
    room: {
      collection: 'rooms', idField: 'roomId', countField: 'joined', kind: '재능나눔', titleField: 'roomTitle'
    },
    post: {
      collection: 'posts', idField: 'postId', countField: 'signupCount', kind: '모임', titleField: 'eventTitle'
    },
    announcement: {
      collection: 'announcements', idField: 'announcementId', countField: 'signupCount', kind: '행사', titleField: 'eventTitle'
    }
  };
  const spec = specs[input.targetType];
  const applicationId = db.ref('applications').push().key;
  const today = seoulDateKey();
  let abortReason = 'resource-exhausted';

  const result = await db.ref().transaction((rootValue) => {
    const root = asObject(rootValue);
    const collection = asObject(root[spec.collection]);
    const target = asObject(collection[input.targetId]);
    if (!Object.keys(target).length) {
      abortReason = 'not-found';
      return;
    }

    if (input.targetType === 'room') {
      if (target.approved === false || target.status === '마감') {
        abortReason = 'failed-precondition';
        return;
      }
    } else if (target.signupEnabled !== true) {
      abortReason = 'failed-precondition';
      return;
    }

    if (target.deadline && target.deadline < today) {
      abortReason = 'deadline-exceeded';
      return;
    }

    const applications = asObject(root.applications);
    const duplicated = Object.values(applications).some((application) => {
      const item = asObject(application);
      return item.userUid === uid && item[spec.idField] === input.targetId;
    });
    if (duplicated) {
      abortReason = 'already-exists';
      return;
    }

    const current = Math.max(0, Number(target[spec.countField]) || 0);
    const capacity = Math.max(0, Number(target.capacity) || 0);
    if (capacity > 0 && current + input.count > capacity) {
      abortReason = 'resource-exhausted';
      return;
    }

    target[spec.countField] = current + input.count;
    collection[input.targetId] = target;
    root[spec.collection] = collection;

    const record = {
      kind: spec.kind,
      name: input.name,
      phone: input.phone,
      count: input.count,
      userUid: uid,
      timestamp: Date.now(),
      [spec.idField]: input.targetId,
      [spec.titleField]: String(target.title || '').slice(0, 160)
    };
    if (input.note) record.note = input.note;
    applications[applicationId] = record;
    root.applications = applications;
    return root;
  }, undefined, false);

  if (!result.committed) {
    const messages = {
      'not-found': '신청 대상을 찾을 수 없습니다.',
      'failed-precondition': '현재 신청할 수 없는 항목입니다.',
      'deadline-exceeded': '신청 기간이 마감되었습니다.',
      'already-exists': '이미 신청한 항목입니다.',
      'resource-exhausted': '정원이 마감되었습니다.'
    };
    throw new HttpsError(abortReason, messages[abortReason] || '신청을 완료하지 못했습니다.');
  }

  return { ok: true, applicationId };
});

`;

source = source.replace(marker, code + marker);
fs.writeFileSync(filePath, source);
console.log('functions/index.js 정원 신청 Callable 적용 완료');
