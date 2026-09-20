# 읽생기 Android / Google Play 출시 상태

## 목표

기존 `read.bokdoong.com`을 서비스 본체로 유지하면서 Android 앱을 Google Play에 무료 배포합니다.

정식 출시 시에는 누구나 Google 계정으로 가입할 수 있게 하고, 사용자별 개인 공간을 분리합니다. 초대제는 비공개 테스트 기간에만 사용합니다.

## 현재 단계

4단계 안정화: Android 패키지 자체와 TWA 문제를 분리 진단.

## 확정된 결정

- Android 방식: TWA + Android Browser Helper/Bubblewrap 계열
- 웹 본체: https://read.bokdoong.com/
- 앱 이름: 읽생기
- package/application ID: `com.bokdoong.read`
- target SDK: 36
- JDK: 17
- 별도 신규 도메인 없음
- 추천 AI 기능 사용하지 않음
- 김명진 관리자: AI 읽기/생각확장 무제한
- 일반 무료 사용자: AI 읽기 3회/일, 생각확장 3회/일
- 정식 출시 시 가입 초대 제한 해제
- 사용자별 DB 격리 유지
- 외부 GPT 직접쓰기: 기존 지정 관리자 계정만
- 서명키/API 비밀정보는 GitHub에 저장하지 않음

## 이번 단계 완료 항목

- `android/` Android 프로젝트 골격 추가
- API 36 / Java 17 설정
- Android Browser Helper 의존성 추가
- 시작 URL을 `read.bokdoong.com`으로 설정
- 앱 ID `com.bokdoong.read` 확정
- 임시 앱 아이콘/색상/테마 추가
- 웹 앱 manifest 추가
- assetlinks 템플릿 준비
- GitHub Actions에서 debug APK 자동 생성
- 생성된 debug APK를 14일간 Actions artifact로 보관
- 웹 회귀 테스트 / Pages 배포 / Android build 자동검사 통과 구조 확보
- 현재 테스트 APK의 SHA-256 서명 지문 확인
- `/.well-known/assetlinks.json`에 현재 테스트 APK 지문 연결
- GitHub Pages에서 `.well-known` 경로가 배포되도록 `.nojekyll` 추가

## 아직 필요한 항목

1. `https://read.bokdoong.com/.well-known/assetlinks.json` 실배포 확인
2. 생성된 debug APK를 실제 Android 휴대전화에 설치
3. 앱 실행/뒤로가기/외부링크/로그인 흐름 실기기 확인
4. release signing key 생성 및 안전한 보관
4. signing SHA-256 fingerprint 확보
5. 실제 `/.well-known/assetlinks.json` 배포
6. TWA 전체화면 검증
7. Android 공유 → 읽생기 URL 가져오기
8. 개인정보처리방침/지원 페이지
9. Google Play 개발자 등록
10. AAB 생성 및 비공개 테스트
11. 12명 이상 14일 테스트
12. 정식 출시 직전 초대 제한 해제
13. 프로덕션 출시

## 인수인계 핵심

새 채팅에서는 이 문서를 먼저 읽고, 완료된 단계보다 앞선 작업을 반복하지 않습니다.

### 절대 변경하지 않을 것

- 김명진 기존 데이터 보존
- 사용자별 데이터 상호 격리
- 관리자 외 무료 사용자 AI 읽기 3회/일
- 관리자 외 무료 사용자 생각확장 3회/일
- 관리자 AI 제한 없음
- 추천 기능 사용 안 함
- 관리자 외 외부 GPT 직접쓰기 금지
- 웹을 서비스 본체로 유지
- 임시방편으로 보안·기술 부채를 늘리지 않음

## 진행률

약 18%.

## 남은 예상 비용

- Google Play 개발자 등록비: 25달러 1회
- 별도 도메인: 없음
- AI: 실사용량에 따른 변동비

## 남은 예상 일정

전체 Play 정식 출시까지 약 3~5주. 이 중 최소 14일은 Google Play 비공개 테스트 기간입니다.


## 실기기 실행 장애 기록

- 현상: 첫 debug APK가 실기기에서 열리지 않음.
- 판단: 앱 자체 빌드는 성공했으므로 런처/TWA 실행 경로 문제를 우선 의심.
- 조치: Android Browser Helper 공식 예제와 맞춰 WebView fallback 선언, Launcher intent DEFAULT category 추가, 런처 테마 안정화.
- 다음 확인: 새 debug APK 설치 후 최소한 화면이 열리는지 확인. TWA 전체화면 여부는 그 다음 판단.


## 2차 실행 장애 진단

- 수정 APK도 실기기에서 오류로 열리지 않음.
- 따라서 이번 테스트판은 TWA를 런처에서 제거하고 가장 단순한 Android Activity가 시스템 브라우저로 read.bokdoong.com을 여는 방식으로 전환.
- 목적: Android 패키지/설치/런처 자체 문제인지 TWA 설정 문제인지 분리 확인.
- 이 진단 APK가 열리면 Android 프로젝트 자체는 정상이고, 다음 수정 대상을 TWA/assetlinks/브라우저 연동으로 한정할 수 있음.
- 이 진단 APK가 열리지 않으면 기기 설치 정책 또는 APK 호환/서명/패키징 쪽을 우선 조사.
