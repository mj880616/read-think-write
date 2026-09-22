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


## 앱 이용권한 확인 무한대기 대응

- 실기기에서 OAuth 앱 복귀는 성공했으나 `이용 권한 확인 중…` 화면이 계속 유지됨.
- 서버의 `rtw_beta_access` 데이터는 정상이며 운영자 계정은 admin / active=true 확인.
- 기존 클라이언트가 RLS가 걸린 테이블을 직접 조회하던 경로를 제거함.
- 로그인한 사용자의 JWT 이메일만 기준으로 권한을 반환하는 `rtw_beta_access_status()` 전용 RPC 추가.
- 권한 확인 요청은 8초 타임아웃을 적용하고, 실패 시 무한 로딩 대신 오류와 '다시 시도' 버튼을 표시.
- 다음 실기기 확인: 앱 완전 종료 → 재실행 → 로그인 유지 또는 재로그인 → 권한 확인 통과 여부 확인.


## 앱 복귀 후 베타 권한 조회 인증 누락 수정

- 현상: 앱 복귀 후 `permission denied for function rtw_beta_access_status` 오류 발생.
- 확인 결과: 함수는 `authenticated` 역할에만 실행 권한이 있고 `anon`에는 없음. 이 권한 설계는 유지함.
- 원인: 네이티브 OAuth 직후 베타 권한 조회가 인증 헤더 없이 익명 요청으로 나갈 수 있었음.
- 조치: 앱은 Supabase 세션의 access token을 먼저 확인한 뒤, 해당 토큰을 Authorization Bearer 헤더로 명시해 `rtw_beta_access_status` RPC를 호출함.
- 보안 원칙: 오류를 피하기 위해 anon에게 함수 실행 권한을 추가하지 않음.
- 다음 실기기 검증: 앱 완전 종료 → 재실행 → Google 로그인 → 앱 복귀 → 권한 확인 통과 → 홈 진입.


## 베타 권한 확인 구조 단순화

- `rtw_beta_access_status()` RPC 경로를 제거함.
- `rtw_beta_access` 테이블에는 이미 authenticated 사용자가 자기 이메일 행만 SELECT할 수 있는 RLS 정책이 존재함을 재확인함.
- 앱은 OAuth 세션 access token을 명시적으로 붙여 `rtw_beta_access`에서 자기 이메일 행만 직접 조회함.
- 별도 SECURITY DEFINER RPC 없이 기존 RLS를 그대로 활용하므로 구조가 단순하고 권한 경계도 더 명확함.
- 다음 실기기 검증: 앱 완전 종료 → 재실행 → 로그인 유지 또는 재로그인 → 권한 확인 → 홈 진입.


## 로그인 후 Web2로 이동하는 경로 오류 수정

- 현상: 네이티브 OAuth 이후 앱이 읽생기 대신 Web2 화면으로 이동.
- 확인: 읽생기 웹 코드는 GitHub Pages 시절의 `/read-think-write/` 경로를 APP_BASE로 고정 사용하고 있었음.
- 조치: `read.bokdoong.com`에서는 APP_BASE를 `/`로 사용하고, GitHub Pages 직접 접속일 때만 `/read-think-write/`를 유지.
- redirect 복원 로직도 custom domain root 기준으로 분기.
- 다음 검증: 앱 완전 종료 → 재실행 → 로그인 상태 유지 또는 Google 로그인 → 읽생기 홈 유지 확인.


## 베타 권한 확인 서버 경로로 전환

- 앱/WebView에서 직접 RLS 조회하는 경로가 반복적으로 불안정해 권한 확인을 `rtw-beta-status` Edge Function으로 이동함.
- 앱은 Supabase access token만 서버로 전달함.
- Edge Function은 서버에서 토큰의 실제 사용자를 확인하고, 해당 이메일의 `rtw_beta_access` 한 행만 조회해 반환함.
- 서비스 역할 키는 Edge Function 내부에서만 사용하며 클라이언트에는 노출하지 않음.
- 허용 Origin은 `https://read.bokdoong.com`, `https://mj880616.github.io`로 제한함.
- 다음 실기기 검증: 앱 완전 종료 → 재실행 → Google 로그인/기존 세션 → 권한 확인 → 홈 진입.


## OAuth 세션 저장 순서 경쟁 수정

