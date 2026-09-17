import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as model from '../src/model.js';

const grouped = model.groupResourcesByMonth([
  { id: 'a', published_on: '2026-09-14' },
  { id: 'b', published_on: '2026-09-14' },
  { id: 'c', published_on: '2026-10-01' }
]);

assert.equal(grouped['2026']['09']['14'].length, 2);
assert.equal(grouped['2026']['10']['01'][0].id, 'c');
assert.equal(model.matchesQuery({ title: '기술노동자 권력의 부상과 몰락' }, '기술노동', ['title']), true);
assert.equal(model.matchesQuery({ title: '다른 글' }, '기술노동', ['title']), false);
assert.equal(model.safeHttpUrl('https://example.com/a'), 'https://example.com/a');
assert.equal(model.safeHttpUrl('javascript:alert(1)'), '');
assert.equal(model.safeHttpUrl('not a url'), '');

const now = Date.UTC(2026, 8, 17, 12, 0, 0);
const thirtyDaysLater = now + 30 * 24 * 60 * 60 * 1000;
assert.equal(typeof model.rememberLoginUntil, 'function', '30일 로그인 유지 만료시각 계산 함수가 있어야 한다');
assert.equal(model.rememberLoginUntil(now), thirtyDaysLater);
assert.equal(model.isRememberedLoginValid(String(thirtyDaysLater), now + 1), true);
assert.equal(model.isRememberedLoginValid(String(thirtyDaysLater), thirtyDaysLater), false);
assert.equal(model.isRememberedLoginValid('', now), false);
assert.equal(model.isRememberedLoginValid('not-a-number', now), false);

assert.equal(typeof model.isOAuthCallback, 'function', 'OAuth 콜백 감지 함수가 있어야 한다');
assert.equal(model.isOAuthCallback('?code=abc123'), true);
assert.equal(model.isOAuthCallback('?foo=bar'), false);
assert.equal(model.isOAuthCallback(''), false);

assert.deepEqual(model.enabledAuthProviders(), ['google'], '로그인 방식은 Google 하나만 노출해야 한다');
assert.equal(model.shouldUnlinkEmailIdentity([{ provider: 'email' }, { provider: 'google' }]), true);
assert.equal(model.shouldUnlinkEmailIdentity([{ provider: 'google' }]), false);
assert.equal(model.shouldUnlinkEmailIdentity([{ provider: 'email' }]), false);

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

const apiSource = readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
const importUiSource = readFileSync(new URL('../src/reading-import-ui.js', import.meta.url), 'utf8');
const authEnhanceSource = readFileSync(new URL('../src/auth-enhance.js', import.meta.url), 'utf8');
const importFn = readFileSync(new URL('../supabase/functions/rtw-url-import/index.ts', import.meta.url), 'utf8');

assert.equal(apiSource.includes('signInWithPassword'), false, '이메일/비밀번호 로그인 API를 제거해야 한다');
assert.equal(apiSource.includes('auth.signUp'), false, '이메일 회원가입 API를 제거해야 한다');
assert.equal(authEnhanceSource.includes('Google로 로그인'), true, 'Google 로그인 버튼은 유지해야 한다');
assert.equal(authEnhanceSource.includes('form?.remove()'), true, '기존 이메일/비밀번호 폼은 렌더 직후 제거해야 한다');
assert.equal(authEnhanceSource.includes('또는 이메일로 로그인'), false, '이메일 로그인 안내 문구를 제거해야 한다');

assert.match(importFn, /Authorization/);
assert.match(importFn, /resolveDns/);
assert.match(importFn, /AbortSignal\.timeout|AbortController/);
assert.match(importFn, /content-type/i);
assert.match(importFn, /redirect:\s*['"]manual['"]/);
assert.match(importFn, /MAX_BYTES/);

assert.match(apiSource, /export async function importResourceUrl/);
assert.match(importUiSource, /URL로 가져오기/);
assert.match(importUiSource, /resource-import-form/);
assert.match(importUiSource, /normalizeImportResponse/);
assert.match(importUiSource, /수동 입력은 그대로 사용할 수 있습니다/);

console.log('model tests passed');
