import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(resolve(tmpdir(), 'rtw-pull-deploy-'));
const versions = ['111111111111', '222222222222'];
const base = '/read-think-write/';
const user = { id: 'test-user', email: 'test@example.test' };
const fakeApi = `
export const AI_DAILY_LIMITS = { read: 3, expand: 3 };
export const currentUser = async () => (${JSON.stringify(user)});
export const getBetaAccess = async () => ({ active: true, role: 'user' });
export const listResources = async () => [];
export const listRecentResources = async () => ({ resources: [], count: 0 });
export const listNotes = async () => [];
export const listTopics = async () => [];
export const listQuestions = async () => [];
export const listBookmarks = async () => [];
export const listNoteTypes = async () => [];
export const getAiUsageToday = async () => ({ read: 0, expand: 0 });
`;
const fakeSupabase = `export const supabase = { auth: {
  onAuthStateChange() {},
  getUser: async () => ({ data: { user: ${JSON.stringify(user)} }, error: null }),
  getSession: async () => ({ data: { session: { user: ${JSON.stringify(user)} } }, error: null }),
  getUserIdentities: async () => ({ data: { identities: [] }, error: null })
}, from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }) };`;

// Execute the actual Pages fingerprint step in temporary directories; never deploy.
const workflow = await readFile(resolve(repo, '.github/workflows/pages.yml'), 'utf8');
const python = workflow.match(/python3 - <<'PY'\n([\s\S]*?)\n\s+PY/)[1].split('\n').map(line => line.slice(10)).join('\n');
for (const version of versions) {
  const directory = resolve(temporary, version);
  await cp(resolve(repo, 'src'), resolve(directory, 'src'), { recursive: true });
  await cp(resolve(repo, 'index.html'), resolve(directory, 'index.html'));
  const main = resolve(directory, 'src/main.js');
  await writeFile(main, `globalThis.__testJsDeployment = '${version}';\n` + await readFile(main, 'utf8'));
  const css = resolve(directory, 'src/styles.css');
  await writeFile(css, await readFile(css, 'utf8') + `\n:root { --test-css-deployment: ${version}; }\n`);
  const result = spawnSync('python3', ['-c', python], { cwd: directory, env: { ...process.env, GITHUB_SHA: version }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

let serving = versions[0];
const requests = [];
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const relative = pathname === base ? 'index.html' : pathname.startsWith(base) ? pathname.slice(base.length) : null;
  const directory = resolve(temporary, serving);
  const target = relative && resolve(directory, relative);
  if (!target || !target.startsWith(directory + sep)) { response.writeHead(404).end(); return; }
  requests.push(pathname);
  try {
    let body = await readFile(target);
    if (/\/api\.[a-f\d]{12}\.js$/.test(target)) body = fakeApi;
    if (/\/supabase\.[a-f\d]{12}\.js$/.test(target)) body = fakeSupabase;
    if (/\/markdown\.[a-f\d]{12}\.js$/.test(target)) body = 'export const renderMarkdown = value => value;';
    const type = target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html';
    // Same downstream cache policy as cloudflare/rtw-router.mjs.
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache, must-revalidate' }).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;

async function open(native = true, width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: width === 390, reducedMotion: 'reduce' });
  await context.addInitScript(({ native }) => {
    window.__testBoots = Number(sessionStorage.getItem('test-boots') || 0) + 1;
    sessionStorage.setItem('test-boots', String(window.__testBoots));
    if (native) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
  }, { native });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + base, { waitUntil: 'networkidle' });
  await page.getByText('나의 생각 저장소').waitFor();
  if (native) await page.waitForSelector('.native-pull-refresh', { state: 'attached' });
  const cdp = await context.newCDPSession(page);
  const move = async (points, release = true) => {
    const send = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ x: point[0], y: point[1] }] : [] });
    await send('touchStart', points[0]);
    for (const point of points.slice(1)) await send('touchMove', point);
    if (release) await send('touchEnd');
  };
  const pull = (release = true) => move([[195, 310], [195, 330], [195, 355], [195, 385], [195, 430]], release);
  return { context, page, errors, cdp, move, pull };
}

async function noReload(h, action, label) {
  const before = await h.page.evaluate(() => window.__testBoots);
  await action();
  await h.page.waitForTimeout(200);
  assert.equal(await h.page.evaluate(() => window.__testBoots), before, label);
}

