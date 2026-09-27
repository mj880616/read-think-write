const origin = 'https://read-test.bokdoong.com';

async function check() {
  const root = await fetch(`${origin}/`, { redirect: 'manual' });
  if (root.status !== 302 || root.headers.get('Location') !== `${origin}/read-think-write/`) {
    throw new Error(`root: expected 302 to /read-think-write/, got ${root.status} ${root.headers.get('Location')}`);
  }

  const page = await fetch(root.headers.get('Location'));
  if (page.status !== 200) throw new Error(`app shell: HTTP ${page.status}`);
  const html = await page.text();
  const assets = [
    ['CSS', /<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/i, /text\/css/i],
    ['JavaScript', /<script\b[^>]*type="module"[^>]*src="([^"]+)"/i, /(?:javascript|ecmascript)/i]
  ];
  for (const [label, pattern, contentType] of assets) {
    const path = html.match(pattern)?.[1];
    if (!path) throw new Error(`app shell has no ${label} reference`);
    const url = new URL(path, page.url);
    if (url.origin !== origin) throw new Error(`${label} left test origin: ${url}`);
    const response = await fetch(url);
    if (response.status !== 200 || !contentType.test(response.headers.get('Content-Type') || '')) {
      throw new Error(`${label}: HTTP ${response.status}, ${response.headers.get('Content-Type')} at ${url}`);
    }
    console.log(`OK ${label}: ${url.pathname}`);
  }

  const missing = await fetch(`${origin}/read-think-write/src/__missing-rtw-worker-check__.js`, { redirect: 'manual' });
  if (missing.status !== 404) throw new Error(`missing asset: expected 404, got ${missing.status}`);
  console.log('OK root, app shell, CSS, JavaScript, missing asset');
}

let lastError;
for (let attempt = 1; attempt <= 30; attempt++) {
  try {
    await check();
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.error(`WAIT ${attempt}/30: ${error.message}`);
    if (attempt < 30) await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}
throw lastError;
