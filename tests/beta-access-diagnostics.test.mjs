import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');

assert.match(api, /권한 확인 실패 \[HTTP \$\{response\.status\}\]/);
assert.match(api, /const raw = await response\.text\(\)/);
assert.match(main, /build ' \+ esc\(APP_BUILD\)/);
assert.match(config, /APP_BUILD/);

console.log('beta access diagnostics visible');
