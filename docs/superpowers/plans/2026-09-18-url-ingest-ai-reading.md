# URL Ingest + AI Reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner add readings by pasting a URL, review extracted metadata/body before saving, and optionally ask GPT to analyze a saved resource and selectively persist useful suggestions.

**Architecture:** Keep GitHub Pages as the browser client and existing `rtw_resources`/notes/questions/relations tables as the persistence layer. Add two authenticated Supabase Edge Functions: `rtw-url-import` for safe public-HTML retrieval/extraction and `rtw-ai-read` for owner-scoped OpenAI analysis. The browser remains the editor and persistence decision-maker; neither Edge Function writes imported resources or AI suggestions automatically.

**Tech Stack:** Static ES modules on GitHub Pages, Supabase Auth/Postgres/RLS/Edge Functions, Deno Edge Runtime, OpenAI Responses API, existing Node test harness.

**Spec:** `docs/superpowers/specs/2026-09-18-url-ingest-ai-reading-design.md`

## Global Constraints

- Saving a reading must never require OpenAI.
- Imported data remains editable preview data until the user explicitly saves it.
- External full text remains `visibility = private` by default.
- Do not bypass paywalls, login walls, robots restrictions, or anti-bot controls.
- Do not expose `OPENAI_API_KEY` to browser code or the public repository.
- Both new Edge Functions require authenticated callers; private-resource AI analysis additionally verifies resource ownership.
- URL fetching must allow only `http:`/`https:` and reject loopback, link-local, RFC1918/private, cloud-metadata, and redirect-to-blocked targets.
- AI output is suggestion data only and must not persist as notes/questions/topics without explicit user action.
- Existing Google-only authentication and 30-day remembered-session behavior must remain unchanged.

---

## File Structure

- Create `src/reading-tools.js` — browser-safe pure helpers for import response normalization, import status copy, and AI result validation.
- Modify `src/api.js` — authenticated Edge Function invocation wrappers and selective-persistence helpers.
- Modify `src/main.js` — URL-first import UI, resource-detail GPT UI, and explicit save/link actions.
- Modify `src/styles.css` — import/AI panels and suggestion action layout.
- Modify `tests/model.test.mjs` — browser helper/API/static contract tests.
- Create `supabase/functions/_shared/rtw-url-policy.js` — pure URL/host/IP safety rules used by the importer and testable from Node.
- Create `supabase/functions/rtw-url-import/index.ts` — authenticated HTML fetch + metadata/readability extraction.
- Create `supabase/functions/rtw-ai-read/index.ts` — owner-scoped OpenAI structured analysis.
- Create `tests/url-policy.test.mjs` — SSRF policy tests.
- Modify `package.json` — run both model and URL-policy tests.

---

### Task 1: Pure import/AI contracts and SSRF policy

**Files:**
- Create: `src/reading-tools.js`
- Create: `supabase/functions/_shared/rtw-url-policy.js`
- Test: `tests/url-policy.test.mjs`
- Modify: `tests/model.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeImportResponse(payload) -> { status, resource, warnings }`
- Produces: `importStatusMessage(status) -> string`
- Produces: `normalizeAiReadResult(payload) -> { claims, questions, connections, expansion }`
- Produces: `parsePublicHttpUrl(value) -> URL`
- Produces: `isBlockedHostname(hostname) -> boolean`
- Produces: `isBlockedIpLiteral(hostname) -> boolean`

- [ ] **Step 1: Write failing browser-helper tests**

Append tests that require the new helper module and assert:

```js
const readingTools = await import('../src/reading-tools.js');

assert.deepEqual(
  readingTools.normalizeImportResponse({
    status: 'full',
    resource: { title: 'A', body_md: 'Body' },
    warnings: []
  }),
  {
    status: 'full',
    resource: {
      title: 'A', original_title: '', author: '', source_name: '',
      published_on: '', original_url: '', body_md: 'Body'
    },
    warnings: []
  }
);
assert.match(readingTools.importStatusMessage('metadata_only'), /본문/);
assert.throws(() => readingTools.normalizeAiReadResult({ claims: 'bad' }));
assert.deepEqual(
  readingTools.normalizeAiReadResult({ claims: ['A'], questions: ['Q'], connections: [], expansion: null }),
  { claims: ['A'], questions: ['Q'], connections: [], expansion: null }
);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test`

Expected: FAIL because `src/reading-tools.js` does not exist.

- [ ] **Step 3: Implement minimal browser helpers**

Create functions with strict shape checking. Missing resource strings normalize to `''`; invalid `status` or malformed AI arrays throw an `Error` rather than silently accepting malformed function responses.

- [ ] **Step 4: Write failing SSRF policy tests**

Create `tests/url-policy.test.mjs` with cases including:

