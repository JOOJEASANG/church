/**
 * 천안남산교회 PWA - Cloud Functions
 *
 * - FCM 대량 발송 및 만료 토큰 정리
 * - 관리자/승인 회원 custom claims 동기화
 * - 좋아요·댓글·기도·신청 집계값 서버 보정
 * - DB 삭제 시 연결된 Storage 파일 정리
 * - 안전한 회원 탈퇴 처리
 */

const { onValueCreated, onValueWritten } = require('firebase-functions/v2/database');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const logger = require('firebase-functions/logger');

initializeApp();
setGlobalOptions({ region: 'asia-northeast3', maxInstances: 20 });

const INSTANCE = 'church-399cb-default-rtdb';
const FCM_BATCH_SIZE = 500;
const VALID_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
  'messaging/invalid-registration-token'
]);

function chunks(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))];
}

async function getAllTokens() {
  const snap = await getDatabase().ref('fcmTokens').get();
  if (!snap.exists()) return [];
  const tokens = [];
  snap.forEach((userNode) => {
    userNode.forEach((tokenNode) => {
      if (tokenNode.key) tokens.push({ token: tokenNode.key, uid: userNode.key });
    });
  });
  return tokens;
}

async function sendToAll({ title, body, url = '/', tag = 'default' }) {
  const tokenObjs = await getAllTokens();
  if (!tokenObjs.length) {
    logger.info('등록된 FCM 토큰 없음');
    return { successCount: 0, failureCount: 0 };
  }

  let successCount = 0;
  let failureCount = 0;
  const cleanups = [];

  for (const batch of chunks(tokenObjs, FCM_BATCH_SIZE)) {
    const response = await getMessaging().sendEachForMulticast({
      notification: { title, body },
      data: { url, tag },
      webpush: {
        fcmOptions: { link: url },
        notification: {
          icon: '/icons/icon.svg',
          badge: '/icons/icon.svg',
          requireInteraction: false
        }
      },
      tokens: batch.map(({ token }) => token)
    });

    successCount += response.successCount;
    failureCount += response.failureCount;

    response.responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code || '';
      if (!VALID_TOKEN_ERROR_CODES.has(code)) return;
      const { token, uid } = batch[index];
      cleanups.push(getDatabase().ref(`fcmTokens/${uid}/${token}`).remove());
    });
  }

  await Promise.allSettled(cleanups);
  logger.info(`푸시 발송: 성공 ${successCount} / 실패 ${failureCount}`);
  return { successCount, failureCount };
}

async function mergeAccessClaims(uid, patch) {
  const user = await getAuth().getUser(uid);
  const next = { ...(user.customClaims || {}) };

  for (const [key, enabled] of Object.entries(patch)) {
    if (enabled) next[key] = true;
    else delete next[key];
  }

  await getAuth().setCustomUserClaims(uid, next);
  return next;
}

async function syncClaimsFromDatabase(uid) {
  const db = getDatabase();
  const [adminSnap, userSnap] = await Promise.all([
    db.ref(`admins/${uid}`).get(),
    db.ref(`users/${uid}`).get()
  ]);

  let profile = userSnap.val();
  if (profile && (!profile.status || !profile.memberType)) {
    const defaults = {};
    if (!profile.status) defaults.status = 'pending';
    if (!profile.memberType) defaults.memberType = 'member';
    await db.ref(`users/${uid}`).update(defaults);
    profile = { ...profile, ...defaults };
  }

  const isAdmin = adminSnap.exists();
  const isApproved = isAdmin || profile?.status === 'approved';
  await mergeAccessClaims(uid, { admin: isAdmin, memberApproved: isApproved });
  return { admin: isAdmin, memberApproved: isApproved, status: profile?.status || null };
}

exports.syncAccessClaims = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  try {
    return await syncClaimsFromDatabase(uid);
  } catch (error) {
    logger.error('접근 권한 동기화 실패', { uid, error });
    throw new HttpsError('internal', '접근 권한을 동기화하지 못했습니다.');
  }
});

