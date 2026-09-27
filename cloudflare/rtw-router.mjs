// Read-host behavior extracted from work@ed96b682; keep both hostnames identical.
const PAGES_ORIGIN = 'https://mj880616.github.io';
const READ_BASE = '/read-think-write/';
const READ_HOSTS = new Set(['read.bokdoong.com', 'read-test.bokdoong.com']);

function isDocumentRequest(request, path) {
  // File-like paths remain resources even when opened in a browser tab.
  if (/\.[^/]+$/.test(path)) return false;
  return request.headers.get('Sec-Fetch-Dest') === 'document'
    || request.headers.get('Accept')?.includes('text/html');
}

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const host = incoming.hostname.toLowerCase();
    if (!READ_HOSTS.has(host)) return new Response('Not found', { status: 404 });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    if (incoming.protocol !== 'https:') {
      incoming.protocol = 'https:';
      return Response.redirect(incoming.href, 301);
    }
    if (incoming.pathname === '/favicon.ico') {
      const icon = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#315d50"/><text x="16" y="23" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="22" font-weight="700">R</text></svg>';
      return new Response(request.method === 'HEAD' ? null : icon, {
        headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }
      });
    }
    if (incoming.pathname === '/') {
      incoming.pathname = READ_BASE;
      return Response.redirect(incoming.href, 302);
    }
    if (!incoming.pathname.startsWith(READ_BASE)) {
      if (request.method === 'GET' && isDocumentRequest(request, incoming.pathname)) {
        const recovery = new URL(READ_BASE, incoming);
        recovery.searchParams.set('redirect', incoming.pathname + incoming.search);
        return Response.redirect(recovery.href, 302);
      }
      return new Response('Not found', { status: 404 });
    }

    const originUrl = new URL(incoming.pathname, PAGES_ORIGIN);
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
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set('Cache-Control', 'no-cache, must-revalidate');
    const location = responseHeaders.get('Location');
    if (location) {
      const target = new URL(location, originUrl);
      if (target.origin === PAGES_ORIGIN && target.pathname.startsWith(READ_BASE)) {
        target.hostname = host;
        responseHeaders.set('Location', target.href);
      }
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  }
};
