# Supabase 로그인 복귀 허용 주소 (Redirect URLs)

Supabase Auth → URL Configuration → Redirect URLs 중 읽생기가 쓰는 항목이다.
앱이 계산한 `redirectTo`가 이 목록과 **한 글자라도 다르면**(끝 슬래시 포함) Google 로그인 뒤
앱으로 돌아오지 못한다.

## 현재 목록

아래 블록은 `tests/custom-domain-base.test.mjs`가 그대로 읽어 앱 계산값과 비교한다.
목록을 바꾸면 테스트도 같이 통과해야 한다(블록 밖으로 옮기거나 형식을 바꾸지 않는다).

<!-- redirect-allowlist:start -->
```text
https://read.bokdoong.com/
https://mj880616.github.io/read-think-write/
https://read-test.bokdoong.com/
com.bokdoong.read://auth/callback
```
<!-- redirect-allowlist:end -->

| 주소 | 쓰이는 곳 |
| --- | --- |
| `https://read.bokdoong.com/` | 운영. 전용 Worker(`rtw-router`) 뒤, 앱 기준 경로 `/` |
| `https://mj880616.github.io/read-think-write/` | GitHub Pages 원본 주소로 직접 접속할 때 |
| `https://read-test.bokdoong.com/` | 시험 도메인(운영과 같은 Worker) |
| `com.bokdoong.read://auth/callback` | Android 앱(Capacitor) 딥링크 복귀 |

계산 위치: `src/config.js`(`APP_BASE`, `ROOT_APP_HOSTS`)와 `src/auth-oauth.js`(`signInWithGoogle`).

## 규칙

- 비교는 **끝 슬래시까지 글자 그대로**다. `https://read.bokdoong.com`(슬래시 없음)은 다른 주소다.
- **Site URL(`https://mj880616.github.io/work/app/`)은 바꾸지 않는다.** 이 Supabase 프로젝트는
  Web1·Web2와 공용이며 Site URL은 그쪽 기본 복귀 주소다.
- 공용 프로젝트이므로 Redirect URLs를 추가·삭제하기 **전에 Web2 채팅에 통보**한다.
- 허용 범위를 넓히는 와일드카드(`**` 등)로 문제를 덮지 않는다.
- 비밀값·토큰은 이 문서에 적지 않는다.

## 실수로 지웠을 때

같은 값을 Redirect URLs에 **글자 그대로 다시 추가**하면 복구된다(위 블록에서 복사).
추가 후 해당 호스트에서 Google 로그인 → 앱 복귀를 한 번 확인한다.

## 변경 이력

- 2026-09-28: `read.bokdoong.com` 전용 Worker 전환과 함께 옛 주소
  `https://read.bokdoong.com/read-think-write/` 삭제.
