# 읽생기 Android - Capacitor 전환 테스트

TWA 실기기 실행 실패를 반복한 뒤, Android 패키지 자체와 TWA 문제를 분리한 결과 Android 기본 런처는 정상 실행됨을 확인했습니다.

이 디렉터리는 TWA 대신 Capacitor 8 기반 Android 셸을 검증하기 위한 최소 프로젝트입니다.

- 앱 ID: `com.bokdoong.read.captest`
- 앱 이름: 읽생기
- 웹 본체: `https://read.bokdoong.com`
- Capacitor: 8.5.2
- 목적: 앱 내부 WebView에서 현재 읽생기 웹을 안정적으로 여는지 확인

현재는 실행 안정성만 검증합니다. Google OAuth, Android 공유, 정식 패키지/서명은 이 테스트 성공 후 처리합니다.
