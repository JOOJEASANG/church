import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    fail(`필수 파일 없음: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(absolute, 'utf8');
}

for (const jsonPath of [
  'package.json',
  'firebase.json',
  'database.rules.json',
  'public/manifest.json',
  'functions/package.json'
]) {
  const content = read(jsonPath);
  if (!content) continue;
  try { JSON.parse(content); }
  catch (error) { fail(`${jsonPath} JSON 오류: ${error.message}`); }
}

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

for (const file of walk(root).filter((file) => file.endsWith('.js') || file.endsWith('.mjs'))) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`${path.relative(root, file)} 문법 오류:\n${result.stderr.trim()}`);
  }
}

const app = read('public/app.js');
const dbRules = read('database.rules.json');
const storageRules = read('storage.rules');
const functions = read('functions/index.js');
const firebaseInit = read('public/firebase-init.js');
const sw = read('public/sw.js');
const quizCopy = read('public/bible-quiz-copy.js');
const appPolish = read('public/app-polish.js');
const deployWorkflow = read('.github/workflows/deploy-firebase.yml');
let parsedRules = null;
let functionsPackage = null;
try { parsedRules = JSON.parse(dbRules).rules; } catch {}
try { functionsPackage = JSON.parse(read('functions/package.json')); } catch {}

const assertions = [
  [app.includes("orderByChild('type'), equalTo(type)"), '기도제목 공개 범위 쿼리가 없습니다.'],
  [!app.includes("onValueWithError('prayers'"), '기도제목 전체 루트 리스너가 남아 있습니다.'],
  [app.includes('posts/${state.uid}/'), '게시물 이미지가 UID별 Storage 경로를 사용하지 않습니다.'],
  [app.includes('customMetadata: { ownerUid: state.uid }'), '게시물 이미지 소유자 메타데이터가 없습니다.'],
  [app.includes('serviceWorkerRegistration: registration'), 'FCM이 PWA 서비스워커 등록을 재사용하지 않습니다.'],
  [app.includes("status: 'pending'"), '신규 회원 기본 승인 대기 상태가 없습니다.'],
  [app.includes("orderByChild('userUid'), equalTo(state.uid)"), '본인 신청 내역 보안 쿼리가 없습니다.'],
  [app.includes("targetType: 'room'"), '재능나눔 서버 신청 호출이 없습니다.'],
  [app.includes("targetType: kind === 'post' ? 'post' : 'announcement'"), '행사·모임 서버 신청 호출이 없습니다.'],
  [!app.includes('async function handleWithdraw()'), '구형 클라이언트 회원 탈퇴 코드가 남아 있습니다.'],
  [!app.includes('deleteUser,'), '구형 클라이언트 탈퇴용 Auth import가 남아 있습니다.'],
  [dbRules.includes("query.orderByChild === 'type'"), '비공개 기도제목 쿼리 보안 규칙이 없습니다.'],
  [dbRules.includes('bootstrapAdminUid'), '최초 관리자 UID 제한이 없습니다.'],
  [parsedRules?.admins?.['.read'] !== 'auth != null', '일반 로그인 사용자가 관리자 전체 목록을 읽을 수 있습니다.'],
  [parsedRules?.admins?.$uid?.['.read']?.includes('auth.uid === $uid'), '관리자 본인 확인용 단일 경로 읽기 규칙이 없습니다.'],
  [parsedRules?.applications?.['.read']?.includes("query.orderByChild === 'userUid'"), '본인 신청 쿼리 읽기 규칙이 없습니다.'],
  [parsedRules?.applications?.$id?.['.write']?.includes("newData.child('kind').val() !== '행사'"), '정원 신청의 직접 클라이언트 쓰기가 차단되지 않았습니다.'],
  [storageRules.includes('request.auth.token.admin == true'), 'Storage 관리자 custom claim 검사가 없습니다.'],
  [storageRules.includes('request.resource.metadata.ownerUid'), 'Storage 업로드 소유자 검사가 없습니다.'],
  [functions.includes('FCM_BATCH_SIZE = 500'), 'FCM 토큰 배치 처리가 없습니다.'],
  [functions.includes('exports.deleteMyAccount'), '서버 측 회원 탈퇴 함수가 없습니다.'],
  [functions.includes('exports.syncAccessClaims'), '접근 권한 claim 동기화 함수가 없습니다.'],
  [functions.includes('exports.submitCapacityApplication'), '정원 신청 서버 트랜잭션 함수가 없습니다.'],
  [functions.includes("abortReason = 'already-exists'"), '중복 신청 서버 검사가 없습니다.'],
  [functions.includes('db.ref().transaction'), '정원 신청 원자적 트랜잭션이 없습니다.'],
  [!firebaseInit.includes('window.fetch ='), '전역 fetch 덮어쓰기가 남아 있습니다.'],
  [firebaseInit.includes("loadModule('/app-polish.js'"), '공통 사용성 보정 모듈이 로드되지 않습니다.'],
  [sw.includes('url.origin === self.location.origin'), '알림 이동 URL의 동일 출처 검사가 없습니다.'],
  [fs.existsSync(path.join(root, 'public/offline.html')), '오프라인 안내 페이지가 없습니다.'],
  [fs.existsSync(path.join(root, 'public/admin/member-approval.js')), '회원 승인 관리 모듈이 없습니다.'],
  [functionsPackage?.engines?.node === '22', 'Cloud Functions 런타임이 Node.js 22가 아닙니다.'],
  [!fs.existsSync(path.join(root, '.github/workflows/deploy.yml')), '중복 Firebase 배포 워크플로가 남아 있습니다.'],
  [deployWorkflow.includes('node-version: 22'), '배포 워크플로가 Node.js 22를 사용하지 않습니다.'],
  [deployWorkflow.includes('github.event.before'), 'Functions 변경 감지가 push 전체 범위를 사용하지 않습니다.'],
  [quizCopy.includes('observer.disconnect()'), '성경퀴즈 문구 DOM 감시가 적용 후 종료되지 않습니다.'],
  [quizCopy.includes('10000'), '성경퀴즈 문구 DOM 감시에 안전 종료 시간이 없습니다.'],
  [appPolish.includes(':focus-visible'), '키보드 포커스 가시성 보정이 없습니다.'],
  [appPolish.includes('prefers-reduced-motion'), '모션 최소화 접근성 보정이 없습니다.']
];

for (const [condition, message] of assertions) {
  if (!condition) fail(message);
}

if (failures.length) {
  console.error(`검증 실패 (${failures.length}건)`);
  failures.forEach((message, index) => console.error(`${index + 1}. ${message}`));
  process.exit(1);
}

console.log('저장소 정적 검증 통과');
