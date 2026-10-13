# 읽기·보관 본문 Mermaid 표시

기준: `2a069d114699ae5e0b734ed01c1fac9950b5f7b3` (`origin/main`).
브랜치: `feat/reading-mermaid-minimal`. Merge·배포는 이 작업에서 하지 않는다.

읽기 본문과 보관에서 펼친 본문만 Markdown 렌더러의 `mermaid: true` 옵션을 사용한다.
백틱으로 감싼 `mermaid` 코드 토큰에만 표시용 표식을 붙이고, 원시 HTML의 표식은 제거한다.
기록 화면·편집 화면, 저장 Markdown·API·DB·Edge Function은 변경하지 않는다.

## 로딩과 보안

- Mermaid **12.2.0**, jsDelivr의 배포 ESM 파일 경로를 고정한다.
- 해당 코드블록이 없으면 Mermaid CDN 요청을 하지 않는다. 보관에서는 본문을 펼칠 때 시작한다.
- `securityLevel: 'strict'`, `startOnLoad: false`, `htmlLabels: false`를 고정한다.
- `secure` 목록으로 보안 설정·HTML 라벨·테마·테마 CSS·텍스트/간선 제한의 본문 지시문 및 frontmatter 덮어쓰기를 막는다.
- 고정 밝은 테마와 흰 도식 표면을 사용해 어두운 배경에서도 글자와 선을 읽을 수 있게 한다.
- Mermaid 출력은 기존 **DOMPurify 3.2.6**으로 `USE_PROFILES: { svg: true }` 정화 후 SVG 이미지로 삽입한다. 이벤트 바인딩 결과는 사용하지 않는다.
- SVG의 접근성 제목·설명은 이미지 대체 텍스트에 반영한다.
- 불러오기·렌더·이미지 디코딩 각각 최대 20초, 원본 최대 50,000자, 최대 200간선이다.
- 문법·불러오기·시간 초과·이미지 오류 시 원본 코드블록을 유지하고 작은 안내를 표시한다. 안내는 CSS 생성 텍스트여서 책갈피 위치에 섞이지 않는다.
- 임시 렌더 공간은 성공·실패 때 제거하며, 화면 이탈 중 작업은 종료 또는 제한 시간 도달 후 제거한다. 늦게 끝난 작업은 도식을 삽입하지 않는다.

## 책갈피와 화면

성공한 코드블록은 숨기되 원본 텍스트 노드를 같은 위치에 유지한다. 정화된 SVG는 이미지로 표시하므로 도식의 라벨·스타일이 본문의 `textContent`와 Range 위치에 더해지지 않는다.
따라서 도식 표시 전·후, 실패 시에도 앞뒤 문장의 저장 위치와 문맥이 같다. 책갈피 이동 시에는 도식 디코딩·높이 확정 뒤에 해당 문장으로 한 번 더 이동해 긴 도식 뒤의 문장도 화면 안에 유지한다. 넓은 도식은 키보드 접근 가능한 가로 스크롤 영역에 표시하고 기존 모바일 탭 스와이프에서 제외하며 인쇄에서는 페이지 폭에 맞춰 SVG를 유지한다.

CSS 캐시 버전은 `20261013-reading-mermaid`로 `src/styles.css` 첫 줄과 `index.html`을 함께 올렸다.
JavaScript는 기존 Pages workflow가 모든 `src/*.js` 및 상대 import를 커밋 SHA 파일명으로 변환하므로 새 모듈도 같은 규칙을 따른다.

## 용량 실측

2026-10-13 Chromium에서 실제 고정 CDN 파일을 받아 첫 `flowchart LR`를 표시했다.
테스트의 curl `--compressed` `size_download` 합계를 전송 본문 크기로, 받은 파일의 바이트 합계를 압축 해제 크기로 기록한다. HTTP 헤더 및 기존 Markdown/DOMPurify 로딩은 제외한다. 초기 모듈 수는 정적 import 의존성 전체이며, 첫 도식 합계에는 추가 도식/레이아웃 모듈을 포함한다.

| 단계 | 파일 요청 수 | 전송 본문 | 압축 해제 |
| --- | ---: | ---: | ---: |
| Mermaid 초기 모듈 | 19 | 189,760 B (185.3 KiB) | 724,281 B (707.3 KiB) |
| 첫 flowchart 표시까지 합계 | 29 | 728,775 B (711.7 KiB) | 2,468,065 B (2.35 MiB) |

첫 flowchart SVG 자체는 11,931 B이며 data URL이므로 추가 HTTP 요청은 없다. 다른 도식 종류는 필요한 파서 모듈을 추가로 받는다. CDN 응답 압축과 도식 내용에 따라 실제 크기는 달라진다.

재현: `npm ci`, `npx playwright install chromium`, `npm run test:mermaid:browser`.
`MERMAID_REPORT_PATH`를 지정하면 요청별 크기의 JSON을 저장한다. 시스템 Chromium 사용 시 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`를 지정한다.

## 검증과 한계

단위 테스트는 지연 로딩·다른 코드 유지·SVG 정화·문법 오류·불러오기 실패·불러오기/렌더 시간 초과·늦은 완료·화면 이탈·앞뒤 중복 문장의 책갈피·원시 HTML/틸드 코드 유지·이미지 디코딩 오류를 검사한다.
실제 Chromium 테스트는 flowchart/pie/xychart-beta, 보안 설정을 바꾸는 지시문과 `<script>`/`onerror`/`javascript:` 라벨, 책갈피, 320/390/768/1280px의 스크롤·어두운 배경·인쇄 및 실패 복구를 검사한다. 실제 `main.js` 통합 검사에서는 앞뒤 문장 책갈피를 저장 버튼으로 저장·재방문해 위치와 스크롤을 확인하고 보관 펼치기의 지연 렌더를 검사한다(API는 로컬 대역). 기존 Markdown 회귀·전체 `npm test`도 실행한다. PR CI에서 Markdown·Mermaid 브라우저 검사를 실행하도록 추가했다.

남은 한계: 외부 CDN에 의존하고 첫 도식의 비용이 있다. 브라우저의 동기 파싱/레이아웃은 타이머로 강제 중단할 수 없다. 실패한 모듈 로딩은 페이지 재로딩 전까지 재시도하지 않는다. 도식 내부 코드의 기존 문장 책갈피는 숨겨진 원본에 위치하며, 도식 앞뒤 문장의 책갈피가 이번 검증 범위다. SVG 이미지이므로 Mermaid 클릭/상호작용은 제공하지 않는다. 실기기·다른 브라우저의 확인은 별도다.