exports.onAdminAccessChanged = onValueWritten(
  { ref: '/admins/{uid}', instance: INSTANCE },
  async (event) => {
    const uid = event.params.uid;
    try {
      const userSnap = await getDatabase().ref(`users/${uid}`).get();
      const approved = event.data.after.exists() || userSnap.child('status').val() === 'approved';
      await mergeAccessClaims(uid, {
        admin: event.data.after.exists(),
        memberApproved: approved
      });
    } catch (error) {
      if (error.code === 'auth/user-not-found') return;
      logger.error('관리자 claim 동기화 실패', { uid, error });
    }
  }
);

exports.onUserAccessChanged = onValueWritten(
  { ref: '/users/{uid}', instance: INSTANCE },
  async (event) => {
    const uid = event.params.uid;
    const after = event.data.after.val();
    try {
      if (!after) {
        const adminSnap = await getDatabase().ref(`admins/${uid}`).get();
        await mergeAccessClaims(uid, { memberApproved: adminSnap.exists() });
        return;
      }

      const defaults = {};
      if (!after.status) defaults.status = 'pending';
      if (!after.memberType) defaults.memberType = 'member';
      if (Object.keys(defaults).length) {
        await event.data.after.ref.update(defaults);
      }

      const adminSnap = await getDatabase().ref(`admins/${uid}`).get();
      await mergeAccessClaims(uid, {
        admin: adminSnap.exists(),
        memberApproved: adminSnap.exists() || (after.status || defaults.status) === 'approved'
      });
    } catch (error) {
      if (error.code === 'auth/user-not-found') return;
      logger.error('회원 claim 동기화 실패', { uid, error });
    }
  }
);

async function setCount(path, count) {
  const target = getDatabase().ref(path);
  const snap = await target.parent.get();
  if (!snap.exists()) return;
  await target.set(Math.max(0, count));
}

exports.syncPrayerCount = onValueWritten(
  { ref: '/prayedBy/{prayerId}/{uid}', instance: INSTANCE },
  async (event) => {
    const snap = await getDatabase().ref(`prayedBy/${event.params.prayerId}`).get();
    await setCount(`prayers/${event.params.prayerId}/count`, snap.numChildren());
  }
);

exports.syncPostLikeCount = onValueWritten(
  { ref: '/postLikes/{postId}/{uid}', instance: INSTANCE },
  async (event) => {
    const snap = await getDatabase().ref(`postLikes/${event.params.postId}`).get();
    await setCount(`posts/${event.params.postId}/likeCount`, snap.numChildren());
  }
);

exports.syncPostCommentCount = onValueWritten(
  { ref: '/postComments/{postId}/{commentId}', instance: INSTANCE },
  async (event) => {
    const snap = await getDatabase().ref(`postComments/${event.params.postId}`).get();
    await setCount(`posts/${event.params.postId}/commentCount`, snap.numChildren());
  }
);

function seoulDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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
  if (!targetId || /[.#$\[\]\/]/.test(targetId) || targetId.length > 160) {
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
    db.ref(`users/${uid}`).get(),
    db.ref(`admins/${uid}`).get()
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

async function sumApplications(field, id, countField = null) {
  const snap = await getDatabase().ref('applications').orderByChild(field).equalTo(id).get();
  let total = 0;
  snap.forEach((child) => {
    const value = child.val() || {};
    total += countField ? Math.max(1, Number(value[countField]) || 1) : 1;
  });
  return total;
}

exports.syncApplicationCounters = onValueWritten(
  { ref: '/applications/{applicationId}', instance: INSTANCE },
  async (event) => {
    const before = asObject(event.data.before.val());
    const after = asObject(event.data.after.val());
    const roomIds = uniqueStrings([before.roomId, after.roomId]);
    const postIds = uniqueStrings([before.postId, after.postId]);
    const announcementIds = uniqueStrings([before.announcementId, after.announcementId]);

    await Promise.all([
      ...roomIds.map(async (roomId) => {
        const count = await sumApplications('roomId', roomId);
        await setCount(`rooms/${roomId}/joined`, count);
      }),
      ...postIds.map(async (postId) => {
        const count = await sumApplications('postId', postId, 'count');
        await setCount(`posts/${postId}/signupCount`, count);
      }),
      ...announcementIds.map(async (announcementId) => {
        const count = await sumApplications('announcementId', announcementId, 'count');
        await setCount(`announcements/${announcementId}/signupCount`, count);
      })
    ]);
  }
);

function storagePathsFromRecord(record) {
  const paths = [];
  if (Array.isArray(record?.imageStoragePaths)) paths.push(...record.imageStoragePaths);
  if (record?.imageStoragePath) paths.push(record.imageStoragePath);
  if (record?.storagePath) paths.push(record.storagePath);
  return uniqueStrings(paths);
}

async function deleteStoragePaths(paths) {
  const bucket = getStorage().bucket();
  await Promise.allSettled(paths.map((path) => bucket.file(path).delete({ ignoreNotFound: true })));
}

exports.cleanupPostStorage = onValueWritten(
  { ref: '/posts/{postId}', instance: INSTANCE },
  async (event) => {
    if (!event.data.before.exists() || event.data.after.exists()) return;
    await deleteStoragePaths(storagePathsFromRecord(event.data.before.val()));
  }
);

exports.cleanupGalleryStorage = onValueWritten(
  { ref: '/gallery/{galleryId}', instance: INSTANCE },
  async (event) => {
    if (!event.data.before.exists() || event.data.after.exists()) return;
    await deleteStoragePaths(storagePathsFromRecord(event.data.before.val()));
  }
);

exports.cleanupBulletinStorage = onValueWritten(
  { ref: '/bulletins/{bulletinId}', instance: INSTANCE },
  async (event) => {
    if (!event.data.before.exists() || event.data.after.exists()) return;
    await deleteStoragePaths(storagePathsFromRecord(event.data.before.val()));
  }
);

async function collectQueryDeletes(updates, path, field, uid, onItem) {
  const snap = await getDatabase().ref(path).orderByChild(field).equalTo(uid).get();
  snap.forEach((child) => {
    updates[`${path}/${child.key}`] = null;
    onItem?.(child.key, child.val() || {});
  });
}

async function collectNestedAuthorDeletes(updates, path, uid) {
  const snap = await getDatabase().ref(path).get();
  snap.forEach((parent) => {
    parent.forEach((child) => {
      if (child.child('authorUid').val() === uid) updates[`${path}/${parent.key}/${child.key}`] = null;
    });
  });
}

async function collectUidMarkers(updates, path, uid) {
  const snap = await getDatabase().ref(path).get();
  snap.forEach((parent) => {
    if (parent.child(uid).exists()) updates[`${path}/${parent.key}/${uid}`] = null;
  });
}

function compactUpdates(updates) {
  const result = {};
  const paths = Object.keys(updates).sort((a, b) => {
    const depth = a.split('/').length - b.split('/').length;
    return depth || a.localeCompare(b);
  });

  for (const path of paths) {
    const parts = path.split('/');
    let shadowed = false;
    for (let i = 1; i < parts.length; i += 1) {
      const ancestor = parts.slice(0, i).join('/');
      if (result[ancestor] === null) {
        shadowed = true;
        break;
      }
    }
    if (!shadowed) result[path] = updates[path];
  }
  return result;
}

exports.deleteMyAccount = onCall({ timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  if (request.data?.confirmation !== '삭제') {
    throw new HttpsError('invalid-argument', '확인 문구가 올바르지 않습니다.');
  }

  const db = getDatabase();
  const adminSnap = await db.ref(`admins/${uid}`).get();
  if (adminSnap.exists()) {
    throw new HttpsError('failed-precondition', '관리자 권한을 먼저 다른 최고관리자가 제거해야 합니다.');
  }

  const updates = {};
  const storagePaths = [];
  const ownPostIds = [];
  const ownPrayerIds = [];
  const ownRoomIds = [];

  await Promise.all([
    collectQueryDeletes(updates, 'applications', 'userUid', uid),
    collectQueryDeletes(updates, 'feedback', 'authorUid', uid),
    collectQueryDeletes(updates, 'prayers', 'createdBy', uid, (id) => ownPrayerIds.push(id)),
    collectQueryDeletes(updates, 'posts', 'authorUid', uid, (id, value) => {
      ownPostIds.push(id);
      storagePaths.push(...storagePathsFromRecord(value));
    }),
    collectQueryDeletes(updates, 'gallery', 'uploaderUid', uid, (_id, value) => {
      storagePaths.push(...storagePathsFromRecord(value));
    }),
    collectQueryDeletes(updates, 'rooms', 'createdBy', uid, (id) => ownRoomIds.push(id)),
    collectNestedAuthorDeletes(updates, 'postComments', uid),
    collectNestedAuthorDeletes(updates, 'roomBoards', uid),
    collectUidMarkers(updates, 'postLikes', uid),
    collectUidMarkers(updates, 'prayedBy', uid)
  ]);

  for (const postId of ownPostIds) {
    updates[`postLikes/${postId}`] = null;
    updates[`postComments/${postId}`] = null;
  }
  for (const prayerId of ownPrayerIds) updates[`prayedBy/${prayerId}`] = null;
  for (const roomId of ownRoomIds) updates[`roomBoards/${roomId}`] = null;

  updates[`fcmTokens/${uid}`] = null;
  updates[`userNotes/${uid}`] = null;
  updates[`users/${uid}`] = null;

  try {
    await db.ref().update(compactUpdates(updates));
    await deleteStoragePaths(uniqueStrings(storagePaths));
    await getAuth().deleteUser(uid);
    logger.info('회원 탈퇴 완료', { uid });
    return { ok: true };
  } catch (error) {
    logger.error('회원 탈퇴 실패', { uid, error });
    throw new HttpsError('internal', '회원 탈퇴 처리 중 오류가 발생했습니다.');
  }
});

// 새 공지 등록 → 푸시
exports.onNewAnnouncement = onValueCreated(
  { ref: '/announcements/{key}', instance: INSTANCE },
  async (event) => {
    const data = event.data.val();
    if (!data?.title) return;
    const tagLabel = ({ urgent: '[중요]', event: '[신청]', notice: '', praise: '[감사]' })[data.tag] || '';
    await sendToAll({
      title: `${tagLabel} ${data.title}`.trim(),
      body: data.body || '새 공지가 등록되었습니다',
      url: '/',
      tag: 'announcement'
    });
  }
);

// 새 주보 등록 → 푸시
exports.onNewBulletin = onValueCreated(
  { ref: '/bulletins/{key}', instance: INSTANCE },
  async (event) => {
    const data = event.data.val();
    if (!data) return;
    await sendToAll({
      title: '📄 새 주보가 등록되었습니다',
      body: data.title || '이번 주 주보를 확인해보세요',
      url: '/?tab=word',
      tag: 'bulletin'
    });
  }
);

// 이번 주 설교 변경 → 푸시
exports.onSermonUpdated = onValueWritten(
  { ref: '/sermons/current', instance: INSTANCE },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    if (!after?.title) return;
    const titleChanged = before?.title !== after.title;
    const videoChanged = before?.videoId !== after.videoId && Boolean(after.videoId);
    if (!titleChanged && !videoChanged) return;

    await sendToAll({
      title: '📖 이번 주 말씀이 올라왔어요',
      body: `${after.title}${after.verse ? ` · ${after.verse}` : ''}`,
      url: '/?tab=word',
      tag: 'sermon'
    });
  }
);
