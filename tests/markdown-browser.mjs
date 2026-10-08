import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = new URL('../', import.meta.url);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  try {
    let body;
    let type = 'text/javascript';
    if (path === '/') {
      type = 'text/html';
      body = '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><div class="shell"><div class="page"><article class="article"></article><article class="archive-body"></article><div class="card"><div class="record-markdown"></div><div class="writing-context-body"></div></div></div></div>';
    } else if (path === '/styles.css') {
      type = 'text/css';
      body = await readFile(new URL('src/styles.css', repo));
    } else if (path === '/markdown.js') {
      body = (await readFile(new URL('src/markdown.js', repo), 'utf8'))
        .replace('https://cdn.jsdelivr.net/npm/marked@16.2.1/lib/marked.esm.js', '/marked.js')
        .replace('https://cdn.jsdelivr.net/npm/dompurify@3.2.6/+esm', '/dompurify.js');
    } else if (path === '/marked.js' || path === '/dompurify.js') {
      body = await readFile(fileURLToPath(import.meta.resolve(path === '/marked.js' ? 'marked' : 'dompurify')));
    } else { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }).end(body);
  } catch { response.writeHead(500).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  for (const width of [320, 390, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const { renderMarkdown } = await import('/markdown.js');
      const wideTable = '| 항목 | 첫째 | 둘째 | 셋째 |\n| --- | --- | --- | --- |\n| 코어 | ' + Array(3).fill('LongUnbrokenTableContent1234567890').join(' | ') + ' |';
      for (const element of document.querySelectorAll('.article, .archive-body, .record-markdown, .writing-context-body')) {
        element.innerHTML = renderMarkdown('**코어 65~70% + 성장 위성자산 30~35%**로 **34%**임\n\n~~취소선~~\n\n' + wideTable + '\n\n<script>alert(1)</script><img src=x onerror="alert(1)">');
      }
    });
    for (const textScale of [1, 2]) {
      if (textScale === 2) await page.evaluate(() => {
        const elements = [...document.querySelectorAll('body *')];
        const sizes = elements.map((element) => parseFloat(getComputedStyle(element).fontSize));
        elements.forEach((element, index) => { element.style.fontSize = `${sizes[index] * 2}px`; });
      });
      const result = await page.evaluate(() => ({
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
        strong: document.querySelectorAll('strong').length,
        del: document.querySelectorAll('del').length,
        unsafe: document.querySelectorAll('script, [onerror]').length,
        tables: [...document.querySelectorAll('.markdown-table-scroll')].map((element) => {
          const box = element.getBoundingClientRect();
          element.scrollLeft = 100;
          return { left: box.left, right: box.right, overflow: element.scrollWidth - element.clientWidth, scrolled: element.scrollLeft, style: getComputedStyle(element).overflowX };
        })
      }));
      assert.equal(result.strong, 8);
      assert.equal(result.del, 4);
      assert.equal(result.unsafe, 0);
      assert.equal(result.tables.length, 4);
      assert.ok(result.pageOverflow <= 1, `${width}/${textScale}: page overflow`);
      for (const table of result.tables) {
        assert.equal(table.style, 'auto');
        assert.ok(table.left >= 0 && table.right <= width + 1, `${width}/${textScale}: table wrapper fits viewport`);
        if (width <= 390) {
          assert.ok(table.overflow > 0, 'wide mobile table overflows inside wrapper');
          assert.ok(table.scrolled > 0, 'wide mobile table can scroll horizontally');
        }
      }
      assert.deepEqual(errors, []);
    }
    await page.close();
  }
  console.log('Markdown and sanitized tables passed at 320/390/768/1280px, 100%/200% text, in all four body containers.');
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
