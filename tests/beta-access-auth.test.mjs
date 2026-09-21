import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');

assert.match(api, /waitForAccessToken/);
assert.match(api, /supabase\.auth\.getSession\(\)/);
assert.match(api, /Authorization:\s*`Bearer \$\{token\}`/);
assert.match(api, /\/rest\/v1\/rtw_beta_access\?/);
assert.match(api, /apikey:\s*SUPABASE_PUBLISHABLE_KEY/);
assert.doesNotMatch(api, /rtw_beta_access_status/);

console.log('beta access direct query uses explicit authenticated token');