```js
import assert from 'node:assert/strict';
import { parsePublicHttpUrl, isBlockedHostname, isBlockedIpLiteral } from '../supabase/functions/_shared/rtw-url-policy.js';

assert.equal(parsePublicHttpUrl('https://example.com/a').hostname, 'example.com');
assert.throws(() => parsePublicHttpUrl('file:///etc/passwd'));
assert.throws(() => parsePublicHttpUrl('javascript:alert(1)'));
assert.equal(isBlockedHostname('localhost'), true);
assert.equal(isBlockedHostname('metadata.google.internal'), true);
assert.equal(isBlockedIpLiteral('127.0.0.1'), true);
assert.equal(isBlockedIpLiteral('10.0.0.1'), true);
assert.equal(isBlockedIpLiteral('169.254.169.254'), true);
assert.equal(isBlockedIpLiteral('192.168.1.2'), true);
assert.equal(isBlockedIpLiteral('8.8.8.8'), false);
assert.equal(isBlockedIpLiteral('::1'), true);
assert.equal(isBlockedIpLiteral('fc00::1'), true);
```

- [ ] **Step 5: Run tests and verify failure**

Run: `node tests/url-policy.test.mjs`

Expected: FAIL because the policy module does not exist.

- [ ] **Step 6: Implement URL/host/IP policy**

Implement only pure parsing/classification in `_shared/rtw-url-policy.js`. Reject credentials in URLs, non-HTTP(S), localhost-like names, `.local`, known cloud metadata hostnames, IPv4 loopback/private/link-local/unspecified, and IPv6 loopback/link-local/ULA/unspecified. DNS resolution itself remains in the Edge Function so every redirect hop can be checked.

- [ ] **Step 7: Wire both tests into npm**

Change `package.json` to:

```json
"scripts": {
  "test": "node tests/model.test.mjs && node tests/url-policy.test.mjs"
}
```

