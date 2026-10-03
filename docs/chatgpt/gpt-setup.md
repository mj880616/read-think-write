# 읽생기 전용 GPT와 Action 설정

이 문서는 `rtw-personal-write` 보강 코드를 사용자가 배포하고 읽생기 전용 GPT에 연결하는 순서다. 이 PR은 코드·명세·안내·테스트만 준비한다. PR 병합만으로 Supabase Edge Function은 배포되지 않는다. 이번 작업에서는 운영 호출, 글 등록, Supabase 로그인·비밀값 조회·변경·배포를 하지 않는다.

## 1. 연결 전 확인

- 프로젝트: `xmlkxfjeagycwttklxjw`.
- 서버: `https://xmlkxfjeagycwttklxjw.supabase.co/functions/v1`.
- 호출: `POST /rtw-personal-write`만 제공한다. 기존 `resource`·`note`·`question` 추가를 유지하며 수정·삭제·조회 API는 없다.
- 인증: `x-rtw-write-key`에 전용 `RTW_PERSONAL_WRITE_KEY`를 그대로 보낸다. `Bearer` 접두사는 붙이지 않는다. 키가 없거나 빈 값·공백뿐이면 거절한다.
- 소유자: 요청값이 아니라 `rtw_personal_mode`의 `id='owner'` 행에서 정한다. 이 키는 그 고정 소유자에게 쓸 수 있는 권한이다. 다른 사용자에게 GPT를 공유하지 않는다.
- 비밀값·환경변수 이름: `RTW_PERSONAL_WRITE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`. GPT에는 첫 번째 전용 키만 넣는다. service-role 키·Supabase 관리 토큰을 넣지 않는다.
- `verify_jwt=false`: 사용자 제공 운영 확인과 기존 `work`의 `docs/web2-env6b-edge-source.md` 기록을 참고했다. 이번 작업에서 운영 상태를 재조회하지 않았다. 배포 직전에 사용자가 현재 값을 다시 확인한다. `false`가 아니면 배포를 멈추고 차이를 보고한다.
- CORS 유지: Origin `https://mj880616.github.io`, Methods `POST,OPTIONS`, Headers `authorization, x-client-info, apikey, content-type`. `x-rtw-write-key`가 허용 헤더에 빠져 있다. 브라우저 직접 호출의 preflight에 문제가 될 수 있지만 이번 PR에서는 고치지 않는다. GPT에서의 실제 전송은 별도 확인 대상이다.

## 2. 입력과 응답

필수 필드는 `resource`의 `action,title`, `note`·`question`의 `action,body`다. 제목·내용은 공백만 있으면 거절한다. 선언되지 않은 필드, 객체·숫자 등 문자열이 아닌 입력은 400이다. 선택 필드는 생략하거나 null로 둘 수 있다. URL·날짜·UUID를 모르면 빈 문자열 대신 생략/null을 사용한다.

| 종류 | 필드 | 최대 문자 수 |
|---|---|---:|
| resource | title, original_title | 각각 500 |
| resource | author, source_name | 각각 300 |
| resource | original_url | 2,048 |
| resource | body_md | 60,000 |
| resource | published_on | 10 |
| note, question | body | 60,000 |
| note | note_type | 100 |
| question | current_thought | 60,000 |
| note, question | resource_id | 36 |

문자 수는 Unicode 코드 포인트 기준이며 공백을 제거하기 전 입력 길이에 적용한다. `published_on`은 유효한 실제 날짜의 `YYYY-MM-DD`, `original_url`은 유효한 http/https 주소, `resource_id`는 UUID 형식이어야 한다. URL은 저장만 하고 원문을 자동으로 가져오지 않는다.

`resource_id`가 있으면 `rtw_resources.id`와 고정 소유자 `owner_id`를 함께 조회한다. 외부 소유·미존재·조회 실패는 같은 `invalid_resource` 400으로 거절한다. `note`는 기존처럼 참조를 저장한다. **`question`은 소유 확인만 하고 참조를 저장하지 않는다.** 기존 질문 insert의 칼럼을 유지하기 위해 `resource_id` 칼럼을 새로 추가하지 않았다.

