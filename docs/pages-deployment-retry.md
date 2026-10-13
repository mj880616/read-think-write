# Pages artifact 재시도 중복 보완

기준 main: `3aa47c8b5ac5a5a87ea47b379db3deb66497b269`.

2026-10-13 Pages 실행 `38421600537`의 첫 시도는 업로드 성공 직후 artifact 조회가 0건으로 실패했다. 이후 API에서 artifact가 확인됐으므로 조회 시점 문제 가능성이 있으나 원인은 확정하지 못했다.
실패 작업 재시도는 같은 이름 `github-pages`로 다시 업로드했고, 배포 action이 동일 이름 2개를 발견해 `Multiple artifacts named "github-pages"`로 거절했다.

## 변경

배포 job의 `PAGES_ARTIFACT_NAME`을 `github-pages-${{ github.run_id }}-${{ github.run_attempt }}`로 정의한다.
업로드의 `name`과 배포의 `artifact_name`은 모두 이 값만 사용한다.

예를 들어 같은 실행의 1차는 `github-pages-38421600537-1`, 2차는 `github-pages-38421600537-2`다. 이전 기본 이름·이전 시도의 artifact가 남아 있어도 현재 시도의 이름과 겹치지 않는다. 실행 ID가 달라져도 이름이 구분된다.

`push`의 main 배포 조건, 테스트 선행, `github-pages` environment, 기존 권한·action 버전·자산 SHA 생성·배포 후 custom domain 검증은 유지한다. 제품 코드·DB·Edge·Cloudflare 설정 변경은 없다. 기존 artifact는 삭제하지 않는다.

## 검증과 적용

- YAML 파싱·upload/deploy 연결 및 기존 배포 조건 비교.
- 현재 사용 중인 고정 deploy-pages 소스의 실제 metadata 선택 함수에 이전 기본 이름 중복과 1·2차 artifact 목록을 입력해, 각 시도의 업로드 ID 하나만 선택하는지 확인. 변경 전에는 중복 오류, 변경 후에는 두 시도 모두 통과했다.
- 전체 `npm test` 및 PR CI 확인.
- 실제 게시 성공은 보완 PR 병합 후 새 main push 실행의 deploy·verify 결과로 확인한다. PR 이벤트에서는 배포하지 않는다.

기존 실패 실행을 재시도하면 그 실행 당시의 이전 workflow를 다시 쓰므로 이 변경이 적용되지 않는다. 보완 PR 병합으로 만들어진 새 실행에서 재시도한다.
이 변경은 같은 이름 중복을 해결하며, 외부 artifact 서비스의 조회 0건·일시 장애까지 해결됐다고 주장하지 않는다. 새 이름에서도 0건 오류가 반복되면 해당 실행 로그를 기준으로 별도 진단한다.

되돌리기: 보완 커밋을 revert하는 PR로 workflow 이름 설정을 되돌린다. 제품 코드와 이미 만들어진 artifact는 영향받지 않는다.
