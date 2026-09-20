# 읽생기 Android / Google Play 출시 상태

## 목표

기존 `read.bokdoong.com`을 서비스 본체로 유지하면서 Android 앱을 Google Play에 무료 배포합니다.

정식 출시 시에는 누구나 Google 계정으로 가입할 수 있게 하고, 사용자별 개인 공간을 분리합니다. 초대제는 비공개 테스트 기간에만 사용합니다.

## 현재 단계

2단계: Android TWA 앱 골격 제작.

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

## 아직 필요한 항목

1. CI에서 Android debug build 검증
2. release signing key 생성 및 안전한 보관
3. signing SHA-256 fingerprint 확보
4. 실제 `/.well-known/assetlinks.json` 배포
5. 실기기 APK 설치 테스트
6. Google 로그인 앱 환경 검증
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

약 12%.

## 남은 예상 비용

- Google Play 개발자 등록비: 25달러 1회
- 별도 도메인: 없음
- AI: 실사용량에 따른 변동비

## 남은 예상 일정

전체 Play 정식 출시까지 약 3~5주. 이 중 최소 14일은 Google Play 비공개 테스트 기간입니다.
