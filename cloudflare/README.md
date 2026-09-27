# 읽생기 전용 Worker 준비

`rtw-router.mjs`는 `work` 저장소 공용 Worker의 읽생기 호스트 처리만 옮긴 전용 소스다.
기준은 `work@ed96b682`이며, 이 저장소의 예전 `bokdoong-router.mjs` 사본은 운영 소스가
아니었고 #81의 경로 변환·SPA 복구가 공용 Worker와 달라 제거했다.

## 배포 경계

- Worker 이름: `rtw-router`. `cloudflare/wrangler.toml`의 Custom Domain은
  **`read-test.bokdoong.com` 하나뿐**이다.
- 코드에서는 `read.bokdoong.com`과 시험 호스트를 동일하게 처리한다. 운영 호스트 연결은
  별도 전환 단계에서만 설정한다. 현재 공용 Worker의 운영 주소를 이 설정에 추가하지 않는다.
- `.github/workflows/rtw-worker-deploy.yml`은 `workflow_dispatch`로만 실행된다.
  `main`에서만 실행되며, 배포 후 시험 호스트의 루트, 실제 CSS·JS, 없는 자원 404를 검사한다.
- 자동 배포는 없다. GitHub Pages가 해당 `main`의 정적 파일을 공개한 뒤 수동 실행한다.
  Worker 배포는 Supabase 설정이나 DNS/운영 주소 전환을 대신하지 않는다.

## 수동 배포 전에 준비할 값

GitHub Actions 비밀값의 **이름**:

- `RTW_CLOUDFLARE_API_TOKEN`
- `RTW_CLOUDFLARE_ACCOUNT_ID`

Cloudflare 토큰은 해당 계정과 `bokdoong.com` zone으로 범위를 제한한다. 최초 Worker
생성에는 Workers 제품 `Admin`과 해당 zone의 `Workers Routes Write`가 필요하다.
Worker와 Custom Domain 생성 이후에는 `rtw-router`에 한정한 `Editor`로 축소할 수 있다.
Custom Domain 변경을 계속 워크플로에서 관리하는 동안에는 zone의
`Workers Routes Write`도 유지한다. 토큰 값은 저장소에 넣지 않는다.

## 현재 범위

커밋 1은 공용 Worker 읽생기 분기와 같은 동작이다. 접두사 없는 문서 경로도 404이며,
이 상태 자체로 시험 주소에 배포 가능하다. 커밋 2에서 문서 새로고침 복구를 별도로 추가한다.
