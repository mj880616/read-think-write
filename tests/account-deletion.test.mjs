import assert from 'node:assert/strict';
import fs from 'node:fs';

const appEntry = fs.readFileSync(new URL('../src/app-entry.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../account-deletion.html', import.meta.url), 'utf8');
const edge = fs.readFileSync(new URL('../supabase/functions/rtw-delete-account/index.ts', import.meta.url), 'utf8');

assert.match(appEntry, /rtw_delete_account_pending_v1/);
assert.match(appEntry, /params\.get\('delete-account'\)/);
assert.match(main, /api\.deleteAccount\(\)/);
assert.match(api, /supabase\.functions\.invoke\('rtw-delete-account'/);
assert.match(main, /내 계정과 데이터 삭제/);
assert.match(main, /계정 삭제/);
assert.match(main, /href\('\/about\/\?delete-account=1'\)/);
assert.match(page, /계정 및 데이터 삭제 요청/);
assert.match(page, /\.\/\?delete-account=1/);
assert.match(edge, /https:\/\/read\.bokdoong\.com/);
assert.match(edge, /rtw_beta_access/);
assert.match(edge, /admin\.auth\.admin\.deleteUser\(uid\)/);
assert.ok(!edge.includes("for(const table of"));

console.log('Account deletion web and in-app flow ok');
