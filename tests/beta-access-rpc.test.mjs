import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(api, /supabase\.rpc\('rtw_beta_access_status'\)/);
assert.match(api, /Promise\.race\(\[request, timeout\]\)/);
assert.match(api, /8000/);
assert.match(main, /이용 권한을 확인하지 못했습니다/);
assert.match(main, /retry-beta-access/);

console.log('beta access RPC contract ok');
