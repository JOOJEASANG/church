# 천안남산교회 PWA

> 세대가 함께 쓰는 교회 앱 — 말씀, 기도, 나눔

## 주요 기능

- 사용자 앱: 교회 소식, 설교·주보, 기도제목, 재능나눔, 행사·봉사·심방·새가족 신청, 캘린더, 커뮤니티, 푸시 알림
- 관리자 앱(`/admin`): 공지·설교·주보·일정·신청·기도·재능나눔·교회 정보·회원 승인·관리자 관리
- 회원 승인: 신규 가입자는 `pending`으로 등록되며 관리자가 승인한 뒤 쓰기·신청·업로드 기능을 사용할 수 있습니다.
- PWA: 설치, 서비스워커 업데이트, 오프라인 안내, FCM 백그라운드 알림

## 프로젝트 구조

```text
public/
├── index.html
├── app.js
├── firebase-init.js
├── member-status.js
├── sw.js
├── firebase-messaging-sw.js
├── offline.html
└── admin/
    ├── index.html
    ├── admin.js
    ├── admin-claims.js
    └── member-approval.js

functions/
├── index.js
└── package.json

scripts/
├── apply-client-hardening.mjs
└── validate-repo.mjs

database.rules.json
storage.rules
firebase.json
```

## 최초 관리자 등록

최초 관리자 자동 등록은 임의의 첫 로그인 사용자가 관리자 권한을 얻지 못하도록 UID로 제한됩니다.

1. Firebase Console → Authentication에서 관리자 계정을 생성합니다.
2. 생성된 계정의 UID를 확인합니다.
3. Realtime Database 콘솔에서 `/config/security/bootstrapAdminUid`에 해당 UID를 문자열로 등록합니다.
4. 그 계정으로 `/admin`에 로그인하면 `/admins/{uid}`가 최고관리자로 생성됩니다.
5. 최초 등록 후 `bootstrapAdminUid` 값은 삭제할 수 있습니다.
6. 이후 관리자 추가·제거는 최고관리자만 수행할 수 있습니다.

기존 관리자 계정은 로그인 시 Cloud Function을 통해 Storage용 `admin` custom claim을 동기화합니다.

## 회원 승인 운영

1. 신규 가입 계정은 `/users/{uid}/status = pending`으로 생성됩니다.
2. 관리자 페이지의 **회원 승인** 메뉴에서 승인·대기·정지 상태를 변경합니다.
3. 승인 시 `memberApproved` custom claim이 동기화됩니다.
4. 이전 버전에서 생성되어 `status`가 없는 계정은 관리자 페이지의 **미설정 기존 계정 일괄 승인** 기능으로 명시적으로 승인할 수 있습니다.

`교역자에게만 전달` 기도제목은 관리자와 작성자만 읽을 수 있으며, 일반 사용자는 공개 유형만 제한 쿼리로 불러옵니다.

## Cloud Functions

다음 기능이 서버에서 처리됩니다.

- 공지·주보·설교 FCM 푸시 발송 및 만료 토큰 정리
- 관리자·회원 승인 custom claims 동기화
- 좋아요·댓글·기도 참여·신청 인원 집계값 보정
- 게시물·갤러리·주보 DB 삭제 시 연결된 Storage 파일 정리
- 본인 데이터와 Firebase Authentication 계정을 함께 삭제하는 안전한 회원 탈퇴

## 로컬 검증

Node.js 20 이상에서 실행합니다.

```bash
npm run patch:client
npm run check
```

GitHub Actions도 동일한 패치와 검증을 실행합니다. `apply-client-hardening.mjs`는 중복 실행해도 같은 결과가 나오도록 작성되어 있습니다.

## 배포

```bash
npm install -g firebase-tools
firebase login
npm --prefix functions install
npm run patch:client
npm run check
firebase deploy
```

Functions, Realtime Database Rules, Storage Rules, Hosting을 함께 배포해야 회원 승인과 Storage 권한이 일치합니다.

배포 URL: `https://church-399cb.web.app`

## FCM 설정

1. Firebase Console → 프로젝트 설정 → Cloud Messaging → 웹 푸시 인증서에서 VAPID 공개키를 확인합니다.
2. `public/app.js`의 `VAPID_KEY`와 일치하는지 확인합니다.
3. 앱은 `/sw.js` 등록을 FCM에도 재사용하여 PWA 서비스워커와 메시징 서비스워커가 충돌하지 않도록 합니다.

## 데이터 구조

```text
/admins/{uid}                    관리자 화이트리스트
/users/{uid}                     프로필·회원 승인 상태
/announcements/{key}             공지사항
/sermons/current                 이번 주 설교
/sermons/history/{key}           지난 설교
/bulletins/{key}                 주보
/events/{key}                    교회 일정
/rooms/{key}                     재능나눔방
/prayers/{key}                   기도제목
/prayedBy/{prayerKey}/{uid}      기도 참여 중복 방지
/posts/{key}                     커뮤니티 게시물
/postLikes/{postKey}/{uid}       좋아요 중복 방지
/postComments/{postKey}/{key}    댓글
/applications/{key}              각종 신청
/fcmTokens/{uid}/{token}         FCM 토큰
/userNotes/{uid}/{date}          개인 묵상 노트
```

## 보안 운영 주의사항

- Firebase Console 계정과 GitHub 저장소 권한은 최소 인원에게만 부여합니다.
- 관리자 권한을 제거한 사용자는 다시 로그인하거나 토큰을 갱신해야 변경된 권한이 즉시 반영됩니다.
- 보안 규칙만 단독 배포하지 말고 Functions와 Hosting 변경도 함께 배포합니다.
- 운영 전 Firebase Emulator Suite에서 회원 가입·승인·글쓰기·비공개 기도·파일 업로드·탈퇴 흐름을 점검하는 것을 권장합니다.
