import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(api, /waitForAccessToken/);
assert.match(api, /supabase\.auth\.getSession\(\)/);
assert.match(api, /\/rest\/v1\/rpc\/rtw_beta_access_status/);
assert.match(api, /Authorization:\s*`Bearer \$\{token\}`/);
assert.match(api, /apikey:\s*SUPABASE_PUBLISHABLE_KEY/);
assert.match(api, /8000/);
assert.match(main, /이용 권한을 확인하지 못했습니다/);
assert.match(main, /retry-beta-access/);

console.log('beta access authenticated RPC contract ok');
