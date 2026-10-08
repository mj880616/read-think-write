import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { marked } from 'marked';

const { window } = new JSDOM('');
const DOMPurify = createDOMPurify(window);
globalThis.window = window;
globalThis.document = window.document;

// Load the actual browser module with the same pinned libraries, offline.
const sharedUrl = new URL('../src/markdown.js', import.meta.url);
const source = readFileSync(sharedUrl, 'utf8')
  .replace("import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/+esm';", `import createDOMPurify from '${import.meta.resolve('dompurify')}'; const DOMPurify = createDOMPurify(window);`)
  .replace('https://cdn.jsdelivr.net/npm/marked@16.2.1/lib/marked.esm.js', import.meta.resolve('marked'));
const { renderMarkdown } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function rendererFor(file) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
  assert.match(source, /import \{ renderMarkdown \} from '\.\/markdown\.js';/);
  assert.doesNotMatch(source, /function renderMarkdown|import .*DOMPurify|import .*marked/);
  return renderMarkdown;
}

function dom(html) {
  const element = window.document.createElement('div');
  element.innerHTML = html;
  return element;
}

const table = '| 항목 | 비율 |\n| --- | ---: |\n| 코어 | 65~70% |';
for (const file of ['main.js', 'records-ui.js']) {
  const render = rendererFor(file);
  test(`${file}: percentage ranges stay inside one strong with literal tildes`, () => {
    const result = dom(render('**코어 65~70% + 성장 위성자산 30~35%**로'));
    assert.equal(result.querySelectorAll('strong').length, 1);
    assert.equal(result.querySelectorAll('del').length, 0);
    assert.equal(result.querySelector('strong').textContent, '코어 65~70% + 성장 위성자산 30~35%');
    assert.equal(result.textContent.trim(), '코어 65~70% + 성장 위성자산 30~35%로');
    assert.equal(result.textContent.match(/~/g).length, 2);
  });
  test(`${file}: punctuation before closing strong works with adjacent CJK`, () => {
    for (const suffix of ['임', '漢', 'は', 'カ', '𠀀']) {
      assert.equal(dom(render(`**34%**${suffix}`)).innerHTML, `<p><strong>34%</strong>${suffix}</p>\n`);
    }
    assert.equal(dom(render('**값!**은 **값?**도')).querySelectorAll('strong').length, 2);
  });
  test(`${file}: regular strong and double-tilde deletion keep working`, () => {
    for (const input of ['**34%** 임', '**굵게**', '**bold**English', '~~취소선~~', '65~70%', '`**34%**임 65~70%`', '\\**34%**임', '**미완성', '** 끝%**임', '**끝% **임']) {
      assert.equal(render(input), DOMPurify.sanitize(marked.parse(input)), input);
    }
    assert.equal(dom(render('~취소선 아님~')).querySelectorAll('del').length, 0);
    assert.equal(dom(render('~평문~와 ~~취소선~~')).querySelector('del').textContent, '취소선');
  });
  test(`${file}: nested inline markup, escapes and masked code stay intact`, () => {
    const result = dom(render('**a `b**한` c%**임 **[34%](https://example.test)**임 **34\\%**임'));
    assert.equal(result.querySelectorAll('strong').length, 3);
    assert.equal(result.querySelector('code').textContent, 'b**한');
    assert.equal(result.querySelector('strong a').textContent, '34%');
    assert.equal(result.querySelector('strong a').getAttribute('href'), 'https://example.test');
    assert.equal(result.textContent.trim(), 'a b**한 c%임 34%임 34%임');
    assert.equal(dom(render('```\n**34%**임 65~70%\n```')).querySelectorAll('strong, del').length, 0);
  });
  test(`${file}: punctuation before opening strong and nested strong stay intact`, () => {
    for (const input of ['(**굵게**)', '!**漢**', '**outer (**한**) text**', '**앞!**임', '(**34%**임)']) {
      const result = dom(render(input));
      assert.ok(result.querySelector('strong'), input);
      assert.equal(result.querySelectorAll('em').length, 0, input);
      if (!input.includes('**임')) assert.equal(result.innerHTML, DOMPurify.sanitize(marked.parse(input)), input);
    }
    const result = dom(render('**텍스트 (**한**) 34%**임'));
    assert.equal(result.querySelector('strong > strong').textContent, '한');
    assert.equal(result.querySelector('strong').textContent, '텍스트 (한) 34%');
    assert.equal(result.textContent.trim(), '텍스트 (한) 34%임');
    const nested = dom(render('**outer (**한!**임) 34%**임'));
    assert.equal(nested.querySelector('strong > strong').textContent, '한!');
    assert.equal(nested.querySelector('strong').textContent, 'outer (한!임) 34%');
    assert.equal(nested.textContent.trim(), 'outer (한!임) 34%임');
    const adjacent = dom(render('**34%**임**35%**임'));
    assert.deepEqual([...adjacent.querySelectorAll('strong')].map((item) => item.textContent), ['34%', '35%']);
    assert.equal(adjacent.textContent.trim(), '34%임35%임');
  });
  test(`${file}: headings, lists, quotes, tables and links match existing output`, () => {
    const input = '# 제목\n\n- 첫째\n- 둘째\n\n> 인용\n\n' + table + '\n\n[링크](https://example.test)';
    const result = dom(render(input));
    // Only the table container may differ; the table itself keeps marked's HTML.
    for (const wrapper of result.querySelectorAll('.markdown-table-scroll')) wrapper.replaceWith(...wrapper.childNodes);
    assert.equal(result.innerHTML, DOMPurify.sanitize(marked.parse(input)));
  });
  test(`${file}: Markdown and raw HTML tables receive scroll containers`, () => {
    for (const input of [table, '<table><tr><td>본문</td></tr></table>']) {
      const result = dom(render(input));
      assert.equal(result.querySelectorAll('.markdown-table-scroll > table').length, 1);
      assert.equal(result.querySelectorAll('table').length, 1);
    }
  });
  test(`${file}: scripts, event handlers and dangerous links are still sanitized`, () => {
    const result = dom(render('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[위험](javascript:alert(1))\n\n<table onclick="alert(1)"><tr><td>안전</td></tr></table>'));
    assert.equal(result.querySelectorAll('script, [onerror], [onclick], [href^="javascript:"]').length, 0);
    assert.equal(result.querySelector('td').textContent, '안전');
  });
}
