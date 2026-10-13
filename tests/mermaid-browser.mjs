import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { chromium } from 'playwright';

const exec = promisify(execFile);
const temp = await mkdtemp(join(tmpdir(), 'rtw-mermaid-'));
const repo = new URL('../', import.meta.url);
const cache = new Map();
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  try {
    let body, type = 'text/javascript';
    if (path === '/' || path.startsWith('/read-think-write/')) {
      type = 'text/html';
      body = '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><div id="app"><div class="shell"><div class="page"><article class="article" id="resource-article"></article><details class="archive-article"><summary>archive</summary><article class="archive-body"></article></details><div class="record-markdown"></div></div></div></div>';
    } else if (/^\/src\/[\w.-]+\.(js|css)$/.test(path)) {
      body = await readFile(new URL(path.slice(1), repo));
      if (path.endsWith('.css')) type = 'text/css';
    } else { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }).end(body);
  } catch { response.writeHead(500).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}/`;
let browser;
const measurements = [];
async function pageFor(width = 390, mode = '') {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const requests = [];
  await page.route('https://cdn.jsdelivr.net/**', async route => {
    const url = route.request().url();
    requests.push(url);
    if (mode === 'offline' && url.includes('/mermaid@')) return route.abort();
    if (mode === 'timeout' && url.includes('/mermaid@')) return; // A genuinely stalled network load.
    let task = cache.get(url);
    if (!task) {
      task = (async () => {
        const file = join(temp, String(cache.size));
        const { stdout } = await exec('curl', ['-fsSL', '--compressed', '--max-time', '30', '-o', file, '-w', '%{size_download}', url]);
        return { body: await readFile(file), wireBytes: Number(stdout), url };
      })();
      cache.set(url, task);
    }
    try {
      const result = await task;
      await route.fulfill({ contentType: 'text/javascript', body: result.body });
    } catch (error) { console.error('CDN failed:', url, error.message); await route.abort(); }
  });
  await page.goto(base);
  await page.evaluate(async () => {
    window.md = await import('/src/markdown.js');
    window.diagrams = await import('/src/mermaid.js');
    window.bookmarks = await import('/src/bookmark-location.js');
  });
  return { page, requests };
}
async function show(page, md, selector = '.article') {
  await page.evaluate(async ({ md, selector }) => {
    const body = document.querySelector(selector);
    body.innerHTML = window.md.renderMarkdown(md, { mermaid: true });
    await window.diagrams.renderMermaidBlocks(body);
    await Promise.all([...body.querySelectorAll('.mermaid-diagram img')].map(img => img.decode()));
  }, { md, selector });
}
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  const { page, requests } = await pageFor();
  await show(page, 'plain **Markdown**\n\n```js\nconsole.log(1)\n```');
  assert.equal(requests.filter(url => url.includes('/mermaid@')).length, 0, 'no Mermaid network requests without its code blocks');
  const md = '같은 문장\n\n```mermaid\nflowchart LR\nA[읽기] --> B[생각] --> C[기록]\n```\n\n같은 문장';
  await page.evaluate(md => {
    const body = document.querySelector('.article');
    body.innerHTML = window.md.renderMarkdown(md, { mermaid: true });
    window.originalText = body.textContent;
    window.saved = [...body.querySelectorAll('p')].map(p => {
      const range = document.createRange(); range.selectNodeContents(p);
      const before = document.createRange(); before.selectNodeContents(body); before.setEnd(range.startContainer, range.startOffset);
      const through = document.createRange(); through.selectNodeContents(body); through.setEnd(range.endContainer, range.endOffset);
      return window.bookmarks.bookmarkSelectionData(body.textContent, range.toString(), before.toString(), through.toString(), range.toString());
    });
  }, md);
  const started = Date.now();
  await show(page, md);
  assert.equal(await page.locator('.article .mermaid-diagram img').count(), 1, 'flowchart renders');
  const mermaidUrls = requests.filter(url => url.includes('/mermaid@'));
  const entries = await Promise.all(mermaidUrls.map(url => cache.get(url)));
  measurements.push({ scenario: 'cold flowchart: library + diagram chunks', version: '12.2.0', requests: entries.length, compressedBytes: entries.reduce((sum, item) => sum + item.wireBytes, 0), decodedBytes: entries.reduce((sum, item) => sum + item.body.length, 0), elapsedMs: Date.now() - started, svgBytes: await page.evaluate(() => new TextEncoder().encode(decodeURIComponent(document.querySelector('.mermaid-diagram img').src.split(',')[1])).length), resources: entries.map(({ url, wireBytes, body }) => ({ url, compressedBytes: wireBytes, decodedBytes: body.length })) });
  // First loading alone is the entry module's static import closure, before lazy diagram parsers.
  const visited = new Set();
  function visit(url) {
    if (visited.has(url)) return;
    visited.add(url);
    const entry = entries.find(item => item.url === url);
    if (!entry) return;
    for (const match of entry.body.toString().matchAll(/(?:\bfrom|\bimport)\s*["']([^"']+)["']/g)) visit(new URL(match[1], url).href);
  }
  visit('https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.esm.min.mjs');
  const initial = entries.filter(item => visited.has(item.url));
  measurements.push({ scenario: 'initial Mermaid static module loading', requests: initial.length, compressedBytes: initial.reduce((sum, item) => sum + item.wireBytes, 0), decodedBytes: initial.reduce((sum, item) => sum + item.body.length, 0) });
  const stable = await page.evaluate(() => {
    const body = document.querySelector('.article');
    const result = { same: body.textContent === window.originalText, matches: [] };
    for (const saved of window.saved) {
      const list = [], walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) list.push(walker.currentNode);
      const found = window.bookmarks.locateBookmarkRange(list, { selected_text: saved.text, start_offset: saved.start, context_before: saved.contextBefore, context_after: saved.contextAfter });
      const range = document.createRange(); range.setStart(found.startNode, found.startOffset); range.setEnd(found.endNode, found.endOffset);
      result.matches.push({ text: range.toString(), paragraph: found.startNode.parentElement.tagName, last: found.startNode === body.querySelectorAll('p')[1].firstChild });
      const before = document.createRange(); before.selectNodeContents(body); before.setEnd(range.startContainer, range.startOffset);
      const through = document.createRange(); through.selectNodeContents(body); through.setEnd(range.endContainer, range.endOffset);
      const resaved = window.bookmarks.bookmarkSelectionData(body.textContent, range.toString(), before.toString(), through.toString(), range.toString());
      if (resaved.start !== saved.start) throw new Error('bookmark offset changed after rendering');
    }
    return result;
  });
  assert.equal(stable.same, true);
  assert.deepEqual(stable.matches, [{ text: '같은 문장', paragraph: 'P', last: false }, { text: '같은 문장', paragraph: 'P', last: true }]);
  for (const [name, code] of [['pie', 'pie title 비율\n"읽기" : 40\n"기록" : 60'], ['xychart-beta', 'xychart-beta\nx-axis [1, 2, 3]\ny-axis "값" 0 --> 100\nbar [20, 60, 80]']]) {
    await show(page, '```mermaid\n' + code + '\n```');
    assert.equal(await page.locator('.mermaid-diagram img').count(), 1, `${name} renders`);
  }
  await show(page, '```mermaid\nflowchart LR\nA-->[\n```');
  assert.equal(await page.locator('pre:not([hidden])[data-mermaid-error]').count(), 1);
  assert.equal(await page.locator('.mermaid-diagram').count(), 0);
  let dialogs = 0;
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  const attack = '```mermaid\n%%{init: {"securityLevel":"loose", "htmlLabels":true, "flowchart":{"htmlLabels":true}}}%%\nflowchart LR\nA["<script>window.pwned=1</script>"] --> B["<img src=x onerror=window.pwned=2>"] --> C["javascript:alert(1)"]\nclick C "javascript:alert(1)"\n```';
  await show(page, attack);
  const safe = await page.evaluate(() => {
    const img = document.querySelector('.mermaid-diagram img');
    if (!img) return { rendered: false };
    const svg = decodeURIComponent(img.src.split(',')[1]);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    return { rendered: true, pwned: window.pwned || 0, unsafe: doc.querySelectorAll('script, foreignObject, [onerror], [onclick], [href^="javascript:"], [xlink\\:href^="javascript:"]').length };
  });
  assert.deepEqual(safe, { rendered: true, pwned: 0, unsafe: 0 });
  assert.equal(dialogs, 0);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => { document.body.style.background = '#121212'; document.body.style.color = '#eee'; });
    const wide = 'flowchart LR\n' + Array.from({ length: 10 }, (_, i) => `A${i}[long label ${i}] --> A${i + 1}`).join('\n');
    await show(page, '```mermaid\n' + wide + '\n```');
    const size = await page.evaluate(() => {
      const wrap = document.querySelector('.mermaid-diagram'); wrap.scrollLeft = 100;
      return { pageOverflow: document.documentElement.scrollWidth - innerWidth, overflow: wrap.scrollWidth - wrap.clientWidth, scroll: wrap.scrollLeft, background: getComputedStyle(wrap).backgroundColor };
    });
    assert.ok(size.pageOverflow <= 1);
    assert.ok(size.overflow > 0 && size.scroll > 0);
    assert.equal(size.background, 'rgb(255, 255, 255)');
    await page.emulateMedia({ media: 'print' });
    const print = await page.evaluate(() => {
      const wrap = document.querySelector('.mermaid-diagram'), img = wrap.querySelector('img');
      return { display: getComputedStyle(img).display, overflow: getComputedStyle(wrap).overflowX, fits: img.getBoundingClientRect().width <= wrap.clientWidth };
    });
    assert.equal(print.display, 'block'); assert.equal(print.overflow, 'visible'); assert.equal(print.fits, true);
    await page.emulateMedia({ media: 'screen' });
  }
  await page.evaluate(() => { document.querySelector('details').open = true; });
  await show(page, '```mermaid\nflowchart LR\nA-->B\n```', '.archive-body');
  assert.equal(await page.locator('.archive-body .mermaid-diagram img').count(), 1);
  await page.evaluate(attack => { document.querySelector('.record-markdown').innerHTML = window.md.renderMarkdown(attack); }, attack);
  assert.equal(await page.locator('.record-markdown pre code.language-mermaid').count(), 1);
  assert.equal(await page.locator('.record-markdown .mermaid-diagram').count(), 0);
  await page.screenshot({ path: process.env.MERMAID_SCREENSHOT_PATH || join(temp, 'mermaid-dark.png'), fullPage: true });
  if (process.env.MERMAID_REPORT_PATH) await writeFile(process.env.MERMAID_REPORT_PATH, JSON.stringify(measurements, null, 2));
  console.log(JSON.stringify(measurements.map(({ resources, ...summary }) => summary), null, 2));
  await page.close();
  const { page: integrated } = await pageFor();
  const integrationErrors = [];
  integrated.on('pageerror', error => integrationErrors.push(error.message));
  integrated.on('dialog', dialog => dialog.type() === 'prompt' ? dialog.accept('') : dialog.dismiss());
  await integrated.route('**/src/supabase.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const supabase = {auth:{onAuthStateChange(){}}};' }));
  await integrated.route('**/src/api.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    const user = {id:'fixture-owner',email:'fixture@example.test'};
    const resource = {id:'11111111-1111-4111-8111-111111111111',title:'Diagram integration',published_on:'2026-09-01',body_md:window.fixtureMD};
    window.fixtureBookmarks = [];
    export const currentUser = async () => user;
    export const getBetaAccess = async () => ({active:true,role:'user'});
    export const listResources = async () => [resource];
    export const listRecentResources = async () => ({resources:[],count:0});
    export const listNotes = async () => [];
    export const listTopics = async () => [];
    export const listQuestions = async () => [];
    export const listNoteTypes = async () => [];
    export const listRelations = async () => [];
    export const listBookmarks = async () => window.fixtureBookmarks;
    export const createBookmark = async input => { window.fixtureBookmarks.push({...input,id:String(window.fixtureBookmarks.length+1)}); };
  ` }));
  await integrated.evaluate(() => {
    const tall = 'flowchart TD\n' + Array.from({length:20}, (_,i) => `A${i}[Step ${i}] --> A${i+1}`).join('\n');
    window.fixtureMD = '같은 문장\n\n```mermaid\n' + tall + '\n```\n\n같은 문장';
    // Explicitly test app scrolling, independent of browser scroll anchoring.
    document.documentElement.style.overflowAnchor = 'none';
    history.replaceState({}, '', '/read-think-write/read/11111111-1111-4111-8111-111111111111/');
  });
  await integrated.evaluate(() => import('/src/main.js'));
  await integrated.locator('#resource-article .mermaid-diagram img').waitFor({ timeout: 45_000 }).catch(async error => { console.error('Integration diagnostic', await integrated.evaluate(() => ({html:document.querySelector('#app').innerHTML, path:location.pathname})), integrationErrors); throw error; });
  for (const index of [0, 1]) {
    await integrated.evaluate(index => {
      const p = document.querySelectorAll('#resource-article p')[index];
      p.scrollIntoView({block:'center'});
      const range = document.createRange(); range.selectNodeContents(p);
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
      document.querySelector('#resource-article').dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    }, index);
    await integrated.locator('#selection-bookmark-pop:not([hidden])').waitFor();
    await integrated.locator('#save-selection-bookmark').click();
    await integrated.waitForFunction(count => window.fixtureBookmarks.length === count && document.querySelectorAll('[data-local-passage-bookmark]').length === count, index + 1);
    await integrated.locator('#resource-article .mermaid-diagram img').waitFor();
  }
  for (const index of [0, 1]) {
    await integrated.locator('[data-local-passage-bookmark]').nth(index).click();
    await integrated.locator('#resource-article .mermaid-diagram img').waitFor();
    await integrated.waitForFunction(() => {
      const mark = document.querySelector('#resource-article mark.bookmark-target');
      if (!mark) return false;
      const box = mark.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight;
    }, null, { timeout: 5000 });
    assert.equal(await integrated.locator('.bookmark-target').textContent(), '같은 문장');
    assert.equal(await integrated.evaluate(() => [...document.querySelectorAll('#resource-article p')].indexOf(document.querySelector('.bookmark-target').closest('p'))), index);
  }
  await integrated.evaluate(() => { history.pushState({}, '', '/read-think-write/archive/2026/'); dispatchEvent(new PopStateEvent('popstate')); });
  await integrated.locator('.archive-article').waitFor({ state: 'attached' });
  assert.equal(await integrated.locator('.archive-body .mermaid-diagram').count(), 0, 'closed archive body is lazy');
  await integrated.evaluate(() => { document.querySelector('.archive-article').parentElement.open = true; document.querySelector('.archive-article').open = true; });
  await integrated.locator('.archive-body .mermaid-diagram img').waitFor();
  assert.deepEqual(integrationErrors, []);
  console.log('Actual main.js: both passage bookmarks saved and revisited; archive toggle renders lazily.');
  await integrated.close();
  for (const mode of ['offline', 'timeout']) {
    const { page: failure } = await pageFor(390, mode);
    await show(failure, '```mermaid\nflowchart LR\nA-->B\n```');
    assert.equal(await failure.locator('pre:not([hidden])[data-mermaid-error]').count(), 1, mode);
    assert.equal(await failure.locator('.mermaid-diagram').count(), 0, mode);
    await failure.close();
  }
  console.log('Mermaid browser checks passed: flowchart/pie/xychart-beta, security, bookmarks, no-load, failures, scroll/dark/print and body scope.');
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
  await rm(temp, { recursive: true, force: true });
}
