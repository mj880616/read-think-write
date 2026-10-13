import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { Marked } from 'marked';
import { bookmarkSelectionData, locateBookmarkRange } from '../src/bookmark-location.js';

const { window } = new JSDOM('');
globalThis.window = window;
globalThis.document = window.document;
globalThis.DOMParser = window.DOMParser;
window.HTMLImageElement.prototype.decode = async function() { if (this.ownerDocument.body.dataset.failImageDecode) throw new Error('image decode failed'); };

const markdownSource = readFileSync(new URL('../src/markdown.js', import.meta.url), 'utf8')
  .replace("import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/+esm';", `import createDOMPurify from '${import.meta.resolve('dompurify')}'; const DOMPurify = createDOMPurify(window);`)
  .replace('https://cdn.jsdelivr.net/npm/marked@16.2.1/lib/marked.esm.js', import.meta.resolve('marked'));
const { renderMarkdown } = await import(`data:text/javascript;base64,${Buffer.from(markdownSource).toString('base64')}`);

const fake = `globalThis.mermaidLoads++; export default {
 initialize(config) { globalThis.mermaidConfig = config; },
 async render(id, text) {
   if (text.includes('HANG')) return new Promise(() => {});
   if (text.includes('ERROR')) throw new Error('syntax error');
   if (text.includes('SLOW')) await new Promise(resolve => setTimeout(resolve, 80));
   return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 100"><script>alert(1)</script><foreignObject>bad</foreignObject><a href="javascript:alert(1)"><text onerror="alert(1)">safe</text></a><rect width="900" height="100"/></svg>' };
 }
};`;
async function renderer(importBody = fake) {
  globalThis.mermaidLoads = 0;
  const source = readFileSync(new URL('../src/mermaid.js', import.meta.url), 'utf8')
    .replace("import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/+esm';", `import createDOMPurify from '${import.meta.resolve('dompurify')}'; const DOMPurify = createDOMPurify(window);`)
    .replace(/https:\/\/cdn.jsdelivr.net\/npm\/mermaid@[^']+/, `data:text/javascript;base64,${Buffer.from(importBody + `\n// ${Math.random()}`).toString('base64')}`)
    .replaceAll('20_000', '40');
  return (await import(`data:text/javascript;base64,${Buffer.from(source + `\n// ${Math.random()}`).toString('base64')}`)).renderMermaidBlocks;
}
function article(md) {
  const node = document.createElement('article');
  node.innerHTML = renderMarkdown(md, { mermaid: true });
  document.body.replaceChildren(node);
  return node;
}
function nodes(root) {
  const result = [], walker = document.createTreeWalker(root, window.NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) result.push(walker.currentNode);
  return result;
}
test('loads only for Mermaid and preserves other code blocks', async () => {
  const render = await renderer();
  const plain = article('text\n\n```js\nconsole.log(1)\n```');
  const original = plain.innerHTML;
  await render(plain);
  assert.equal(mermaidLoads, 0);
  assert.equal(plain.innerHTML, original);
  const body = article('```mermaid\nflowchart LR\nA-->B\n```\n\n```js\nconsole.log(1)\n```');
  await render(body);
  assert.equal(body.querySelectorAll('.mermaid-diagram img').length, 1);
  assert.ok(body.querySelector('.mermaid-diagram').hasAttribute('data-swipe-ignore'), 'horizontal diagram gestures must not trigger tab swipes');
  assert.equal(body.querySelector('code.language-js').parentElement.hidden, false);
  await render(body);
  assert.equal(body.querySelectorAll('.mermaid-diagram').length, 1);
  assert.equal(mermaidLoads, 1);
});
test('strict configuration and SVG profile remove active content', async () => {
  const render = await renderer();
  const body = article('```mermaid\nflowchart LR\nA-->B\n```');
  await render(body);
  assert.equal(mermaidConfig.securityLevel, 'strict');
  assert.equal(mermaidConfig.htmlLabels, false);
  const img = body.querySelector('.mermaid-diagram img');
  assert.ok(img);
  const svg = decodeURIComponent(img.src.split(',')[1]);
  const parsed = new window.DOMParser().parseFromString(svg, 'image/svg+xml');
  assert.equal(parsed.querySelectorAll('script, foreignObject, [onerror], [href^="javascript:"]').length, 0);
  assert.ok(parsed.querySelector('rect'));
});
for (const mode of ['ERROR', 'HANG', 'SLOW', 'load failure', 'load timeout']) {
  test(`${mode}: retains original code with a small notice, including late completion`, async () => {
    const render = await renderer(mode === 'load failure' ? 'throw new Error("offline")' : mode === 'load timeout' ? 'await new Promise(() => {});' : fake);
    const body = article(`before\n\n\`\`\`mermaid\n${mode}\n\`\`\`\n\nafter`);
    const before = body.textContent;
    const pre = body.querySelector('pre');
    await render(body);
    assert.equal(pre.hidden, false);
    assert.equal(body.textContent, before);
    assert.ok(pre.getAttribute('data-mermaid-error'));
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(body.querySelectorAll('.mermaid-diagram').length, 0);
    assert.equal(document.querySelectorAll('.mermaid-render-host').length, 0);
  });
}
test('bookmarks before and after a diagram retain offsets and resolve on revisit', async () => {
  const render = await renderer();
  const md = 'same sentence\n\n```mermaid\nflowchart LR\nA-->B\n```\n\nsame sentence';
  const body = article(md), original = body.textContent;
  const saved = [original.indexOf('same sentence'), original.lastIndexOf('same sentence')].map(start => bookmarkSelectionData(original, 'same sentence', original.slice(0, start), original.slice(0, start + 13), 'same sentence'));
  await render(body);
  assert.equal(body.textContent, original);
  for (const bookmark of saved) {
    const range = locateBookmarkRange(nodes(body), { selected_text: bookmark.text, start_offset: bookmark.start, context_before: bookmark.contextBefore, context_after: bookmark.contextAfter });
    assert.ok(range);
    assert.equal(range.startNode.parentElement.tagName, 'P');
    assert.equal(range.startNode, bookmark.start === 0 ? body.querySelector('p').firstChild : body.querySelectorAll('p')[1].firstChild);
  }
  const revisited = article(md);
  for (const bookmark of saved) assert.ok(locateBookmarkRange(nodes(revisited), { selected_text: bookmark.text, start_offset: bookmark.start }));
});
test('navigation during rendering does not mutate a detached article', async () => {
  const render = await renderer();
  const body = article('```mermaid\nSLOW\n```');
  const pending = render(body);
  body.remove();
  await pending;
  assert.equal(body.querySelectorAll('.mermaid-diagram').length, 0);
});

test('raw HTML code blocks and tilde fences stay as code, without Mermaid requests', async () => {
  const render = await renderer();
  const body = article('<pre data-mermaid-code><code class="language-mermaid">flowchart LR\nA-->B</code></pre>\n\n~~~mermaid\nflowchart LR\nA-->B\n~~~');
  await render(body);
  assert.equal(mermaidLoads, 0);
  assert.equal(body.querySelectorAll('pre[hidden], .mermaid-diagram').length, 0);
});

test('SVG image decoding failure retains the source code', async () => {
  const render = await renderer();
  const body = article('```mermaid\nflowchart LR\nA-->B\n```');
  document.body.dataset.failImageDecode = 'yes';
  try {
    await render(body);
    assert.equal(body.querySelector('pre').hidden, false);
    assert.ok(body.querySelector('pre').dataset.mermaidError);
    assert.equal(body.querySelectorAll('.mermaid-diagram').length, 0);
  } finally { delete document.body.dataset.failImageDecode; }
});
