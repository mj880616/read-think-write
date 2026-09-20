# 읽생기 Android

읽생기 Android 앱의 1차 골격입니다.

- 방식: Trusted Web Activity (TWA)
- 앱 ID: `com.bokdoong.read`
- 시작 주소: `https://read.bokdoong.com/`
- target SDK: 36
- Android Browser Helper: 2.7.3
- JDK: 17

## 아직 하지 않은 것

1. 실제 release signing key 생성
2. SHA-256 fingerprint 확정
3. `/.well-known/assetlinks.json` 공개
4. 실기기 설치 테스트
5. Android 공유 대상(Web Share Target) 구현
6. Google Play AAB 배포

서명키, 비밀번호, 서비스 키는 저장소에 커밋하지 않습니다.
