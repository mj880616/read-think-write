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

console.log('model tests passed');