`note_type` 생략/null/빈 문자열은 기존처럼 `생각`으로 저장한다. API 상한 100자는 승인한 값이다. 저장소의 기존 DB check는 공백이 정리된 1~30자만 허용하므로 31~100자는 API 길이 검사를 통과해도 DB 저장 실패(500)가 될 수 있다. DB 제약을 바꾸지 않았으므로 GPT에는 30자 이내 분류를 사용하도록 한다.

글 성공 응답은 `ok`와 `resource.id`, `resource.title`만 포함한다. 메모·질문 성공 응답은 `ok`와 `note.id` 또는 `question.id`만 포함한다. 본문·소유자·키·DB 세부 정보는 반환하지 않는다. 400은 입력 오류, 401은 키 오류, 405는 메서드 오류, 500의 `write_failed`는 내부 실패다. 입력과 내부 오류를 그대로 로그에 남기지 않는다.

`published_on`은 발표일이고 `created_at`은 저장 시각이다. 함수는 `created_at`을 지정하거나 발표일로 덮어쓰지 않는다. “새 글” 표시는 저장 시각을 기준으로 하므로 과거 발표 글도 지금 추가하면 새 글로 표시될 수 있다.

## 3. 배포 전 운영본 내려받아 보관·대조

배포 로그인 전에 사용자가 Supabase Dashboard에서 프로젝트와 함수명을 확인한다. `rtw-personal-write` 함수 화면의 **Download**로 운영 소스를 내려받는다. Dashboard 다운로드 방식은 [공식 안내](https://supabase.com/docs/guides/functions/quickstart-dashboard#download-edge-functions)를 따른다. CLI 다운로드를 배포 worktree에서 실행하면 작업 소스를 덮어쓸 수 있으므로 사용하지 않는다.

다운로드한 운영본과 함수 버전·배포 시각·`verify_jwt` 기록은 저장소 밖 개인 백업 폴더에 보관한다. 백업에 포함된 파일 전체를 유지하고, 본 PR의 파일과 로컬 편집기에서 대조한다. 저장소 SHA와 운영 버전이 같다고 가정하지 않는다. 운영본에 예상 밖 변경이 있으면 배포 전에 멈춘다. 소스나 설정에 비밀값이 박혀 있으면 diff 출력·PR·보고에 복사하지 않는다. 이 백업은 키 값 백업이 아니다.

PowerShell에서 백업 폴더를 준비하는 예시다. 아래 코드는 사용자가 실행한다.

```powershell
$taskBackupRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) ('rtw-personal-write-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $taskBackupRoot | Out-Null
# Dashboard에서 내려받은 운영 소스 전체를 이 폴더에 풀어 보관한다.
```

운영본을 확보·대조하지 못했으면 아래 배포 단계로 진행하지 않는다. 백업 파일·관리 인증 정보는 Git에 추가하지 않는다.

## 4. 사용자가 PowerShell에서 이 함수만 배포

검토한 PR head SHA를 기록하고, 해당 코드와 CI 2건 통과를 확인한다. 이 PR은 merge하지 않는다. 승인된 PR 코드는 지정 worktree에서 배포할 수 있으며, 실제 배포는 별도 운영 승인 뒤 사용자가 실행한다.

작업 경로는 `C:\Users\mj880\read-think-write-gpt-write`, 브랜치는 `codex/gpt-write-hardening`이다. 관리 토큰은 CLI의 대화형 인증 칸에만 넣는다. `--token` 인자, 명령줄, `.env`, 로그, 채팅, 문서에 값을 적지 않는다. 로그인 세션을 새로 만들기 전에 기존 `SUPABASE_ACCESS_TOKEN` 환경변수가 있으면 값은 출력하지 말고 해제 여부를 확인한다. 기존 인증을 모르는 상태에서 배포하지 않는다.

```powershell
Set-Location -LiteralPath 'C:\Users\mj880\read-think-write-gpt-write'
if ((git branch --show-current) -ne 'codex/gpt-write-hardening') { throw '작업 브랜치가 다릅니다.' }
$taskApprovedSha = Read-Host '검토·승인한 PR head SHA 전체'
if ((git rev-parse HEAD) -ne $taskApprovedSha) { throw '승인한 코드와 현재 HEAD가 다릅니다.' }
if (git status --porcelain --untracked-files=all) { throw '미커밋·미추적 파일이 있습니다. 배포하지 않습니다.' }
if (Test-Path Env:SUPABASE_ACCESS_TOKEN) { throw '기존 관리 토큰 환경변수를 값 출력 없이 먼저 정리하세요.' }
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw '테스트 실패. 배포하지 않습니다.' }

try {
    npx.cmd supabase login
    if ($LASTEXITCODE -ne 0) { throw '로그인 실패.' }
    npx.cmd supabase functions list --project-ref xmlkxfjeagycwttklxjw
    if ($LASTEXITCODE -ne 0) { throw '운영 함수 상태 확인 실패.' }
    # rtw-personal-write 버전·배포 시각·verify_jwt=false를 수동으로 확인·기록한다.
    $taskConfirm = Read-Host '운영본 대조 완료, verify_jwt=false, 단일 함수 배포 승인: rtw-personal-write 입력'
    if ($taskConfirm -ne 'rtw-personal-write') { throw '배포 확인이 없습니다.' }
    if ((git rev-parse HEAD) -ne $taskApprovedSha) { throw '배포 직전 승인 SHA가 달라졌습니다.' }
    if (git status --porcelain --untracked-files=all) { throw '배포 직전 작업 폴더가 깨끗하지 않습니다.' }
    npx.cmd supabase functions deploy rtw-personal-write --project-ref xmlkxfjeagycwttklxjw --no-verify-jwt --use-api
    if ($LASTEXITCODE -ne 0) { throw '배포 실패. 재시도 전에 상태를 확인하세요.' }
    npx.cmd supabase functions list --project-ref xmlkxfjeagycwttklxjw
    if ($LASTEXITCODE -ne 0) { throw '배포 후 버전 확인 실패.' }
    # 대상 함수의 버전 증가·verify_jwt=false를 확인한다. 다른 함수는 배포하지 않는다.
}
finally {
    npx.cmd supabase logout
    # logout이 실패하면 로컬 인증 정리도 미완료다. 토큰 값은 출력하지 않는다.
    # 성공 여부와 관계없이 다음 단계에서 서버의 이번 관리 토큰을 반드시 삭제한다.
}
```

배포는 승인한 HEAD와 실제 파일이 모두 일치하는 깨끗한 작업 폴더에서만 한다. CLI가 만든 `supabase/.temp` 때문에 검사가 멈춰도 검사에서 임의로 제외하지 않는다. 생성 경로·내용이 CLI 임시 파일인지 확인하고 해당 임시 파일만 정리한 뒤 다시 확인한다. 사용자 변경을 지우거나 광범위한 git clean을 실행하지 않는다. 함수 이름과 `--no-verify-jwt`는 반드시 유지한다. `--prune`은 절대 쓰지 않는다. 함수명 없는 deploy, DB 명령, 다른 함수 배포는 이 절차에 없다. CLI 옵션은 [Supabase CLI 문서](https://supabase.com/docs/reference/cli/supabase-functions-deploy)를 따른다.

**로그아웃 뒤 서버 토큰도 삭제한다.** 사용자가 [Supabase 계정 토큰 관리](https://supabase.com/dashboard/account/tokens)에서 이번 로그인에 사용한 관리 토큰을 삭제·폐기한다. logout은 로컬 인증 제거이며 서버 토큰 폐기를 대신하지 않는다([CLI 공식 소스 안내](https://github.com/supabase/cli/blob/develop/apps/cli/docs/go-cli-reference.md#logout)). 이는 GPT 전용 쓰기 키를 삭제하는 단계와 다르다. 토큰 이름·폐기 여부만 기록하고 값은 남기지 않는다.

배포 뒤 함수가 살아 있는지, 오류 응답이 안전한지, 인증 헤더가 전달되는지는 사용자가 별도 승인한 검증에서 확인한다. **GPT의 Test 버튼과 등록 요청은 실제 insert를 일으킬 수 있다.** 이번 작업의 오프라인 테스트를 운영 글 등록 검증으로 보고하지 않는다. 응답 유실·시간 초과에는 이미 글이 생겼을 수 있으므로 자동 재시도하지 말고 웹에서 확인한다.

복구가 필요하면 사용자가 보관한 운영본을 별도 복구 폴더에서 같은 함수 이름·`--no-verify-jwt --use-api` 옵션으로 다시 배포하고, 로그아웃·서버 토큰 폐기를 반복한다. 기존 운영본으로 돌아가면 이번 보강도 사라진다는 점을 먼저 판단한다. **누출된 옛 쓰기 키는 복구하지 않는다.** 배포를 되돌려도 이미 추가된 글은 삭제되지 않는다.

## 5. 전용 키 교체와 누출 시 차단

함수 배포가 끝난 뒤 사용자가 충분히 긴 무작위 전용 키를 로컬의 안전한 생성기나 비밀번호 관리자에서 만든다. 다른 서비스 키를 재사용하지 않는다. 값은 문서·저장소·터미널 출력·채팅에 남기지 않는다.

1. Supabase Dashboard의 해당 프로젝트 Edge Functions 비밀값 설정에서 **`RTW_PERSONAL_WRITE_KEY`만** 새 값으로 교체한다. 키 값을 조회·출력하는 명령이나 값을 인자로 쓰는 예시는 제공하지 않는다.
2. 서버에 새 값이 반영된 것을 확인한 다음 GPT Action의 인증 설정에 같은 새 값을 넣고 저장한다. 그 사이에는 옛 키를 쓰는 GPT 요청이 실패할 수 있다. service-role 키나 소유자 행은 바꾸지 않는다.
3. 사용자 승인하에 키 없음·옛 키가 거절되는지 확인하고, 정상 추가 검증은 실제 글 생성임을 알고 따로 실행한다. 비밀값 반영 지연 가능성 때문에 저장 클릭만으로 옛 키 무효화를 검증했다고 보고하지 않는다.

키가 샜으면 **GPT보다 먼저 서버의 `RTW_PERSONAL_WRITE_KEY`를 새 무작위 값으로 교체한다.** 이 값을 GPT에 아직 넣지 않으면 기존 GPT와 누출된 옛 키의 새 요청을 차단한 상태를 유지할 수 있다. DB·코드·CORS·JWT 설정을 바꾸거나 Edge를 재배포할 필요 없이 비밀값 교체로 차단한다. 이미 승인된 처리 중 요청까지 취소되지는 않는다. 누출 경로를 정리한 뒤에만 GPT에 새 키를 넣는다.

## 6. 읽생기 전용 GPT 만들기

[OpenAI GPT Actions 시작 안내](https://developers.openai.com/api/docs/actions/getting-started)와 [인증 안내](https://developers.openai.com/api/docs/actions/authentication)를 참고한다. 실제 계정의 GPT 편집기 기능·메뉴는 연결할 때 확인한다.

1. ChatGPT의 GPT 만들기에서 새 GPT를 만들고 이름을 예를 들어 **읽생기 글 추가**로 정한다. 공유 범위는 나만 사용으로 둔다.
2. Configure/구성의 Instructions/지침에 아래 초안을 넣는다.
3. Actions/작업에서 새 Action을 만든다. `docs/chatgpt/rtw-personal-write.openapi.yaml`의 전체 내용을 Schema/스키마 칸에 붙여 넣는다. URL로 가져오려면 검토한 PR head SHA에 해당하는 파일의 원본 URL을 사용하며 키를 URL에 넣지 않는다.
4. 명세는 **YAML 1.2의 JSON 표기**로 작성돼 있다. OpenAPI 3.1.0 문서이며 JSON 파서로도 읽을 수 있다. 필드·필수 여부·상한은 `npm test`가 함수의 실행 검증 규칙과 대조한다.
5. Authentication/인증에서 **API Key**를 선택한다. Auth Type/인증 유형은 **Custom/사용자 지정**, Header Name/헤더 이름은 정확히 **`x-rtw-write-key`**, API Key/키 입력 칸에는 교체한 전용 키를 넣고 저장한다. 이 칸 외 지침·스키마·대화에는 키를 넣지 않는다.
6. 편집기가 사용자 지정 인증 헤더를 제공하는지 확인한다. OpenAI 공식 production 안내에는 일반 custom header 제한도 있으므로 **해당 계정 UI에서 Custom/API Key 헤더 설정을 사용할 수 없으면 연결을 멈추고 보고한다.** 임의의 일반 헤더 파라미터나 Authorization으로 바꾸어 해결하지 않는다([공식 production 제약](https://developers.openai.com/api/docs/actions/production)). 이번 PR은 편집기 가져오기·인증 전송을 실제 확인한 결과가 아니다.
7. `addPersonalItem` 하나만 표시되고 인증 헤더 이름이 맞는지 확인한다. 공개 공유, 실제 Test/등록은 따로 승인·검증하기 전 실행하지 않는다. `x-openai-isConsequential: true`로 등록 확인을 요구한다.

### GPT 지침 초안

```text
너는 읽생기의 개인 글 추가 도우미다. 사용자가 제공한 자료를 정리하고, 사용자가 등록을 요청하고 확인한 경우에만 Action으로 항목 하나를 추가한다.

기본 작업은 action=resource로 읽기 글 추가다. 기존 note·question 추가는 사용자가 명시적으로 요청한 경우에만 한다. 조회·수정·삭제는 할 수 없다. 수정·삭제 요청에는 읽생기 웹에서 직접 하도록 안내한다.

제목은 주제와 핵심을 구체적으로 드러내는 짧고 담백한 한국어로 짓는다. 사용자가 제목을 지정하면 유지한다. 원문 제목·저자·발행처는 확인한 정보만 넣고 모르면 생략한다. 본문에는 제공된 자료에 근거한 내용만 쓰고 사실을 지어내지 않는다. URL만 저장한다고 서버가 원문을 가져오는 것은 아니다.

published_on은 원문에서 확인한 실제 발표일을 YYYY-MM-DD로 넣는다. 등록일이나 오늘 날짜로 대신하지 않는다. 발표일을 모르면 생략/null로 둔다. created_at은 보내지 않는다.

길이 상한은 제목·원문 제목 500자, 저자·발행처 300자, URL 2048자, 본문·내용·현재 생각 60000자, 분류 100자, UUID 36자다. 기존 DB 제약 때문에 메모 분류는 공백을 정리한 1~30자를 사용한다. 긴 글은 임의로 잘라 등록하지 말고 사용자와 요약 범위를 정한다.

resource_id는 사용자가 제공한 UUID만 사용한다. 검색하거나 추측하지 않는다. note에서는 소유 확인 뒤 연결이 저장된다. question에서는 소유 확인만 하고 연결은 저장되지 않는다는 점을 알린다. 연결 저장이 필요하면 웹에서 처리하도록 안내한다.

owner_id·visibility·status·키 값을 요청 본문에 넣지 않는다. 키를 사용자에게 요구하거나 보여주지 않는다. 키는 Action 인증 설정에서만 관리한다.

등록 후 성공 응답의 id와 제목을 사용자에게 보고한다. 메모·질문 응답에는 제목이 없으므로 반환된 id와 종류만 보고하고 제목이나 본문을 응답에서 찾았다고 말하지 않는다. 성공 응답이 없으면 등록 성공이라고 말하지 않는다.

400은 입력을 확인하고 401은 인증 설정을 확인하도록 안내한다. 500·시간 초과·응답 유실은 이미 저장됐을 수 있으므로 자동 재시도하지 말고 사용자가 웹에서 확인하도록 안내한다. 상세 내부 정보나 키를 오류 설명에 넣지 않는다.
```

## 7. 코드 검증과 남은 확인

`npm.cmd test`는 운영에 접속하지 않는다. 실제 함수 소스를 Node에서 실행하고 외부 Supabase 경계만 대체해 빈 키 거절, 고정 길이 비교, 입력 길이·형식, 참조 소유권, 기존 insert 칼럼, 안전한 응답, CORS 유지, OpenAPI 일치를 확인한다. 명세 예시도 같은 오프라인 함수에서 검증한다.

두 PR CI는 `Read Think Write tests / test`, `Test and Deploy GitHub Pages / test`다. `.github/workflows`에는 Supabase Edge 자동 배포 단계가 없다. Pages는 main push에 사이트를 배포하며 RTW Worker 배포는 별도 수동 workflow다. 따라서 이 PR의 CI 통과·병합·Pages 성공은 Edge 운영 반영이나 GPT 연결 성공을 증명하지 않는다.

남은 확인은 운영본 대조, 사용자 단일 함수 배포, 서버 키 교체·옛 키 거절, 해당 계정의 GPT 명세 가져오기·Custom 헤더 전송, 승인한 실제 등록이다. DB·RLS·다른 함수·화면·CORS·verify_jwt는 이 작업에서 변경하지 않는다.
