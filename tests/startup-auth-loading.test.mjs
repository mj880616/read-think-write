import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(main, /읽생기 여는 중…/);
assert.doesNotMatch(main, /이용 권한 확인 중…/);
assert.doesNotMatch(main, /인증 확인 중…/);

console.log('startup hides internal auth/access states');
