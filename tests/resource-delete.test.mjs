import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(api, /export async function deleteResource\(id\)/);
assert.match(api, /supabase\.rpc\('rtw_delete_resource'/);
assert.match(main, /id="resource-delete"/);
assert.match(main, /api\.deleteResource\(id\)/);
assert.match(main, /메모와 책갈피도 함께 삭제됩니다/);
assert.match(main, /글쓰기 기록은 남고 원문 연결만 해제됩니다/);
assert.match(main, /history\.replaceState\(\{\}, '', href\('\/read\/'\)\)/);

console.log('Resource delete contract ok');
