# 읽생기 전용 Worker 준비

`rtw-router.mjs`는 `work` 저장소 공용 Worker의 읽생기 호스트 처리만 옮긴 전용 소스다.
기준은 `work@ed96b682`이며, 이 저장소의 예전 `bokdoong-router.mjs` 사본은 운영 소스가
아니었고 #81의 경로 변환·SPA 복구가 공용 Worker와 달라 제거했다.

## 배포 경계

- Worker 이름: `rtw-router`. `cloudflare/wrangler.toml`에는 시험 호스트와 운영 호스트가
  모두 설정되어 있다. **이 설정을 배포하면 운영 호스트가 공용 Worker에서 이전된다.**
- 코드에서는 `read.bokdoong.com`과 시험 호스트를 동일하게 처리한다. 운영 호스트 연결은
  전환 절차에서만 변경한다.
- `.github/workflows/rtw-worker-deploy.yml`은 `workflow_dispatch`로만 실행된다.
  `main`에서 운영 호스트 이름을 확인 입력한 경우에만 실행되며, 배포 후 두 호스트의
  루트, 실제 CSS·JS, 없는 자원 404, 문서 경로 복구를 검사한다.
- `main` 병합 때 `pages.yml`의 `verify` 작업이 같은 `verify-deployment.mjs`로 두 호스트를
  다시 검사한다(`EXPECT_ASSET_VERSION`으로 이번 커밋 지문까지 확인, 최대 약 10분 재시도).
  실패해도 Pages 배포는 되돌려지지 않는다.
- 자동 배포는 없다. GitHub Pages가 해당 `main`의 정적 파일을 공개한 뒤 수동 실행한다.
  Worker 배포는 Custom Domain 연결을 바꾼다. Supabase 설정은 변경하지 않는다.

## 수동 배포 전에 준비할 값

GitHub Actions 비밀값의 **이름**:

- `RTW_CLOUDFLARE_API_TOKEN`
- `RTW_CLOUDFLARE_ACCOUNT_ID`

Cloudflare 토큰은 해당 계정과 `bokdoong.com` zone으로 범위를 제한한다. 최초 Worker
생성에는 Workers 제품 `Admin`과 해당 zone의 `Workers Routes Write`가 필요하다.
Worker와 Custom Domain 생성 이후에는 `rtw-router`에 한정한 `Editor`로 축소할 수 있다.
Custom Domain 변경을 계속 워크플로에서 관리하는 동안에는 zone의
`Workers Routes Write`도 유지한다. 토큰 값은 저장소에 넣지 않는다.

## 동작과 다음 단계

첫 커밋은 공용 Worker 읽생기 분기와 같은 동작으로 단독 배포 가능하다. 두 번째 커밋은
접두사 없는 GET 문서 경로만 `/read-think-write/?redirect=...`로 302 이동시킨다.
문서가 아닌 짧은 경로와 없는 자원은 404이고 짧은 경로에 HTML을 직접 보내지 않는다.

로그인 상태 실기기 검증 전에 Supabase Auth의 로그인 복귀 허용 주소와 두 Edge Function의
운영 설정을 별도로 확인한다. Worker 배포는 Supabase를 변경하지 않는다.
