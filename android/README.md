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

## 테스트용 APK

GitHub Actions의 `Android skeleton` workflow가 성공하면 `readsaenggi-debug-apk` artifact가 생성됩니다.
이 APK는 실기기 동작 확인용이며 Play Store 배포용이 아닙니다.

주의:
- debug APK는 정식 배포 서명이 아님
- assetlinks는 release/Play signing 인증서가 확정된 뒤 연결
- 실제 로그인/전체화면 여부는 실기기 테스트에서 확인
