import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(api, /권한 확인 실패 \[HTTP \$\{response\.status\}\]/);
assert.match(api, /const raw = await response\.text\(\)/);
const startupAccess = main.slice(main.indexOf('if (accessReadyUserId !== user.id)'), main.indexOf('if (!betaAccess?.active)', main.indexOf('if (accessReadyUserId !== user.id)')));
assert.match(startupAccess, /showStartupFailure\(error\.code === 'BETA_TIMEOUT'/);
assert.doesNotMatch(startupAccess, /error\.message/);

console.log('beta access diagnostics use safe codes');
