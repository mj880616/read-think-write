# 원본 없던 Edge Function 3개 원본 확보 (2026-09-26)

- 작업: Web2 저장소 원장 ENV-6b. 전체 판정표와 방법은 work 저장소 `docs/web2-env6b-edge-source.md`.
- production에서 `supabase functions download <이름> --use-api`로 내려받은 배포 코드를 그대로 넣었다(바이트 동일). 배포·삭제는 하지 않았다.
- 비밀값 검사: 세 파일 모두 키·토큰·비밀번호가 박혀 있지 않다. 키는 `Deno.env.get`으로만 읽는다.

## verify_jwt 기록

저장소에 `config.toml`이 없으므로 배포할 때 아래 값을 그대로 유지한다. `false`면 `--no-verify-jwt`를 붙인다. 시각은 KST, 2026-09-26 `functions list` 기준.

| 이름 | 버전 | 마지막 배포 | verify_jwt | 판정 | SHA-256(앞 16자) |
| --- | --- | --- | --- | --- | --- |
| `rtw-beta-status` | v1 | 09-21 13:35 | false | 유지. `src/api.js`가 부름(함수 코드에서 로그인 확인) | `a95ecbe3f936a503` |
| `rtw-owner-claim` | v3 | 09-18 21:57 | false | 삭제 목록. `rtw-claim-personal-owner`로 대체, 호출 없음 | `74fcc8598ef940b1` |
| `rtw-owner-setup` | v4 | 09-17 20:44 | false | 삭제 목록. 종료 응답(410)만 돌려줌, 호출 없음 | `8834e58cde6cdb8b` |

- 삭제는 Web2 원장 ENV-6c에서 사용자가 대시보드에서 한다. 되돌리려면 이 원본을 같은 이름, 위 verify_jwt 값으로 재배포한다.
- 참고: `rtw-owner-claim`이 9/17~18에 약 1,540회 집중 호출됐다(9/18 22:17 이후 0회). 당시 화면의 반복 호출로 보인다(추정).
