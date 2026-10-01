import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { chromium } from 'playwright';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const itemSource = source.slice(source.indexOf('function empty('), source.indexOf('function bindResourceBookmarkButtons'));
const sectionSource = source.slice(source.indexOf('function recentQueryWindow('), source.indexOf('function readListView()'));
const now = Date.now();
const resources = Array.from({ length: 10 }, (_, index) => ({
  id: String(index), title: `길게 확대한 새 글 제목 ${'가나다라마바사'.repeat(12)}`,
  created_at: new Date(now - index * 60000).toISOString(), published_on: '2020-01-01'
}));
const context = {
  state: { recentResources: resources, recentCount: 11, bookmarks: [] },
  location: { search: '' }, URLSearchParams, Date, Intl,
  esc: (value) => value, href: (value) => value, formatDate: (value) => value
};
vm.runInNewContext(`${itemSource}\n${sectionSource}\nglobalThis.section = recentSectionHtml();`, context);
const markup = `<div class="shell read-list-shell"><main class="page">
  <section class="hero"><h1>읽은 글</h1></section>${context.section}
  <div class="grid"><section class="card"><h2>자료</h2></section></div>
</main></div>`;

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const width of [320, 390, 768, 1280]) {
    for (const fontSize of [16, 32]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(markup);
      await page.addStyleTag({ content: css + `\n:root{font-size:${fontSize}px}` });
      const geometry = await page.evaluate(() => {
        const section = document.querySelector('.recent-resources-section').getBoundingClientRect();
        const grid = document.querySelector('.grid').getBoundingClientRect();
        const first = document.querySelector('.recent-resources-section .item').getBoundingClientRect();
        const last = document.querySelector('.recent-resources-section .item:last-of-type').getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth - innerWidth,
          sectionLeft: section.left, sectionRight: section.right, sectionBottom: section.bottom,
          gridTop: grid.top, firstRight: first.right, lastRight: last.right };
      });
      assert.ok(geometry.overflow <= 1, `${width}px/${fontSize}px horizontal overflow: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.sectionBottom <= geometry.gridTop, `${width}px/${fontSize}px section precedes list`);
      assert.ok(geometry.firstRight <= geometry.sectionRight && geometry.lastRight <= geometry.sectionRight,
        `${width}px/${fontSize}px cards fit section`);
      await page.close();
    }
  }
  console.log('recent section fits phone, tablet, desktop and 200% text size');
} finally {
  await browser.close();
}