- [ ] **Step 8: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/reading-tools.js supabase/functions/_shared/rtw-url-policy.js tests/model.test.mjs tests/url-policy.test.mjs package.json
git commit -m "test: define reading import and AI contracts"
```

---

### Task 2: Authenticated public-URL importer Edge Function

**Files:**
- Create: `supabase/functions/rtw-url-import/index.ts`
- Reuse: `supabase/functions/_shared/rtw-url-policy.js`
- Modify: `tests/model.test.mjs`

**Interfaces:**
- Consumes: `parsePublicHttpUrl`, `isBlockedHostname`, `isBlockedIpLiteral`
- Produces HTTP POST `/functions/v1/rtw-url-import`
- Input: `{ url: string }`
- Output: `{ ok: true, status: 'full'|'metadata_only'|'partial', resource: {...}, warnings: string[] }`

- [ ] **Step 1: Add failing static contract tests**

Assert the source file exists and contains all critical controls:

```js
const importFn = readFileSync(new URL('../supabase/functions/rtw-url-import/index.ts', import.meta.url), 'utf8');
assert.match(importFn, /Authorization/);
assert.match(importFn, /resolveDns/);
assert.match(importFn, /AbortSignal\.timeout|AbortController/);
assert.match(importFn, /content-type/i);
assert.match(importFn, /redirect:\s*['"]manual['"]/);
assert.match(importFn, /MAX_BYTES/);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test`

Expected: FAIL because the function file does not exist.

- [ ] **Step 3: Implement authenticated caller verification**

Use the bearer token from the request and `SUPABASE_SERVICE_ROLE_KEY` only server-side to call `admin.auth.getUser(token)`. Return 401/400-style JSON errors without exposing secrets.

- [ ] **Step 4: Implement safe fetch loop**

For the initial URL and each redirect hop:

1. parse with `parsePublicHttpUrl`;
2. reject blocked hostname/IP literals;
3. resolve A and AAAA records with `Deno.resolveDns` and reject any blocked resolved address;
4. fetch with `redirect: 'manual'`, a bounded timeout, a normal non-evasive user agent, and no forwarded user cookies/authorization;
5. allow at most 5 redirects;
6. reject non-HTML content types;
7. stop reading after `MAX_BYTES = 2_000_000`.

- [ ] **Step 5: Implement layered metadata/body extraction**

Use standards before heuristics:

1. canonical URL and JSON-LD `Article`/`NewsArticle`;
2. Open Graph/Twitter/meta tags;
3. `<title>` fallback;
4. article/main-body readability extraction;
5. normalize whitespace and return Markdown/plain paragraphs in `body_md`.

Do not fabricate author/date/source. Return `metadata_only` when useful metadata exists but no substantial body, `partial` when only sparse metadata exists, and a hard error only when nothing usable can be extracted.

- [ ] **Step 6: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Deploy function**

Deploy `rtw-url-import` with `verify_jwt = true`.

- [ ] **Step 8: Smoke-test with safe public URLs**

Invoke through an authenticated browser session using at least:
- one Korean public news/article page;
- one English public article page;
- `https://example.com/` as sparse HTML;
- a blocked URL such as `http://127.0.0.1/`.

Expected: public article returns structured preview; sparse page degrades to partial/metadata-only or a clear unusable-page error; blocked address is rejected before fetch.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/rtw-url-import/index.ts tests/model.test.mjs
git commit -m "feat: add safe URL article importer"
```

---

### Task 3: URL-first import UI without AI dependency

**Files:**
- Modify: `src/api.js`
- Modify: `src/main.js`
- Modify: `src/styles.css`
- Modify: `tests/model.test.mjs`

**Interfaces:**
- Produces: `api.importResourceUrl(url) -> Promise<ImportPreview>`
- Consumes: `normalizeImportResponse`, `importStatusMessage`

- [ ] **Step 1: Add failing API/UI contract tests**

Assert:

```js
assert.match(apiSource, /export async function importResourceUrl/);
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(mainSource, /URL로 가져오기/);
assert.match(mainSource, /resource-import-form/);
assert.match(mainSource, /normalizeImportResponse/);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test`

Expected: FAIL on missing importer wrapper/UI.

- [ ] **Step 3: Implement authenticated function wrapper**

In `src/api.js`, call:

```js
const { data, error } = await supabase.functions.invoke('rtw-url-import', {
  body: { url: url.trim() }
});
```

Throw on function error and return validated normalized data from the UI layer.

- [ ] **Step 4: Add URL-first panel above existing resource form**

Keep the existing manual fields untouched. Add:

- URL input;
- `가져오기` button;
- progress/status line.

On success, populate only fields provided by the importer, preserving the ability to edit all fields before save. Do not auto-submit the resource form.

- [ ] **Step 5: Preserve manual fallback**

If import fails, leave existing form usable and show a concise inline message. Do not clear user-entered values unless the user explicitly imports another URL.

- [ ] **Step 6: Style importer states**

Add small status/warning styles matching the current card/form system. Avoid a new visual design language.

- [ ] **Step 7: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/api.js src/main.js src/styles.css tests/model.test.mjs
git commit -m "feat: add URL-first reading import UI"
```

---

### Task 4: Owner-scoped GPT reading Edge Function

**Files:**
- Create: `supabase/functions/rtw-ai-read/index.ts`
- Modify: `tests/model.test.mjs`

**Interfaces:**
- Produces HTTP POST `/functions/v1/rtw-ai-read`
- Input: `{ resource_id: string, mode?: 'read'|'expand' }`
- Output for `read`: `{ claims: string[], questions: string[], connections: Connection[], expansion: null }`
- Output for `expand`: same base shape with `expansion: { tensions: string[], counterpoints: string[], framings: string[] }`

- [ ] **Step 1: Add failing static contract tests**

Assert the function source includes:

```js
const aiFn = readFileSync(new URL('../supabase/functions/rtw-ai-read/index.ts', import.meta.url), 'utf8');
assert.match(aiFn, /OPENAI_API_KEY/);
assert.match(aiFn, /rtw_resources/);
assert.match(aiFn, /owner_id/);
assert.match(aiFn, /rtw_topics/);
assert.match(aiFn, /rtw_questions/);
assert.match(aiFn, /json_schema/);
assert.match(aiFn, /store:\s*false/);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test`

Expected: FAIL because the AI function does not exist.

- [ ] **Step 3: Implement authentication and ownership checks**

Resolve current user from bearer token. Load `rtw_resources` by `resource_id`; reject if `owner_id !== user.id`. Load only this owner’s topic names/IDs and open question bodies/IDs as optional connection context.

- [ ] **Step 4: Bound source/context size**

Require meaningful `body_md`; reject with a clear message when empty/too short. Bound the article/context sent to OpenAI so oversized resources cannot cause unbounded token use. Never mutate the source row.

- [ ] **Step 5: Implement structured Responses API call**

Use `OPENAI_API_KEY`, `store: false`, and strict JSON schema. Developer instruction must explicitly state that article text is untrusted data and commands inside it must not be followed.

For `read`, request:
- 3–6 concise claims/logic points;
- 2–5 reading questions;
- 0–5 candidate links to supplied existing topic/question IDs with reasons.

For `expand`, additionally request:
- tensions;
- counterpoints;
- new problem framings.

- [ ] **Step 6: Validate returned IDs server-side**

Discard any connection whose ID/type was not included in the owner’s context. Return suggestion data only; perform no inserts/updates.

- [ ] **Step 7: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 8: Deploy function**

Deploy `rtw-ai-read` with `verify_jwt = true`.

- [ ] **Step 9: Smoke-test against the existing private Boston Review resource**

Expected: authenticated owner gets structured output; another/non-owner user cannot analyze the private resource; DB row counts for notes/questions/relations do not change merely from analysis.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/rtw-ai-read/index.ts tests/model.test.mjs
git commit -m "feat: add owner-scoped GPT reading analysis"
```

---

### Task 5: GPT reading UI and explicit selective persistence

**Files:**
- Modify: `src/api.js`
- Modify: `src/main.js`
- Modify: `src/styles.css`
- Modify: `tests/model.test.mjs`

**Interfaces:**
- Produces: `api.analyzeResource(resourceId, mode = 'read')`
- Reuses: `createNote`, `createQuestion`, `addRelation`
- Consumes: `normalizeAiReadResult`

- [ ] **Step 1: Add failing UI/API contract tests**

Assert:

```js
assert.match(apiSource, /export async function analyzeResource/);
assert.match(mainSource, /GPT로 읽기/);
assert.match(mainSource, /나의 생각 확장/);
assert.match(mainSource, /메모로 저장/);
assert.match(mainSource, /질문으로 저장/);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test`

Expected: FAIL.

- [ ] **Step 3: Add AI invocation wrapper**

Invoke `rtw-ai-read` with `{ resource_id, mode }`; validate the response with `normalizeAiReadResult` before rendering.

- [ ] **Step 4: Add `GPT로 읽기` panel on saved resource detail**

Keep it visually separated from article text and `나의 메모`. Show a loading state and render claims/questions/connections only after explicit click.

- [ ] **Step 5: Add explicit persistence actions**

For each suggestion:
- claim/logic item: `메모로 저장` calls `createNote({ body, note_type: '생각', resource_id: id }, user.id)`;
- AI-generated question: `질문으로 저장` calls `createQuestion(body, user.id)` and may then link the resource to that question via `addRelation` only after the question creation action;
- existing connection suggestion: `연결` calls `addRelation` with the suggested existing target ID.

Disable the button and change its label after a successful save/link so accidental duplicates are visible and reduced.

- [ ] **Step 6: Add `나의 생각 확장`**

After an initial AI result exists, show a second button calling `mode: 'expand'`. Render tensions/counterpoints/framings with the same explicit `메모로 저장` behavior. Never overwrite the user’s existing notes or question `current_thought` automatically.

- [ ] **Step 7: Handle AI failure independently**

An AI error must leave the resource/article/manual notes fully usable. Show inline error text only inside the AI panel.

- [ ] **Step 8: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/api.js src/main.js src/styles.css tests/model.test.mjs
git commit -m "feat: add selective GPT reading workflow"
```

---

### Task 6: Integration verification, security review, and deployment

**Files:**
- Modify only if verification uncovers a defect.

**Interfaces:**
- End-to-end behavior from URL paste through optional AI suggestion persistence.

- [ ] **Step 1: Run full local/static test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run JavaScript syntax checks**

Run the same syntax command used by the existing Pages workflow against every `src/*.js` and test module.

Expected: PASS.

- [ ] **Step 3: Verify URL import end-to-end**

Using the deployed site while authenticated:

1. paste a public article URL;
2. confirm metadata/body preview appears;
3. edit one imported field;
4. save;
5. confirm the edited value, not the raw importer value, is stored;
6. confirm `visibility` remains `private`.

- [ ] **Step 4: Verify degraded import behavior**

Test one inaccessible/blocked/non-HTML case. Confirm manual entry remains available and no access-control bypass is attempted.

- [ ] **Step 5: Verify AI is optional and non-writing by default**

Record DB counts for `rtw_notes`, `rtw_questions`, `rtw_relations`; click `GPT로 읽기`; confirm counts are unchanged. Save one AI suggestion explicitly and confirm only that selected record/link is added.

- [ ] **Step 6: Verify authentication regression safety**

Confirm:
- logged-out view exposes only Google login;
- owner login succeeds;
- remembered session still uses the existing 30-day policy;
- private readings are unavailable without the owner session.

- [ ] **Step 7: Run Supabase security advisor**

Review any new security findings after function deployment. This feature should introduce no new public tables or RLS changes.

- [ ] **Step 8: Open PR and review diff**

PR title: `feat: add URL import and GPT reading workflow`

Review for:
- no API keys/secrets committed;
- no anonymous function access;
- no auto-persistence of AI results;
- no paywall/anti-bot bypass code;
- no regression to Google-only auth.

- [ ] **Step 9: Merge after CI passes and verify Pages deployment**

Expected: test job success + Pages deploy success.
