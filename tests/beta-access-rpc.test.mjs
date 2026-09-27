import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(api, /waitForAccessToken/);
assert.match(api, /supabase\.auth\.getSession\(\)/);
assert.match(api, /\/functions\/v1\/rtw-beta-status/);
assert.match(api, /Authorization:\s*`Bearer \$\{token\}`/);
assert.match(api, /apikey:\s*SUPABASE_PUBLISHABLE_KEY/);
assert.doesNotMatch(api, /rtw_beta_access_status/);
assert.match(api, /8000/);
assert.match(main, /BETA_TIMEOUT/);
assert.match(main, /BETA_ERROR/);

console.log('beta access Edge Function contract ok');
