import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = '/read-think-write/';
const user = { id: 'fake-user', email: 'private@example.test' };
const fakeApi = `
const scenario = new URLSearchParams(location.search).get('scenario');
const attempt = Number(sessionStorage.getItem('fake-startup-attempt') || 0) + 1;
sessionStorage.setItem('fake-startup-attempt', String(attempt));
const hold = () => new Promise(() => {});
export const AI_DAILY_LIMITS = { read: 3, expand: 3 };
export const currentUser = () => scenario === 'auth-retry' && attempt === 1 ? hold() : Promise.resolve(${JSON.stringify(user)});
export const getBetaAccess = () => scenario === 'beta-hang' ? hold() : Promise.resolve({ active: true, role: 'user' });
export const listResources = () => scenario === 'data-hang' ? hold() : Promise.resolve([]);
export const listNotes = async () => [];
export const listTopics = async () => [];
export const listQuestions = async () => [];
export const listBookmarks = async () => [];
export const listNoteTypes = async () => [];
export const getAiUsageToday = async () => ({ read: 0, expand: 0 });
`;

const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const relative = path === base ? 'index.html' : path.startsWith(base) ? path.slice(base.length) : null;
  const target = relative && resolve(repo, relative);
  if (!target || !(target === repo || target.startsWith(repo + sep))) { response.writeHead(404).end(); return; }
  try {
    const body = await readFile(target);
    const type = target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html';
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

async function makePage(scenario) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.name));
  await page.route('**/src/supabase.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `export const supabase = { auth: { onAuthStateChange() {}, getUser: async () => ({ data: { user: ${JSON.stringify(user)} }, error: null }), getSession: async () => ({ data: { session: null }, error: null }) } };` }));
  await page.route('**/src/api.js', (route) => route.fulfill({ contentType: 'text/javascript', body: fakeApi }));
  await page.route(/cdn\.jsdelivr\.net/, (route) => route.fulfill({
    contentType: 'text/javascript',
    body: route.request().url().includes('dompurify')
      ? 'export default { sanitize: value => value };'
      : 'export const marked = { parse: value => value };'
  }));
  await page.clock.install();
  await page.goto(`${origin}${base}?scenario=${scenario}`, { waitUntil: 'domcontentloaded' });
  return { context, page, errors };
}

async function assertMobile(page, zoom) {
  if (zoom === 200) await page.evaluate(() => {
    const elements = [...document.querySelectorAll('#app *')];
    const sizes = elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    elements.forEach((element, index) => { element.style.fontSize = `${sizes[index] * 2}px`; });
  });
  const dimensions = await page.evaluate(() => ({ screen: innerWidth, page: document.documentElement.scrollWidth }));
  assert.ok(dimensions.page <= dimensions.screen, `${zoom}% horizontal overflow: ${JSON.stringify(dimensions)}`);
  const retry = page.getByRole('button', { name: '다시 시도' });
  if (await retry.count()) {
    const rect = await retry.boundingBox();
    assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= 390 && rect.y < 844, `${zoom}% retry button outside phone viewport`);
  }
}

try {
  for (const zoom of [100, 200]) {
    const normal = await makePage('normal');
    await normal.page.getByText('나의 생각 저장소').waitFor({ timeout: 3000 }).catch(async (error) => {
      const status = await normal.page.evaluate(() => ({
        code: document.querySelector('#app .meta')?.textContent?.match(/^[A-Z_]+$/)?.[0] ?? null,
        loading: document.querySelector('#app')?.textContent?.includes('여는 중') ?? false,
        hasHome: document.querySelector('#app')?.textContent?.includes('나의 생각 저장소') ?? false
      }));
      console.error('normal startup status', status, 'pageErrors', normal.errors.length);
      throw error;
    });
    await assertMobile(normal.page, zoom);
    assert.deepEqual(normal.errors, []);
    await normal.context.close();

    const auth = await makePage('auth-retry');
    await auth.page.getByText('읽생기 여는 중…').waitFor();
    await auth.page.clock.runFor(10_000);
    await auth.page.getByText('AUTH_TIMEOUT').waitFor();
    await assertMobile(auth.page, zoom);
    await auth.page.getByRole('button', { name: '다시 시도' }).click();
    await auth.page.getByText('나의 생각 저장소').waitFor();
    assert.deepEqual(auth.errors, []);
    await auth.context.close();

    for (const [scenario, code] of [['beta-hang', 'BETA_TIMEOUT'], ['data-hang', 'DATA_TIMEOUT']]) {
      const held = await makePage(scenario);
      await held.page.getByText('읽생기 여는 중…').waitFor();
      await held.page.clock.runFor(15_000);
      await held.page.getByText(code).waitFor();
      await assertMobile(held.page, zoom);
      assert.deepEqual(held.errors, []);
      await held.context.close();
    }
    console.log(`browser startup scenarios passed at 390x844, text ${zoom}%`);
  }
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
