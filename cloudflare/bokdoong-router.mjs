const PAGES_ORIGIN = 'https://mj880616.github.io';
const READ_HOST = 'read.bokdoong.com';
const READ_REPO_BASE = '/read-think-write/';

const SERVICES = Object.freeze({
  'work.bokdoong.com': { root: '/work/', prefix: '/work/' },
  'desk.bokdoong.com': { root: '/work/app/', prefix: '/work/app/' },
  [READ_HOST]: { root: READ_REPO_BASE, prefix: READ_REPO_BASE },
  'arsenal.bokdoong.com': {
    root: '/work/personal/arsenal-match-archive/',
    prefix: '/work/personal/arsenal-match-archive/'
  }
});

function allowedPath(host, path) {
  if (host === 'bokdoong.com') {
    return path === '/' || path === '/favicon.png' || path === '/favicon.ico';
  }
  if (host === READ_HOST) return path.startsWith('/');
  return Boolean(SERVICES[host] && path.startsWith(SERVICES[host].prefix));
}

function upstreamPath(host, path) {
  if (host === 'bokdoong.com') {
    if (path === '/favicon.png' || path === '/favicon.ico') {
      return `/work/personal/portal${path}`;
    }
    return '/work/personal/portal/';
  }
  if (host === READ_HOST) {
    if (path === READ_REPO_BASE.slice(0, -1) || path.startsWith(READ_REPO_BASE)) return path;
    return `${READ_REPO_BASE.slice(0, -1)}${path}`;
  }
  return path;
}

function readAppPath(path) {
  if (path === READ_REPO_BASE.slice(0, -1)) return '/';
  if (path.startsWith(READ_REPO_BASE)) return path.slice(READ_REPO_BASE.length - 1);
  return path;
}

function isReadSpaPath(path) {
  const appPath = readAppPath(path);
  if (/^\/(?:read|bookmarks|notes|topics|questions|search|records|about|feedback|beta)\/?$/.test(appPath)) {
    return true;
  }
  if (/^\/(?:read|topics|questions|records)\/[0-9a-f-]+\/?$/i.test(appPath)) return true;
  return /^\/archive\/\d{4}\/?$/.test(appPath);
}

function isDocumentRequest(request) {
  return (
    request.headers.get('Sec-Fetch-Dest') === 'document'
    || request.headers.get('Accept')?.includes('text/html')
  );
}

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const host = incoming.hostname.toLowerCase();

    if (!SERVICES[host] && host !== 'bokdoong.com') {
      return new Response('Not found', { status: 404 });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' }
      });
    }
    if (incoming.protocol !== 'https:') {
      incoming.protocol = 'https:';
      return Response.redirect(incoming.href, 301);
    }

    if (
      incoming.pathname === '/favicon.ico'
      && (host === READ_HOST || host === 'arsenal.bokdoong.com')
    ) {
      const mark = host === READ_HOST ? 'R' : 'A';
      const color = host === READ_HOST ? '#315d50' : '#a5232a';
      const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${color}"/><text x="16" y="23" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="22" font-weight="700">${mark}</text></svg>`;
      return new Response(request.method === 'HEAD' ? null : icon, {
        headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    if (incoming.pathname === '/' && host !== 'bokdoong.com' && host !== READ_HOST) {
      incoming.pathname = SERVICES[host].root;
      return Response.redirect(incoming.href, 302);
    }
    if (host === 'desk.bokdoong.com' && incoming.pathname === '/work/app') {
      incoming.pathname = '/work/app/';
      return Response.redirect(incoming.href, 302);
    }
    if (
      host === 'desk.bokdoong.com'
      && incoming.pathname.startsWith('/work/')
      && !incoming.pathname.startsWith('/work/app/')
    ) {
      incoming.hostname = 'work.bokdoong.com';
      return Response.redirect(incoming.href, 302);
    }
    if (!allowedPath(host, incoming.pathname)) {
      return new Response('Not found', { status: 404 });
    }

    const originUrl = new URL(upstreamPath(host, incoming.pathname), PAGES_ORIGIN);
    originUrl.search = incoming.search;
    const headers = new Headers();
    for (const name of ['Accept', 'Accept-Language', 'If-None-Match', 'If-Modified-Since', 'Range']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const upstream = await fetch(new Request(originUrl, {
      method: request.method,
      headers,
      redirect: 'manual',
      cache: 'no-store'
    }));

    if (host === READ_HOST && upstream.status === 404 && isReadSpaPath(incoming.pathname)) {
      const recovery = new URL('/', incoming);
      recovery.searchParams.set('redirect', readAppPath(incoming.pathname) + incoming.search);
      return Response.redirect(recovery.href, 302);
    }
    if (host === READ_HOST && upstream.status === 404 && isDocumentRequest(request)) {
      return new Response(request.method === 'HEAD' ? null : 'Not found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=UTF-8',
          'Cache-Control': 'no-cache, must-revalidate'
        }
      });
    }

    const responseHeaders = new Headers(upstream.headers);
    if (host === 'bokdoong.com' && upstream.ok) {
      if (incoming.pathname === '/favicon.png') responseHeaders.set('Content-Type', 'image/png');
      if (incoming.pathname === '/favicon.ico') responseHeaders.set('Content-Type', 'image/x-icon');
    }
    const versionedAsset = (
      host === 'desk.bokdoong.com'
      && incoming.searchParams.has('v')
      && !incoming.pathname.endsWith('/sw.js')
      && /\.(?:js|css|svg|png|ico|webp)$/i.test(incoming.pathname)
    );
    responseHeaders.set(
      'Cache-Control',
      versionedAsset ? 'public, max-age=31536000, immutable' : 'no-cache, must-revalidate'
    );

    const location = responseHeaders.get('Location');
    if (location) {
      const target = new URL(location, originUrl);
      if (host === READ_HOST && target.origin === PAGES_ORIGIN && target.pathname.startsWith(READ_REPO_BASE)) {
        target.pathname = target.pathname.slice(READ_REPO_BASE.length - 1) || '/';
        target.hostname = host;
        responseHeaders.set('Location', target.href);
      } else if (target.origin === PAGES_ORIGIN && allowedPath(host, target.pathname)) {
        target.hostname = host;
        responseHeaders.set('Location', target.href);
      }
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders
    });
  }
};
