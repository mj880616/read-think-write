# 읽생기 Android / Google Play 출시 상태

## 목표

기존 `read.bokdoong.com`을 서비스 본체로 유지하면서 Android 앱을 Google Play에 무료 배포합니다.

정식 출시 시에는 누구나 Google 계정으로 가입할 수 있게 하고, 사용자별 개인 공간을 분리합니다. 초대제는 비공개 테스트 기간에만 사용합니다.

## 현재 단계

5단계: Capacitor 앱 Google OAuth 딥링크 복귀 구현.

## 확정된 결정

- Android 방식: Capacitor 8 기반 WebView 셸 (TWA 폐기)
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


## TWA 최종 진단 시도

- 공식 Android Browser Helper 예제와 비교해 Launcher theme를 AppCompat NoActionBar 계열로 변경.
- 삼성 인터넷 등 다른 Custom Tabs provider 선택 가능성을 제거하기 위해 테스트판은 Google Chrome(com.android.chrome)을 명시적으로 사용.
- 이 테스트가 실패하면 TWA 방식은 중단하고 다른 Android 래핑 방식으로 전환.


## 아키텍처 전환 결정: TWA → Capacitor

- 실기기에서 일반 Android 진단 런처는 정상 실행됨.
- 반면 TWA LauncherActivity 기반 APK는 여러 차례 반복해 실행 실패함.
- Digital Asset Links, 고정 테스트 서명, Chrome 강제, AppCompat 테마까지 검증했으나 실기기 실행 실패가 지속됨.
- 동일 경로를 반복하는 것은 기술부채와 일정 손실이 크다고 판단해 TWA를 중단함.
- 기존 TWA 코드는 참고용으로 남기되 활성 Android 경로는 `mobile/` Capacitor 프로젝트로 전환함.
- 1차 Capacitor 검증은 `read.bokdoong.com`을 앱 내부 WebView에서 여는 최소 셸만 구성함.
- 이 테스트가 성공하면 Google 로그인과 Android 공유 기능을 Capacitor/네이티브 방식으로 이어서 구현함.

## 현재 진행률

약 20%. TWA 실패로 진도가 늦어졌지만 Android 패키지 정상 여부는 이미 확인했고, 앱 래핑 방식을 전환한 상태임.


## Capacitor 실기기 검증 성공

- 2026-09-21 실기기에서 Capacitor 테스트 APK 정상 실행 확인.
- 브라우저 주소창 없이 앱 내부 WebView에서 읽생기 로그인 화면이 정상 표시됨.
- Android 패키지 실행과 웹 로딩 경로 모두 정상으로 확인.
- TWA는 공식적으로 폐기하고 Capacitor를 정식 Android 기반으로 채택.
- 다음 단계: Google 로그인/세션 유지 → Android 뒤로가기/외부링크 → Android 공유 대상 구현.

## 현재 진행률

약 25%.


## Google OAuth 앱 복귀 구현

- 실기기에서 Google 인증 자체는 성공했으나 인증 완료 후 브라우저에 남는 현상 확인.
- Android 앱에서는 OAuth redirect를 `com.bokdoong.read://auth/callback`으로 분리.
- 인증은 Capacitor Browser에서 진행하고, Android 딥링크가 읽생기 앱을 다시 열도록 구성.
- 앱 복귀 후 기존 PKCE verifier를 사용해 `exchangeCodeForSession`으로 Supabase 세션을 앱 WebView에 생성.
- 웹 브라우저 로그인 흐름은 기존 동작 유지.
- 필요한 Supabase 설정: Auth > URL Configuration의 Redirect URLs에 `com.bokdoong.read://auth/callback` 추가.
- 다음 실기기 검증: Google 로그인 → 외부 인증 → 읽생기 앱 자동 복귀 → 로그인 완료 확인.

## 현재 진행률

약 30% (코드 구현 완료 기준, Supabase redirect 허용 및 실기기 재검증 전).


## OAuth 복귀 후 권한 확인 정체 수정

- 현상: Google 인증 후 읽생기 앱으로 정상 복귀하지만 `이용 권한 확인 중…`에서 진행되지 않음.
- 원인 판단: native OAuth는 페이지 재로드 없이 Supabase SIGNED_IN 이벤트를 발생시킴. 기존 코드가 `onAuthStateChange` 콜백 안에서 즉시 `render()`를 호출했고, render가 다시 Supabase의 `rtw_beta_access` 조회를 시작하면서 인증 콜백과 후속 조회가 충돌할 수 있었음.
- 조치: 인증 상태 콜백에서는 사용자 상태만 반영하고, Supabase 조회가 필요한 render는 다음 이벤트 루프로 지연.
- 다음 실기기 검증: Google 로그인 → 앱 복귀 → 이용 권한 확인 통과 → 홈 화면 진입.