- 현상: 앱 복귀 후 `로그인 세션을 확인하지 못했습니다` 오류.
- 원인: `exchangeCodeForSession`이 세션 저장과 SIGNED_IN 이벤트를 먼저 발생시킨 뒤 반환하는데, 로그인 유지 기한(`rtw_remember_until_v1`)은 그 다음에 저장하고 있었음.
- 기존 guardedStorage는 로그인 유지 기한이 없으면 세션을 삭제하므로, 인증 이벤트 직후 `getSession()`이 방금 생성된 세션을 지우는 경쟁 조건이 발생함.
- 조치: OAuth code 교환 전에 로그인 유지 기한을 먼저 기록. code 교환 실패 시 유지 기한을 다시 제거.
- 보안 원칙: 세션 검증 규칙은 완화하지 않고 순서만 바로잡음.
- 다음 실기기 검증: 앱 완전 종료 → 다시 열기 → Google 로그인 → 앱 복귀 → 권한 확인 통과 → 홈 진입 → 앱 재실행 후 로그인 유지 확인.


## 로그인 후 404 화면 수정

- 현상: 로그인 성공 후 상단 내비게이션은 정상 표시되지만 본문은 `페이지를 찾을 수 없음`.
- 원인: 이전 테스트 과정에서 WebView 주소가 `/read-think-write/` 경로를 유지하고 있었고, custom domain은 현재 루트(`/`)를 기준으로 라우팅함.
- 조치: `read.bokdoong.com`에서 `/read-think-write` 및 하위 경로가 감지되면 동일한 루트 경로로 자동 정규화.
- 예: `/read-think-write/` → `/`, `/read-think-write/notes/` → `/notes/`.
- 다음 검증: 앱 재실행 시 홈 진입, 상단 탭 이동 정상 여부 확인.


## Android 기본 사용성 안정화

- Capacitor Android 앱에서 시스템 뒤로가기 버튼을 앱 내부 라우팅과 연결.
- 홈이 아닌 화면에서는 이전 화면으로 이동하고, 홈에서는 앱을 최소화함.
- 읽생기 외부의 http/https 링크는 앱 WebView 안에서 열지 않고 Capacitor Browser로 분리함.
- 웹 브라우저에서 읽생기를 사용할 때는 기존 동작 유지.
- 로그인 유지 구조는 기존 30일 remembered session 정책을 그대로 사용하며 OAuth 세션 저장 순서 경쟁 수정까지 반영된 상태임.
- 다음 실기기 검증: 앱 재실행 로그인 유지, 내부 탭 이동 후 뒤로가기, 외부 링크 브라우저 열림 확인.
- 다음 개발 단계: Android 공유 → 읽생기 저장.


## 직접 입력 404 수정

- 현상: 홈의 `직접 입력` 또는 읽기 화면의 `+ 새 자료`를 누르면 Not Found.
- 원인: 링크가 SPA 내부 이동이 아니라 브라우저 전체 페이지 이동으로 처리되어 `/read/?new=1` 경로를 서버 파일로 요청함.
- 조치: 직접 입력, + 새 자료, 읽기 목록 복귀 링크를 모두 History API 기반 앱 내부 이동으로 전환.
- APK 재설치 없이 웹 배포 반영 후 앱 재실행으로 적용 가능.


## 자동 로그인 시작화면 UX 정리

- 로그인된 사용자가 앱을 다시 열 때 세션 확인과 베타 권한 확인은 계속 내부적으로 수행함.
- 정상 상황에서는 `인증 확인 중`, `이용 권한 확인 중` 같은 내부 상태를 사용자에게 노출하지 않음.
- 시작 시에는 단일 `읽생기 여는 중…` 상태만 잠깐 표시.
- 실제 세션 만료, 권한 없음, 서버 오류가 있을 때만 로그인/오류 화면을 표시함.
- 목표 UX: 30일 remembered session이 유효하면 앱 실행 → 짧은 로딩 → 홈.


## Android 공유 → 읽생기 구현

- Android 공유 메뉴에서 `읽생기`가 text/plain 공유 대상으로 노출되도록 SEND intent 등록.
- 공유 텍스트에서 첫 번째 http/https URL을 추출함.
- 앱은 공유 URL을 `?share=` 파라미터로 루트에 전달하고, 웹 쪽에서 기존 `새 자료 → URL 가져오기` 흐름으로 연결함.
- 새 저장 로직을 따로 만들지 않고 기존 import 기능을 재사용해 중복과 기술부채를 줄임.
- cold start와 이미 앱이 열린 상태(onNewIntent) 모두 처리함.
- 다음 실기기 검증: Chrome/삼성인터넷 기사 → 공유 → 읽생기 → 새 자료 화면 → URL 자동 가져오기 확인.


