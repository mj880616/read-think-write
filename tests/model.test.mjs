import assert from 'node:assert/strict';
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

assert.equal(typeof model.validateSignupInput, 'function', '회원가입 입력 검증 함수가 있어야 한다');
assert.deepEqual(model.validateSignupInput('reader@example.com', '12345678', '12345678'), { ok: true, message: '' });
assert.equal(model.validateSignupInput('', '12345678', '12345678').ok, false);
assert.equal(model.validateSignupInput('reader@example.com', '1234', '1234').ok, false);
assert.equal(model.validateSignupInput('reader@example.com', '12345678', '87654321').ok, false);

const now = Date.UTC(2026, 8, 17, 12, 0, 0);
const thirtyDaysLater = now + 30 * 24 * 60 * 60 * 1000;
assert.equal(typeof model.rememberLoginUntil, 'function', '30일 로그인 유지 만료시각 계산 함수가 있어야 한다');
assert.equal(model.rememberLoginUntil(now), thirtyDaysLater);
assert.equal(model.isRememberedLoginValid(String(thirtyDaysLater), now + 1), true);
assert.equal(model.isRememberedLoginValid(String(thirtyDaysLater), thirtyDaysLater), false);
assert.equal(model.isRememberedLoginValid('', now), false);
assert.equal(model.isRememberedLoginValid('not-a-number', now), false);

assert.equal(typeof model.ownerSetupAccountAction, 'function', '기존 계정 초기설정 분기 함수가 있어야 한다');
assert.equal(model.ownerSetupAccountAction(false), 'create');
assert.equal(model.ownerSetupAccountAction(true), 'reset-existing');

console.log('model tests passed');
