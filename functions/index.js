/**
 * 천안남산교회 PWA - Cloud Functions
 *
 * 자동 FCM 푸시 발송:
 *  - 새 공지(announcements) 등록 시 모든 토큰에 푸시
 *  - 새 주보(bulletins) 등록 시 모든 토큰에 푸시
 *  - 새 설교(sermons/current) 변경 시 모든 토큰에 푸시
 */

const { onValueCreated, onValueWritten } = require('firebase-functions/v2/database');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');
const logger = require('firebase-functions/logger');

initializeApp();
setGlobalOptions({ region: 'asia-northeast3' }); // 서울 리전

const RTDB_URL = 'https://church-399cb-default-rtdb.firebaseio.com';

/* ---------- 공통 유틸 ---------- */

async function getAllTokens() {
  const snap = await getDatabase().ref('fcmTokens').get();
  if (!snap.exists()) return [];
  const tokens = [];
  snap.forEach((userNode) => {
    userNode.forEach((tokenNode) => {
      tokens.push({ token: tokenNode.key, uid: userNode.key });
    });
  });
  return tokens;
}

async function sendToAll({ title, body, url, tag }) {
  const tokenObjs = await getAllTokens();
  if (tokenObjs.length === 0) {
    logger.info('등록된 FCM 토큰 없음');
    return;
  }
  const tokens = tokenObjs.map((t) => t.token);

  const message = {
    notification: { title, body },
    data: {
      url: url || '/',
      tag: tag || 'default'
    },
    webpush: {
      fcmOptions: { link: url || '/' },
      notification: {
        icon: '/icons/icon.svg',
        badge: '/icons/icon.svg',
        requireInteraction: false
      }
    },
    tokens
  };

  const response = await getMessaging().sendEachForMulticast(message);
  logger.info(`푸시 발송: 성공 ${response.successCount} / 실패 ${response.failureCount}`);

  // 실패한 토큰 정리 (만료/삭제된 토큰)
  const cleanups = [];
  response.responses.forEach((res, i) => {
    if (!res.success) {
      const code = res.error?.code || '';
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-argument') ||
        code.includes('invalid-registration-token')
      ) {
        const { token, uid } = tokenObjs[i];
        cleanups.push(getDatabase().ref(`fcmTokens/${uid}/${token}`).remove());
      }
    }
  });
  await Promise.all(cleanups);
  return response;
}

/* ---------- 트리거 ---------- */

// 새 공지 등록 → 푸시
exports.onNewAnnouncement = onValueCreated(
  { ref: '/announcements/{key}', instance: 'church-399cb-default-rtdb' },
  async (event) => {
    const data = event.data.val();
    if (!data || !data.title) return;
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
  { ref: '/bulletins/{key}', instance: 'church-399cb-default-rtdb' },
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

// 이번 주 설교 변경 → 푸시 (videoId 가 새로 들어왔을 때만)
exports.onSermonUpdated = onValueWritten(
  { ref: '/sermons/current', instance: 'church-399cb-default-rtdb' },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    if (!after || !after.title) return;

    const titleChanged = before?.title !== after.title;
    const videoChanged = before?.videoId !== after.videoId && !!after.videoId;
    if (!titleChanged && !videoChanged) return;

    await sendToAll({
      title: '📖 이번 주 말씀이 올라왔어요',
      body: `${after.title}${after.verse ? ' · ' + after.verse : ''}`,
      url: '/?tab=word',
      tag: 'sermon'
    });
  }
);
