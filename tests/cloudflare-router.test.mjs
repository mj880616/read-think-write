import assert from 'node:assert/strict';
import test from 'node:test';

import router from '../cloudflare/rtw-router.mjs';

const hosts = ['read.bokdoong.com', 'read-test.bokdoong.com'];
const originalFetch = globalThis.fetch;

async function withOrigin(originHandler, run) {
  const requests = [];
  globalThis.fetch = async (request, options) => {
    requests.push({ request, options });
    return originHandler(request);
  };
  try {
    await run(requests);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// Expectations from the read branch of work@ed96b682.
for (const host of hosts) {
  test(`${host}: root and HTTPS behavior match the shared Worker`, async () => {
    const root = await router.fetch(new Request(`https://${host}/?from=home`));
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('Location'), `https://${host}/read-think-write/?from=home`);
    const upgrade = await router.fetch(new Request(`http://${host}/read-think-write/`));
    assert.equal(upgrade.status, 301);
    assert.equal(upgrade.headers.get('Location'), `https://${host}/read-think-write/`);
  });

  test(`${host}: prefixed requests forward selected headers and preserve cache policy`, async () => {
    await withOrigin(
      () => new Response('asset', { status: 200, headers: { 'Content-Type': 'text/css', 'Cache-Control': 'max-age=900' } }),
      async (requests) => {
        const response = await router.fetch(new Request(`https://${host}/read-think-write/src/styles.css?v=1`, {
          headers: { Accept: 'text/css', 'Accept-Language': 'ko', 'If-None-Match': 'etag', Range: 'bytes=0-4', Cookie: 'private=1' }
        }));
        assert.equal(response.status, 200);
        assert.equal(await response.text(), 'asset');
        assert.equal(response.headers.get('Cache-Control'), 'no-cache, must-revalidate');
        assert.equal(requests.length, 1);
        const { request, options } = requests[0];
        assert.equal(request.url, 'https://mj880616.github.io/read-think-write/src/styles.css?v=1');
        assert.equal(request.method, 'GET');
        assert.equal(request.redirect, 'manual');
        assert.equal(request.cache, 'no-store');
        for (const [name, value] of [['Accept', 'text/css'], ['Accept-Language', 'ko'], ['If-None-Match', 'etag'], ['Range', 'bytes=0-4']]) {
          assert.equal(request.headers.get(name), value);
        }
        assert.equal(request.headers.get('Cookie'), null);
        assert.equal(options, undefined);
      }
    );
  });

  test(`${host}: favicon, methods, path boundary and origin 404 match the shared Worker`, async () => {
    const icon = await router.fetch(new Request(`https://${host}/favicon.ico`));
    assert.equal(icon.status, 200);
    assert.equal(icon.headers.get('Content-Type'), 'image/svg+xml; charset=utf-8');
    assert.equal(icon.headers.get('Cache-Control'), 'public, max-age=86400');
    assert.match(await icon.text(), /#315d50/);
    const iconHead = await router.fetch(new Request(`https://${host}/favicon.ico`, { method: 'HEAD' }));
    assert.equal(await iconHead.text(), '');
    const post = await router.fetch(new Request(`https://${host}/read-think-write/`, { method: 'POST' }));
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('Allow'), 'GET, HEAD');

    await withOrigin(() => new Response('upstream missing', { status: 404 }), async (requests) => {
      for (const path of ['/notes/', '/src/missing.js', '/read-think-write', '/.well-known/assetlinks.json']) {
        const response = await router.fetch(new Request(`https://${host}${path}`, { headers: { Accept: 'text/html' } }));
        assert.equal(response.status, 404, path);
        assert.equal(response.headers.get('Location'), null);
      }
      assert.equal(requests.length, 0);
      const prefixed = await router.fetch(new Request(`https://${host}/read-think-write/missing.js`));
      assert.equal(prefixed.status, 404);
      assert.equal(await prefixed.text(), 'upstream missing');
      assert.equal(prefixed.headers.get('Cache-Control'), 'no-cache, must-revalidate');
      assert.equal(requests.length, 1);
    });
  });

  test(`${host}: Pages redirects are rewritten only within the read prefix`, async () => {
    await withOrigin(() => new Response(null, {
      status: 301,
      headers: { Location: 'https://mj880616.github.io/read-think-write/support.html?from=pages' }
    }), async () => {
      const response = await router.fetch(new Request(`https://${host}/read-think-write/support`));
      assert.equal(response.status, 301);
      assert.equal(response.headers.get('Location'), `https://${host}/read-think-write/support.html?from=pages`);
    });
  });
}

test('unknown hosts are 404 and never reach the origin', async () => {
  await withOrigin(() => { throw new Error('unexpected fetch'); }, async () => {
    for (const host of ['work.bokdoong.com', 'desk.bokdoong.com', 'arsenal.bokdoong.com', 'bokdoong.com', 'unknown.example']) {
      const response = await router.fetch(new Request(`https://${host}/read-think-write/`));
      assert.equal(response.status, 404, host);
      assert.equal(await response.text(), 'Not found');
    }
  });
});
