# URL ingest + AI reading design

Date: 2026-09-18

## Goal

Extend `읽고 생각하고 쓰기` so adding a reading does not require going through ChatGPT. The default flow becomes:

`URL 붙여넣기 → 메타정보/본문 자동 추출 → 사용자 확인·수정 → 저장 → 필요할 때 GPT로 읽기/생각 확장 → 원하는 결과만 메모·질문·주제로 저장`

The site remains usable without AI. AI is an optional thinking aid, not a required storage path.

## Scope

Phase 1 of this feature includes:

1. URL-based article import from the `읽기` page.
2. Automatic extraction of title, author, source, publication date, canonical/original URL, and readable body when publicly accessible.
3. Graceful fallback for paywalled, login-required, bot-blocked, or otherwise inaccessible pages.
4. User review/edit before saving.
5. A `GPT로 읽기` action on saved resources.
6. AI output that can be selectively saved as notes, questions, or topic links only after user action.

Not included in this iteration:

- bypassing paywalls, login walls, robots restrictions, or anti-bot controls;
- automatic public publishing of imported copyrighted text;
- automatic saving of AI output as if it were the user's own view;
- semantic search, embeddings, or automatic topic clustering;
- browser extensions or mobile share-sheet integration.

## Design principles

1. **Storage must not depend on AI.** A user can always paste a URL or enter content manually and save it without invoking OpenAI.
2. **The user remains the editor.** Imported metadata/body are drafts until the user presses save.
3. **AI suggestions are suggestions.** They never become notes/questions/topics without an explicit user action.
4. **Copyright-sensitive material stays private by default.** Imported external full text continues to use `visibility = private` unless the user explicitly changes policy later.
5. **No access-control bypass.** If a source cannot be fetched normally, the system stops at the accessible metadata and asks the user to paste text manually if desired.
6. **Secrets stay server-side.** The browser never receives the OpenAI API key.

## User experience

### 1. `읽기 → 새 자료`

The existing manual form stays available, but a URL-first import box is added above it.

Primary controls:

- URL input
- `가져오기` button
- import status message

On success, the existing resource form is prefilled with whatever could be extracted:

- 제목
- 원제, when meaningfully different and available
- 저자
- 출처
- 발표일
- 원문 링크
- 본문/번역문

The user can edit every field before saving.

### 2. Import states

The UI distinguishes four outcomes:

**Full import**
- metadata + body extracted
- message: `본문까지 가져왔습니다. 저장 전에 내용을 확인하세요.`

**Metadata-only import**
- title/source/date/etc. extracted, body unavailable
- message: `메타정보는 가져왔지만 본문은 자동으로 읽지 못했습니다. 필요한 경우 본문을 직접 붙여넣으세요.`

**Partial import**
- only some metadata extracted
- missing fields remain editable and blank
- no fabricated values

**Failed import**
- URL invalid, unsupported protocol, network failure, non-HTML content, oversized response, or unreadable page
- manual form remains usable

### 3. Saved resource detail

A `GPT로 읽기` button appears on the resource detail page.

The first-stage AI result focuses on reading support rather than exhaustive summary:

- 핵심 주장·논리
- 읽으며 남길 질문
- 기존 주제/질문과 연결될 후보

A second action, `나의 생각 확장`, asks AI for:

- 반론 또는 긴장 지점
- 다른 기록과의 연결
- 새롭게 발전시킬 문제의식

AI output is visually separated from the stored article and from user-authored notes.

### 4. Saving AI output

Each useful AI item can be selectively saved through explicit actions such as:

- `메모로 저장`
- `질문으로 저장`
- `기존 주제에 연결`

No bulk automatic persistence occurs by default.

## Architecture

### Browser

Existing static GitHub Pages app remains the client.

Responsibilities:

- accept URL;
- call authenticated Supabase Edge Functions;
- prefill resource form;
- show extraction quality/status;
- save user-reviewed resource through existing RLS-protected API;
- invoke AI only on user request;
- let the user selectively persist AI output.

The browser does not fetch arbitrary article pages directly because CORS and anti-bot behavior make that unreliable.

### Edge Function: `rtw-url-import`

New authenticated function with `verify_jwt = true`.

Input:

```json
{ "url": "https://example.com/article" }
```

Responsibilities:

1. Validate `http`/`https` URL only.
2. Resolve DNS/host safely and reject obvious local/private-network targets to reduce SSRF risk.
3. Fetch with bounded timeout, redirect count, response size, and HTML-only expectations.
4. Parse metadata from standard signals such as:
   - `<title>`
   - Open Graph
   - Twitter cards
   - JSON-LD (`Article`, `NewsArticle`, etc.)
   - canonical URL
   - author/date metadata
5. Extract the main readable article body from public HTML.
6. Return structured extraction status and fields.
7. Never attempt authentication, cookie replay, paywall bypass, headless-browser evasion, or anti-bot circumvention.

Suggested response shape:

