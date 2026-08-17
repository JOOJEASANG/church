/* Cloud Functions deployment entry.
 * Keep the production callable surface explicit so Firebase does not try to
 * create legacy database/Eventarc triggers in an unsupported trigger region.
 * Deployment surface version: 2.2.0
 */
const existing = require('./index.js');
const quiz = require('./bible-quiz.js');
const quizV2 = require('./bible-quiz-v2.js');

exports.syncAccessClaims = existing.syncAccessClaims;
exports.submitCapacityApplication = existing.submitCapacityApplication;
exports.deleteMyAccount = existing.deleteMyAccount;
exports.bibleQuiz = quiz.bibleQuiz;
exports.bibleQuizV2 = quizV2.bibleQuizV2;
