# 천안남산교회 PWA

> 세대가 함께 쓰는 교회 앱 — 말씀, 기도, 나눔

## 구조

```
public/
├── index.html              사용자 앱 (5개 탭 PWA)
├── app.js                  사용자 앱 로직 (Firebase RTDB)
├── manifest.json           PWA 매니페스트
├── sw.js                   서비스 워커 (오프라인 캐싱)
├── firebase-init.js        Firebase 초기화 (공용)
├── firebase-messaging-sw.js  FCM 백그라운드 알림
├── icons/
└── admin/                  관리자 페이지
    ├── index.html
    └── admin.js

firebase.json               Hosting + DB rules 연결
.firebaserc                 Firebase 프로젝트 (church-399cb)
database.rules.json         RTDB 보안 규칙
```

## 사용자 앱 — 5개 탭

| 탭 | 기능 |
|---|---|
| 🏠 홈 | 인사, 다음 주일 카운트다운, 빠른 액션, 공지 피드 |
| 📖 말씀 | 유튜브 설교 (시작/종료 구간 자동 재생), 묵상 |
| 🙏 기도 | 공개·익명·비공개 기도제목, "기도했어요" 카운터 |
| 🤝 나눔 | 재능나눔방 카테고리 필터·신청, 봉사·심방·새가족 |
| 👤 내정보 | 큰글씨 모드, 알림, 홈화면 설치 |

## 관리자 페이지 (`/admin`)

이메일/비밀번호 로그인 → 대시보드 / 공지 / 설교 / 승인 / 신청내역 / 기도 / 재능나눔방 / 관리자 관리.

### 최초 관리자 등록

1. **Firebase 콘솔 → Authentication → 로그인 방법** → 이메일/비밀번호 활성화
2. 관리자 3인 계정 생성 (이메일 + 비밀번호)
3. `/admin` 페이지에서 첫 관리자 로그인 → `/admins/{uid}` 자동 생성 (DB 규칙으로 부트스트랩 허용)
4. 이후 추가 관리자는 관리자 페이지의 "관리자" 탭에서 UID 직접 등록

## Firebase Realtime Database 구조

```
/admins/{uid}                  관리자 화이트리스트
/announcements/{key}           공지사항 (홈 피드)
/sermons/current               이번 주 설교 (videoId, start, end 초)
/sermons/history/{key}         지난 설교
/rooms/{key}                   재능나눔방 (approved 플래그)
/prayers/{key}                 기도제목 (count)
/prayedBy/{prayerKey}/{uid}    중복 기도 방지
/applications/{key}            봉사·재능나눔방 신청 (관리자만 읽기)
/fcmTokens/{uid}/{token}       FCM 토큰
/_seed/v1                      시드 완료 플래그
```

## FCM 푸시 (옵션)

1. **Firebase 콘솔 → 프로젝트 설정 → Cloud Messaging → 웹 푸시 인증서**에서 VAPID 공개키 발급
2. `public/app.js` 안 `VAPID_KEY` 상수에 입력
3. 사용자가 "내 정보 → 알림 받기"를 켜면 FCM 토큰이 `/fcmTokens/{uid}` 에 저장
4. 푸시 발송: Firebase Functions 또는 외부 서버에서 Admin SDK로 토큰들에게 전송

## 배포

```bash
npm install -g firebase-tools
firebase login
firebase deploy
```

배포 URL: `https://church-399cb.web.app`

## 주보 업로드 + 자동 푸시

- 관리자 페이지 → "📄 주보" 메뉴에서 PDF/이미지 업로드 (최대 20MB)
- 업로드 즉시 RTDB `/bulletins` 등록 → Cloud Functions가 자동으로 모든 사용자 토큰에 FCM 푸시 발송
- 사용자 앱 "📖 말씀" 탭 하단에 최신 주보 카드로 노출

## Cloud Functions 배포

처음 한 번:
```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

자동 푸시 트리거:
- `/announcements/{key}` 신규 → 모든 토큰에 공지 푸시
- `/bulletins/{key}` 신규 → 모든 토큰에 "새 주보" 푸시
- `/sermons/current` 변경 → 모든 토큰에 "이번 주 말씀" 푸시
- 만료된 토큰은 자동 삭제

## 교회 외관 사진 적용

대화에서 보여주신 천안남산교회 사진을 다음 위치에 저장하면 자동으로 홈 히어로 배경에 적용됩니다.

```
public/img/hero.jpg
```

저장 후 `index.html` 의 CSS 한 줄만 변경:
```css
background-image: url('/img/hero.jpg');  /* 기존 hero.svg 에서 변경 */
```

## 다음 단계 (선택)

- [ ] 카카오톡 로그인
- [ ] 휴대폰 번호 인증
- [ ] QR 출석체크
- [ ] 헌금 안내