```json
{
  "ok": true,
  "status": "full | metadata_only | partial",
  "resource": {
    "title": "...",
    "original_title": null,
    "author": "...",
    "source_name": "...",
    "published_on": "2026-09-18",
    "original_url": "https://...",
    "body_md": "..."
  },
  "warnings": []
}
```

No database write happens in this function. Import is preview-only until the user presses save.

### Edge Function: `rtw-ai-read`

New authenticated function with `verify_jwt = true`.

Uses the existing server-side `OPENAI_API_KEY` pattern already used elsewhere in the Supabase project.

Input contains either a resource ID or the resource payload needed for analysis. Preferred design is resource ID so the function retrieves the row server-side and verifies ownership.

Responsibilities:

1. Verify current authenticated user.
2. Load only a resource the user owns or is permitted to read.
3. Include existing RTW topics/questions as optional context for connection suggestions.
4. Call OpenAI Responses API with structured output.
5. Return suggestions only; do not write notes/questions/topics.
6. Bound article/context size and output size.

Suggested result:

```json
{
  "claims": ["..."],
  "questions": ["..."],
  "connections": [
    { "type": "topic", "id": "...", "reason": "..." }
  ],
  "expansion": null
}
```

A later `mode: "expand"` request can produce counterarguments, tensions, and new problem framings.

## Extraction strategy

Use server-side HTML parsing with layered fallbacks rather than relying on a single publisher-specific scraper.

Priority:

1. canonical/JSON-LD/Open Graph metadata;
2. semantic article/main DOM structure;
3. readability-style content extraction;
4. metadata-only fallback.

The system must not invent missing author/date/source fields. If conflicting metadata exists, prefer high-confidence structured metadata and surface a warning when ambiguity matters.

## Security

### Authentication

Both new Edge Functions require a valid Supabase JWT. The functions additionally verify that the caller is the RTW owner before operating on private resources.

### SSRF protections

`rtw-url-import` must reject or block:

- non-HTTP(S) schemes;
- localhost and loopback;
- link-local addresses;
- RFC1918/private IP ranges;
- cloud metadata endpoints;
- redirects that resolve to blocked targets.

Requests use strict timeout, response-size, and redirect limits.

### Prompt injection / untrusted content

Imported article text is data, not instruction. The AI developer prompt explicitly tells the model not to follow commands embedded in source content.

### Secrets

`OPENAI_API_KEY` remains in Supabase Edge Function environment only. No OpenAI secret is committed to the public GitHub repository or returned to the browser.

## Copyright and privacy

Imported external full text is stored as private user data by default. The feature does not create anonymous/public endpoints for full copyrighted text.

If a page is paywalled, login-restricted, blocked, or only partially available, the importer does not attempt to defeat those restrictions. The user may manually paste content they are entitled to use.

## Data model impact

No schema change is required for the minimum viable version because `rtw_resources` already stores all required fields.

Optional future fields such as extraction provenance, fetch timestamp, or AI analysis history are intentionally deferred until there is a clear use case.

AI output is not stored automatically. When selected by the user, it reuses existing `rtw_notes`, `rtw_questions`, and `rtw_relations` tables.

## Error handling

### URL import

- Invalid URL → inline validation error.
- Timeout/network error → clear retry/manual-entry message.
- Access restriction → metadata-only/partial state, not a hard failure when usable metadata exists.
- Unsupported content type → manual-entry fallback.
- Excessively large page → stop before memory/latency becomes unsafe.

### AI

- Missing article body → explain that there is not enough text and offer manual paste/edit first.
- OpenAI error/limit → stored reading remains unaffected.
- Malformed structured output → reject AI result and retry manually; never persist partial malformed data.

## Testing

### Unit-level

- URL validation and blocked-host rules.
- metadata normalization and date handling.
- extraction result classification (`full`, `metadata_only`, `partial`).
- AI structured-output validation.
- no automatic write behavior.

### Function-level

Fixtures for:

- ordinary public article;
- JSON-LD-heavy article;
- sparse HTML page;
- redirect;
- non-HTML URL;
- blocked/private address;
- simulated paywall/login response;
- oversized response.

### UI

- URL import pre-fills existing form.
- user edits survive and are what gets saved.
- import failure does not disable manual save.
- GPT button only operates on an authenticated saved resource.
- AI suggestions require explicit save/link actions.

## Rollout

1. Deploy `rtw-url-import` behind authenticated access.
2. Add URL-first importer UI while preserving current manual form.
3. Verify import behavior on a small set of Korean and English public publishers.
4. Deploy `rtw-ai-read`.
5. Add `GPT로 읽기` and selective-save actions.
6. Keep all existing manual workflows available as fallback.

## Success criteria

The feature is complete when:

- a user can add an ordinary public article by pasting only its URL and reviewing the extracted draft;
- inaccessible articles degrade gracefully to metadata/manual paste instead of failing the entire workflow;
- saving a resource never requires OpenAI;
- GPT analysis can be triggered only on demand;
- AI output is clearly distinguished from user-authored thought and persists only through explicit user action;
- no OpenAI secret is exposed client-side;
- imported external full text remains private by default;
- current Google-only authentication and 30-day session behavior continue to work unchanged.
