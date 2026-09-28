import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const functions = ['rtw-beta-status', 'rtw-delete-account'];
const allowedOrigins = [
  'https://read.bokdoong.com',
  'https://mj880616.github.io',
  'https://read-test.bokdoong.com'
];

function loadHandler(name) {
  const path = new URL(`../supabase/functions/${name}/index.ts`, import.meta.url);
  const source = fs.readFileSync(path, 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/Deno\.env\.get\(([^)]*)\)!/g, 'Deno.env.get($1)')
    .replace(/: string \| null|: unknown|: Request/g, '');

  let handler;
  vm.runInNewContext(source, {
    Deno: { env: { get: () => 'test-value' }, serve: (fn) => { handler = fn; } },
    createClient: () => ({}),
    deletionErrorBody: () => ({ status: 500, body: { error: 'test-error' } }),
    runAccountDeletion: async () => ({ deleted: true }),
    Request,
    Response,
    console
  }, { filename: path.pathname });
  assert.equal(typeof handler, 'function');
  return handler;
}

for (const name of functions) {
  test(`${name} allows the three exact origins on preflight`, async () => {
    const handler = loadHandler(name);
    for (const origin of allowedOrigins) {
      const response = await handler(new Request('https://example.test', {
        method: 'OPTIONS', headers: { Origin: origin }
      }));
      assert.equal(response.status, 200, origin);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    }
  });

  test(`${name} rejects an unlisted origin before account handling`, async () => {
    const handler = loadHandler(name);
    for (const origin of ['https://other.example', 'https://read-test.bokdoong.com/']) {
      const response = await handler(new Request('https://example.test', {
        method: 'POST', headers: { Origin: origin }
      }));
      assert.equal(response.status, 403, origin);
      assert.deepEqual(await response.json(), { error: 'origin_not_allowed' });
      assert.notEqual(response.headers.get('Access-Control-Allow-Origin'), origin);
    }
  });
}