## Android 공유 기능 병합 및 CI 확인

- PR #71은 2026-09-21 `main`에 병합 완료.
- 병합 커밋: `6b859922fb122d61a8e8a22e976bd13902032dfe`.
- PR 최종 커밋 기준 `Read Think Write tests`, `Test and Deploy GitHub Pages`, `Android mobile shell` 모두 성공 확인.
- Android 빌드 아티팩트 `readsaenggi-capacitor-test-apk` 생성 확인.
- 현재 단계는 구현이 아니라 실기기 공유 흐름 검증임.
- 검증 항목: Chrome/삼성인터넷의 URL 공유 → 공유 대상에서 읽생기 선택 → 앱 열림 → 새 자료 화면 진입 → URL 자동 전달 → 기존 URL 가져오기 정상 동작.
- 실기기 검증이 성공하면 Android 공유 기능을 완료 처리하고 release signing / 개인정보처리방침·지원 페이지 / Play Console 준비 단계로 이동함.

## 현재 진행률

약 45%. Capacitor 앱 실행, Google OAuth 앱 복귀, 세션 유지, 베타 권한 확인, custom domain 경로 정리, 기본 Android 내비게이션 및 Android 공유 기능 구현·CI까지 완료. Android 공유 기능은 실기기 최종 검증만 남음.


## Android 공유 실기기 검증 완료

- 2026-09-22 실기기에서 브라우저 공유 → 읽생기 선택 → 새 자료 화면 → URL 자동 전달 흐름 정상 확인.
- Android 공유 기능은 완료 처리함.

## 저장 글 삭제 기능

- 글 상세 화면에 삭제 버튼 추가.
- 삭제 전 확인창에서 연결 메모·책갈피 동시 삭제를 안내함.
- DB의 기존 FK 동작을 유지하여 메모·책갈피는 CASCADE 삭제, 글쓰기 기록은 유지하고 source_resource_id만 NULL 처리함.
- FK가 없는 rtw_relations의 고아 데이터를 남기지 않도록 security invoker RPC rtw_delete_resource(uuid)에서 관련 관계를 먼저 정리한 뒤 글을 삭제함.
- RPC는 authenticated에만 실행 권한을 부여하고 기존 RLS를 그대로 적용함.


## Google Play 출시 준비 단계

- Android 공유 실기기 검증 완료 후 출시 준비 단계로 전환.
- Capacitor 테스트용 appId `com.bokdoong.read.captest`를 정식 package ID `com.bokdoong.read`로 변경.
- 정식 package ID 전환 후 새 APK를 설치하여 Google OAuth 앱 복귀, 세션 유지, Android 공유 기능을 다시 한 번 검증해야 함.
- 개인정보처리방침 공개 URL: `https://read.bokdoong.com/privacy.html`.
- 지원 페이지 공개 URL: `https://read.bokdoong.com/support.html`.
- Android CI에서 debug APK와 release AAB를 함께 생성하도록 구성.
- GitHub Secrets에 업로드 키가 설정된 경우 release AAB를 업로드 키로 서명하고 검증함.
- 업로드 키 자체와 비밀번호는 저장소에 커밋하지 않음.
- Google Play 신규 개인 개발자 계정은 현재 최소 12명의 테스터가 14일 연속 비공개 테스트에 참여해야 프로덕션 액세스를 신청할 수 있음.
- 2026-08-31 이후 신규 앱은 Android 16 / API 36 이상 target이 필요하며 읽생기는 target SDK 36을 사용함.

### release signing에 필요한 GitHub Secrets

- `READSAENGGI_UPLOAD_KEYSTORE_B64`
- `READSAENGGI_UPLOAD_KEYSTORE_PASSWORD`
- `READSAENGGI_UPLOAD_KEY_ALIAS`
- `READSAENGGI_UPLOAD_KEY_PASSWORD`

업로드 키는 로컬의 안전한 위치에서 생성·백업한 뒤 keystore 파일을 base64로 변환해 Secret에 넣음. Play App Signing은 Google 생성 앱 서명 키를 사용하는 기본 구성을 권장하고, 개발자가 보관하는 키는 업로드 키로 한정함.

## 현재 진행률

약 55%. 앱 핵심 기능과 Android 공유, 정식 package ID 전환 코드, 개인정보처리방침/지원 페이지, AAB 빌드 경로까지 준비됨. 남은 핵심은 정식 ID APK 실기기 재검증, 업로드 키 생성·보관 및 CI Secret 설정, Play Console 개발자 등록·앱 생성, AAB 업로드, 비공개 테스트임.


