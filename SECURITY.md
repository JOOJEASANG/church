# Security Policy

## 신고 방법

보안 취약점에는 개인정보, 인증 우회, 관리자 권한, 비공개 기도제목, Storage 파일 접근 문제가 포함됩니다. 공개 이슈에 민감한 재현 정보나 개인정보를 올리지 말고 저장소 관리자에게 비공개로 전달하세요.

## 권한 모델

- Realtime Database 관리자 권한: `/admins/{uid}`
- 일반 회원 쓰기 권한: `/users/{uid}/status == approved`
- Cloud Storage 관리자 권한: Firebase Auth custom claim `admin == true`
- Cloud Storage 회원 업로드 권한: Firebase Auth custom claim `memberApproved == true`

custom claim은 `syncAccessClaims` Callable Function과 RTDB 트리거에서 갱신합니다.

## 배포 원칙

Functions, Database Rules, Storage Rules, Hosting을 같은 릴리스에서 배포하세요. 일부만 배포하면 클라이언트와 서버 권한 모델이 일시적으로 불일치할 수 있습니다.

## 비밀정보

Firebase 웹 API 키는 클라이언트 식별자이며 보안 경계가 아닙니다. 실제 접근 통제는 Authentication, App Check, Database Rules, Storage Rules, IAM으로 수행해야 합니다. 서비스 계정 키, Firebase CLI 토큰, 개인 키는 저장소에 커밋하지 마세요.