try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  const deployed = await open();
  assert.equal(await deployed.page.evaluate(() => window.__testJsDeployment), versions[0]);
  assert.equal(await deployed.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--test-css-deployment').trim()), versions[0]);
  await deployed.pull(false);
  assert.equal(await deployed.page.locator('.native-pull-refresh').isVisible(), true);
  assert.match(await deployed.page.locator('.native-pull-refresh').textContent(), /놓으면 새로고침/);
  assert.equal(await deployed.page.evaluate(() => window.__testBoots), 1, 'holding a pull does not reload');
  serving = versions[1];
  await deployed.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await deployed.page.waitForFunction(version => window.__testBoots === 2 && window.__testJsDeployment === version, versions[1]);
  await deployed.page.waitForLoadState('networkidle');
  assert.equal(await deployed.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--test-css-deployment').trim()), versions[1]);
  for (const asset of ['styles', 'app-entry', 'main', 'mobile-native', 'mobile-pull-refresh']) {
    const extension = asset === 'styles' ? 'css' : 'js';
    assert.ok(requests.includes(`${base}src/${asset}.${versions[1]}.${extension}`), `new deployment requests ${asset}`);
  }
  assert.deepEqual(deployed.errors, []);
  await deployed.context.close();
  console.log('PASS: trusted top pull reloads once; actual Pages fingerprint step delivers new CSS and JS');

  const replaced = await open();
  await replaced.pull(false);
  await replaced.page.evaluate(() => {
    document.querySelector('#app').innerHTML = '<main class="page">교체된 화면</main>';
  });
  await noReload(replaced, () => replaced.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }), 'detached touch target must not reload');
  assert.equal(await replaced.page.locator('.native-pull-refresh').isVisible(), false, 'a replaced page must clear the armed indicator');
  await replaced.context.close();

  const middle = await open();
  await middle.page.evaluate(() => scrollTo(0, 300));
  await middle.page.waitForFunction(() => scrollY > 0);
  await noReload(middle, () => middle.pull(), 'middle scroll must not reload');
  await middle.context.close();

  const nested = await open();
  await nested.page.evaluate(() => {
    const scroller = document.createElement('div');
    scroller.id = 'test-inner-scroll';
    scroller.style.cssText = 'height:160px;overflow-y:auto';
    scroller.innerHTML = '<div style="height:700px">내부 스크롤 영역</div>';
    document.querySelector('.page').prepend(scroller);
  });
  const box = await nested.page.locator('#test-inner-scroll').boundingBox();
  await noReload(nested, () => nested.move([[195, box.y + 15], [195, box.y + 40], [195, box.y + 75], [195, box.y + 135]]), 'inner scroller at top must not reload');
  await nested.page.evaluate(() => { document.querySelector('#test-inner-scroll').scrollTop = 100; });
  await noReload(nested, () => nested.move([[195, box.y + 15], [195, box.y + 40], [195, box.y + 75], [195, box.y + 135]]), 'inner scroller in middle must not reload');
  await nested.context.close();

  const writing = await open();
  await writing.page.evaluate(() => {
    const editor = document.createElement('textarea');
    document.querySelector('.page').append(editor);
    editor.focus({ preventScroll: true });
  });
  await noReload(writing, () => writing.pull(), 'editor focus blocks refresh outside the editor');
  await writing.context.close();

  const swipe = await open();
  await noReload(swipe, () => swipe.move([[195, 310], [175, 310], [145, 310], [95, 310]]), 'horizontal tab swipe must not reload');
  await swipe.page.waitForURL('**/read/');
  assert.equal(await swipe.page.locator('.native-pull-refresh').isVisible(), false);
  await swipe.context.close();
  console.log('PASS: middle scroll, nested scroll at top/middle, editor focus and existing tab swipe');

  for (const width of [390, 1280]) {
    const ordinary = await open(false, width);
    assert.equal(await ordinary.page.locator('.native-pull-refresh').count(), 0);
    await noReload(ordinary, () => ordinary.pull(), `ordinary ${width}px browser must not reload`);
    const dimensions = await ordinary.page.evaluate(() => ({ screen: innerWidth, content: document.documentElement.scrollWidth }));
    assert.ok(dimensions.content <= dimensions.screen);
    assert.deepEqual(ordinary.errors, []);
    await ordinary.context.close();
  }
  console.log('PASS: ordinary mobile/desktop browsers have no refresh UI or behavior');
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
  await rm(temporary, { recursive: true, force: true });
}
