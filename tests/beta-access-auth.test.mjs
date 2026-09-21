import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');

assert.match(api, /waitForAccessToken/);
assert.match(api, /supabase\.auth\.getSession\(\)/);
assert.match(api, /Authorization:\s*`Bearer \$\{token\}`/);
assert.match(api, /\/functions\/v1\/rtw-beta-status/);
assert.match(api, /apikey:\s*SUPABASE_PUBLISHABLE_KEY/);

console.log('beta access Edge Function uses explicit authenticated token');
