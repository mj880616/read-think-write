# 읽고 생각하고 쓰기

개인 읽기·메모·질문·주제 아카이브. GitHub Pages 정적 프런트엔드와 Supabase Auth/Postgres를 사용한다.

## 개발/검증

정적 사이트이므로 별도 빌드가 필요 없다. 로컬 정적 서버로 열어 확인한다.

```bash
npm ci --ignore-scripts
npm test
python -m http.server 8000
```

Markdown 표의 모바일 레이아웃 검증은 Playwright Chromium을 설치한 뒤 `npm run test:markdown:browser`로 실행한다. 시스템 Chromium을 사용할 때는 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`에 실행 파일 경로를 지정한다.

## 배포

`main`에 병합하면 GitHub Actions가 테스트 후 저장소의 정적 파일을 GitHub Pages에 배포한다.

개인 자료와 메모는 GitHub 저장소에 저장하지 않고 Supabase RLS가 적용된 `rtw_*` 테이블에 저장한다.
