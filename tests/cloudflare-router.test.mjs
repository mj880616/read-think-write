import assert from 'node:assert/strict';
import test from 'node:test';

import router from '../cloudflare/bokdoong-router.mjs';

const originalFetch = globalThis.fetch;

async function withOrigin(originHandler, run) {
  const requests = [];
  globalThis.fetch = async (request) => {
    requests.push(request);
    return originHandler(request);
  };
  try {
    await run(requests);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function documentRequest(path) {
  return new Request(`https://read.bokdoong.com${path}`, {
    headers: { Accept: 'text/html,application/xhtml+xml' }
  });
}

test('read.bokdoong.com root serves the Pages app shell without exposing the repository prefix', async () => {
  await withOrigin(
    (request) => {
      assert.equal(request.url, 'https://mj880616.github.io/read-think-write/');
      return new Response('<!doctype html><title>읽생기</title>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    },
    async (requests) => {
      const response = await router.fetch(documentRequest('/'));
      assert.equal(response.status, 200);
      assert.equal(requests.length, 1);
      assert.match(await response.text(), /읽생기/);
    }
  );
});

test('known 읽생기 SPA documents recover through the root app shell and preserve query strings', async () => {
  const routes = [
    '/notes/',
    '/bookmarks/',
    '/topics/',
    '/topics/11111111-1111-1111-1111-111111111111/',
    '/questions/',
    '/questions/22222222-2222-2222-2222-222222222222/',
    '/search/',
    '/archive/2026/',
    '/read/',
    '/read/33333333-3333-3333-3333-333333333333/',
    '/records/',
    '/records/44444444-4444-4444-4444-444444444444/',
    '/about/',
    '/feedback/',
    '/beta/',
    '/notes/?note=abc&mode=full'
  ];

  await withOrigin(
    () => new Response('missing', { status: 404 }),
    async (requests) => {
      for (const route of routes) {
        const response = await router.fetch(documentRequest(route));
        assert.equal(response.status, 302, route);
        const location = new URL(response.headers.get('Location'));
        assert.equal(location.origin, 'https://read.bokdoong.com', route);
        assert.equal(location.pathname, '/', route);
        assert.equal(location.searchParams.get('redirect'), route, route);
      }

      assert.deepEqual(
        requests.map((request) => new URL(request.url).pathname),
        routes.map((route) => `/read-think-write${new URL(route, 'https://read.bokdoong.com').pathname}`)
      );
    }
  );
});

test('known SPA paths recover for headerless GET and HEAD requests', async () => {
  await withOrigin(
    () => new Response('missing', { status: 404 }),
    async (requests) => {
      const headerless = await router.fetch(new Request('https://read.bokdoong.com/notes/'));
      assert.equal(headerless.status, 302);
      assert.equal(
        new URL(headerless.headers.get('Location')).searchParams.get('redirect'),
        '/notes/'
      );

      const head = await router.fetch(new Request('https://read.bokdoong.com/archive/2026/', {
        method: 'HEAD',
        headers: { Accept: '*/*' }
      }));
      assert.equal(head.status, 302);
      assert.equal(await head.text(), '');
      assert.equal(requests[1].method, 'HEAD');
    }
  );
});

test('legacy repository-prefixed SPA paths recover to the custom-domain route', async () => {
  await withOrigin(
    () => new Response('missing', { status: 404 }),
    async () => {
      const response = await router.fetch(documentRequest('/read-think-write/notes/?note=abc'));
      const location = new URL(response.headers.get('Location'));
      assert.equal(response.status, 302);
      assert.equal(location.pathname, '/');
      assert.equal(location.searchParams.get('redirect'), '/notes/?note=abc');
    }
  );
});

test('existing static files and fingerprinted assets pass through from the Pages repository', async () => {
  const paths = [
    '/manifest.webmanifest',
    '/favicon.svg',
    '/src/styles.abc123.css',
    '/src/app-entry.abc123.js',
    '/privacy.html',
    '/support.html',
    '/account-deletion.html',
    '/.well-known/assetlinks.json'
  ];

  await withOrigin(
    (request) => new Response(new URL(request.url).pathname, { status: 200 }),
    async (requests) => {
      for (const path of paths) {
        const response = await router.fetch(new Request(`https://read.bokdoong.com${path}`));
        assert.equal(response.status, 200, path);
        assert.equal(await response.text(), `/read-think-write${path}`, path);
      }
      assert.equal(requests.length, paths.length);
    }
  );
});

test('missing assets and unknown document routes remain 404 responses', async () => {
  await withOrigin(
    () => new Response('origin missing', { status: 404 }),
    async (requests) => {
      const missingAsset = await router.fetch(new Request('https://read.bokdoong.com/src/missing.js', {
        headers: { Accept: 'text/javascript' }
      }));
      assert.equal(missingAsset.status, 404);
      assert.equal(missingAsset.headers.get('Location'), null);

      const unknownDocument = await router.fetch(documentRequest('/not-an-app-route/'));
      assert.equal(unknownDocument.status, 404);
      assert.equal(unknownDocument.headers.get('Location'), null);
      assert.equal(await unknownDocument.text(), 'Not found');
      assert.equal(requests.length, 2);
    }
  );
});

test('Pages redirects for 읽생기 stay on the custom-domain root path', async () => {
  await withOrigin(
    () => new Response(null, {
      status: 301,
      headers: { Location: 'https://mj880616.github.io/read-think-write/support.html' }
    }),
    async () => {
      const response = await router.fetch(new Request('https://read.bokdoong.com/support'));
      assert.equal(response.status, 301);
      assert.equal(response.headers.get('Location'), 'https://read.bokdoong.com/support.html');
    }
  );

  await withOrigin(
    () => new Response(null, {
      status: 302,
      headers: { Location: '/read-think-write/support.html?from=origin' }
    }),
    async () => {
      const response = await router.fetch(new Request('https://read.bokdoong.com/support'));
      assert.equal(
        response.headers.get('Location'),
        'https://read.bokdoong.com/support.html?from=origin'
      );
    }
  );
});

test('web1 web2 and arsenal routing boundaries keep their existing behavior', async () => {
  await withOrigin(
    (request) => new Response(new URL(request.url).pathname, { status: 200 }),
    async (requests) => {
      const workRoot = await router.fetch(new Request('https://work.bokdoong.com/'));
      assert.equal(workRoot.status, 302);
      assert.equal(workRoot.headers.get('Location'), 'https://work.bokdoong.com/work/');

      const workAsset = await router.fetch(new Request('https://work.bokdoong.com/work/app.js'));
      assert.equal(workAsset.status, 200);
      assert.equal(await workAsset.text(), '/work/app.js');

      const deskRoot = await router.fetch(new Request('https://desk.bokdoong.com/'));
      assert.equal(deskRoot.status, 302);
      assert.equal(deskRoot.headers.get('Location'), 'https://desk.bokdoong.com/work/app/');

      const deskBoundary = await router.fetch(new Request('https://desk.bokdoong.com/work/index.html'));
      assert.equal(deskBoundary.status, 302);
      assert.equal(deskBoundary.headers.get('Location'), 'https://work.bokdoong.com/work/index.html');

      const arsenalRoot = await router.fetch(new Request('https://arsenal.bokdoong.com/'));
      assert.equal(arsenalRoot.status, 302);
      assert.equal(
        arsenalRoot.headers.get('Location'),
        'https://arsenal.bokdoong.com/work/personal/arsenal-match-archive/'
      );

      const rejectedWorkPath = await router.fetch(new Request('https://work.bokdoong.com/notes/', {
        headers: { Accept: 'text/html' }
      }));
      assert.equal(rejectedWorkPath.status, 404);
      assert.deepEqual(requests.map((request) => new URL(request.url).pathname), ['/work/app.js']);
    }
  );
});
