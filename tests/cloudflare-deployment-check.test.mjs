import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../cloudflare/verify-deployment.mjs', import.meta.url));
const mockFetch = `
const suffix = process.env.MOCK_ASSET_SUFFIX || '';
globalThis.fetch = async (input) => {
  const url = new URL(input);
  const origin = url.origin;
  const reply = (status, headers = {}, body = '') => ({
    status,
    headers: new Headers(headers),
    url: url.href,
    text: async () => body
  });
  if (url.pathname === '/') {
    return reply(302, { Location: origin + '/read-think-write/' });
  }
  if (url.pathname === '/notes/') {
    const recovery = new URL('/read-think-write/', origin);
    recovery.searchParams.set('redirect', url.pathname + url.search);
    return reply(302, { Location: recovery.href });
  }
  if (url.pathname === '/read-think-write/') {
    return reply(200, {}, '<link rel="stylesheet" href="/read-think-write/styles' + suffix + '.css"><script type="module" src="/read-think-write/src/app-entry' + suffix + '.js"></script>');
  }
  if (url.pathname === '/read-think-write/styles' + suffix + '.css') {
    return reply(200, { 'Content-Type': 'text/css' });
  }
  if (url.pathname === '/read-think-write/src/app-entry' + suffix + '.js') {
    return reply(200, { 'Content-Type': 'application/javascript' });
  }
  if (url.pathname.endsWith('/__missing-rtw-worker-check__.js')) {
    return reply(404);
  }
  throw new Error('Unexpected verification URL: ' + url.href);
};
`;

function verify(env = {}) {
  return spawnSync(process.execPath, [
    '--import', `data:text/javascript,${encodeURIComponent(mockFetch)}`,
    script
  ], { encoding: 'utf8', timeout: 10_000, env: { ...process.env, ...env } });
}

function assertAllOk(result) {
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  for (const origin of ['https://read-test.bokdoong.com', 'https://read.bokdoong.com']) {
    assert.ok(result.stdout.includes(`OK ${origin}: root, app shell, CSS, JavaScript, missing assets, document recovery`));
  }
}

// Worker workflow: no expected version.
assertAllOk(verify());

// Pages workflow: the live app shell must reference this commit's fingerprinted assets.
assertAllOk(verify({ MOCK_ASSET_SUFFIX: '.0123456789ab', EXPECT_ASSET_VERSION: '0123456789ab' }));
const stale = verify({ MOCK_ASSET_SUFFIX: '.ffffffffffff', EXPECT_ASSET_VERSION: '0123456789ab', VERIFY_ATTEMPTS: '1' });
assert.notEqual(stale.status, 0, 'stale app shell must fail the post-deploy check');
assert.match(stale.stderr, /not version 0123456789ab yet/);