## 업로드 키 생성 완료

- 2026-09-22 Google Play 업로드용 RSA 4096-bit 키 생성 완료.
- 키 alias: `readsaenggi-upload`
- 업로드 인증서 SHA-1: `3B:7A:0E:5B:C5:E1:C1:D7:4D:9A:D9:D6:BB:75:AF:E7:3E:6F:3F:3E`
- 업로드 인증서 SHA-256: `C2:BD:6D:49:F2:52:08:C0:D0:F4:54:8A:C6:6E:CF:EC:6A:FD:24:49:7A:CA:8C:85:91:AD:13:DF:31:33:5D:13`
- keystore와 비밀번호는 저장소에 커밋하지 않음.
- release AAB를 해당 업로드 키로 서명하고 `jarsigner -verify` 검증 완료.
- Play App Signing에서는 Google 생성 앱 서명 키를 사용하고, 위 키는 업로드 키로 사용하는 구성을 전제로 함.
- 최초 Play 업로드 후 Play Console에서 실제 앱 서명 키의 SHA-1/SHA-256 지문을 확인하여 Google OAuth 등 외부 API 공급자에 필요한 경우 추가 등록해야 함.

## 현재 진행률

약 62%. 정식 package ID, 개인정보처리방침/지원 페이지, release AAB 빌드, 업로드 키 생성, 최초 서명 AAB까지 준비됨. 남은 핵심은 정식 ID APK 실기기 재검증, GitHub Secrets 등록, Play Console 개발자 등록 및 앱 생성, 스토어/데이터 안전 양식 작성, 비공개 테스트 12명·14일임.


## Android 공유 URL 직접 전달 수정

- 정식 package ID APK에서 브라우저 공유 → 읽생기 실행은 되지만 URL 입력이 자동 반영되지 않는 현상 확인.
- 기존 구조는 네이티브가 `/?share=<url>`로 전달한 뒤 웹이 다시 `/read/?new=1&url=<url>`로 변환하는 2단계였음.
- 앱 cold start 시 두 단계 사이의 렌더링/observer 타이밍 경쟁 가능성을 제거하기 위해 네이티브가 처음부터 `/read/?new=1&url=<url>`로 직접 이동하도록 단순화.
- 기존 웹의 `?share=` 처리 코드는 호환용으로 남기되 Android 주 경로에서는 사용하지 않음.
- 새 APK에서 브라우저 공유 → 읽생기 → 새 자료 화면 → URL 자동 입력/가져오기 재검증 필요.


## Android 공유 404 수정

- 공유 시 읽생기 앱은 열리지만 `Not Found`가 표시되는 현상 확인.
- 원인은 네이티브 WebView가 `https://read.bokdoong.com/read/?new=1&url=...`을 직접 로드하면서 SPA 내부 경로를 서버 정적 경로로 요청한 것임.
- 네이티브 공유 진입은 다시 존재가 보장된 루트 `/?share=<url>`만 로드하도록 변경.
- `src/app-entry.js`가 본 앱 렌더링 전에 share 파라미터를 읽고 History API로 `/read/?new=1&url=<url>`로 즉시 정규화함.
- 따라서 서버에는 루트만 요청하고, `/read/` 이동은 브라우저 내부 History API에서만 처리함.
- 기존 reading-entry-flow의 share 처리는 비정상·구버전 진입에 대한 fallback으로 유지함.
- 새 APK에서 브라우저 공유 → 읽생기 → 새 자료 → URL 자동 가져오기 재검증 필요.


## Android 공유 최종 실기기 검증 완료

- 2026-09-22 정식 package ID `com.bokdoong.read` APK에서 브라우저 공유 → 읽생기 → 새 자료 → URL 자동 입력/가져오기 정상 동작 확인.
- 이전 `Not Found` 문제는 네이티브가 SPA 하위 경로를 직접 서버에 요청한 것이 원인이었으며, 루트 `/?share=` 진입 후 앱 부트 단계에서 History API로 내부 경로를 정규화하는 방식으로 해결함.
- Android 공유 기능은 최종 완료 처리함.
- 다음 단계는 Play Console 개발자 등록·앱 생성·스토어 정보/데이터 안전 작성·서명 AAB 업로드·비공개 테스트 준비임.

## 현재 진행률

약 65%. Android 앱 핵심 기능, Google OAuth, 세션 유지, 정식 package ID, Android 공유, 삭제 기능, 개인정보처리방침/지원 페이지, release AAB 빌드 및 업로드 키 준비까지 완료됨.
