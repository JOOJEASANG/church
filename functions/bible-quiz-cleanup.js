const { onValueDeleted } = require('firebase-functions/v2/database');
const { getDatabase } = require('firebase-admin/database');
const logger = require('firebase-functions/logger');

const INSTANCE = 'church-399cb-default-rtdb';

exports.cleanupBibleQuizForDeletedUser = onValueDeleted(
  { ref: '/users/{uid}', instance: INSTANCE },
  async (event) => {
    const uid = event.params.uid;
    if (!uid) return;

    const db = getDatabase();
    const updates = {
      [`quizCustomQuestionsServer/${uid}`]: null,
      [`quizPracticeSessions/${uid}`]: null,
      [`quizStatsServer/${uid}`]: null
    };

    try {
      const roomsSnap = await db.ref('quizCompetitionRooms').get();
      if (roomsSnap.exists()) {
        roomsSnap.forEach((roomNode) => {
          const room = roomNode.val() || {};
          const roomId = roomNode.key;
          if (!roomId) return;

          if (room.hostUid === uid) {
            updates[`quizCompetitionRooms/${roomId}`] = null;
            if (room.code) updates[`quizCompetitionCodes/${room.code}`] = null;
          } else if (room.participants?.[uid]) {
            updates[`quizCompetitionRooms/${roomId}/participants/${uid}`] = null;
          }
        });
      }

      await db.ref().update(updates);
      logger.info('성경퀴즈 회원 데이터 정리 완료', { uid });
    } catch (error) {
      logger.error('성경퀴즈 회원 데이터 정리 실패', { uid, error });
    }
  }
);
