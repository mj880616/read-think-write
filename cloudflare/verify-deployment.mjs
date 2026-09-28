const origins = ['https://read-test.bokdoong.com', 'https://read.bokdoong.com'];
// Optional: the Pages deploy passes its commit fingerprint so a stale app shell keeps retrying.
const expectedVersion = process.env.EXPECT_ASSET_VERSION || '';
const attempts = Number(process.env.VERIFY_ATTEMPTS) || 30;

async function check(origin) {
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
    if (url.origin !== origin) throw new Error(`${label} left ${origin}: ${url}`);
    if (expectedVersion && !url.pathname.includes(`.${expectedVersion}.`)) {
      throw new Error(`${label} is not version ${expectedVersion} yet: ${url.pathname}`);
    }
    const response = await fetch(url);
    if (response.status !== 200 || !contentType.test(response.headers.get('Content-Type') || '')) {
      throw new Error(`${label}: HTTP ${response.status}, ${response.headers.get('Content-Type')} at ${url}`);
    }
    console.log(`OK ${label}: ${url.pathname}`);
  }

  const missing = await fetch(`${origin}/read-think-write/src/__missing-rtw-worker-check__.js`, { redirect: 'manual' });
  if (missing.status !== 404) throw new Error(`missing asset: expected 404, got ${missing.status}`);
  const shortMissing = await fetch(`${origin}/src/__missing-rtw-worker-check__.js`, {
    headers: { Accept: 'text/javascript' },
    redirect: 'manual'
  });
  if (shortMissing.status !== 404) throw new Error(`short missing asset: expected 404, got ${shortMissing.status}`);

  const document = await fetch(`${origin}/notes/?note=probe&mode=full`, {
    headers: { Accept: 'text/html' },
    redirect: 'manual'
  });
  const recovery = new URL(document.headers.get('Location') || '/', origin);
  if (document.status !== 302 || recovery.pathname !== '/read-think-write/'
      || recovery.searchParams.get('redirect') !== '/notes/?note=probe&mode=full') {
    throw new Error(`document recovery: HTTP ${document.status}, ${document.headers.get('Location')}`);
  }
  const recoveredPage = await fetch(recovery);
  if (recoveredPage.status !== 200) throw new Error(`recovered app shell: HTTP ${recoveredPage.status}`);
  console.log(`OK ${origin}: root, app shell, CSS, JavaScript, missing assets, document recovery`);
}

for (const origin of origins) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await check(origin);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      console.error(`WAIT ${origin} ${attempt}/${attempts}: ${error.message}`);
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
  if (lastError) throw lastError;
}
