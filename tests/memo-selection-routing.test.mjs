import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const handlerStart = main.indexOf("const selectionNoteButton = document.querySelector('#save-selection-note')");
const handlerEnd = main.indexOf("const editCard =", handlerStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'selected-text memo handler must exist');
const handler = main.slice(handlerStart, handlerEnd);

assert.match(handler, /prompt\('선택한 문장에 코멘트를 남길까요\? \(선택 사항\)\\n비워두면 선택한 문장만 메모로 저장됩니다\.'\)/);
assert.match(handler, /if \(!pending \|\| savingSelectionNote\) return;/);
assert.match(handler, /const selection = pending;/);
assert.match(handler, /if \(comment === null\) return;/);
assert.match(handler, /const cleanComment = comment\.trim\(\);/);
assert.match(handler, /const quoteBody = `> \$\{selection\.text\.replace\(\/\\n\/g, '\\n> '\)\}`;/);
assert.match(handler, /selectionNoteButton\.disabled = true;/);
assert.match(handler, /body: cleanComment \? `\$\{quoteBody\}\\n\\n\$\{cleanComment\}` : quoteBody/);
assert.match(handler, /await refreshState\(\)/);
assert.match(handler, /resourceDetailView\(id\)/);

function fallbackTarget(path, locationInput) {
  const html = fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, path + ' must include the SPA fallback script');
  let target = '';
  const context = {
    encodeURIComponent,
    location: {
      hostname: locationInput.hostname,
      pathname: locationInput.pathname,
      search: locationInput.search || '',
      hash: locationInput.hash || '',
      replace(value) { target = value; }
    }
  };
  vm.runInNewContext(script, context);
  return target;
}

for (const path of ['404.html', 'public/404.html']) {
  assert.equal(
    fallbackTarget(path, { hostname: 'read.bokdoong.com', pathname: '/notes/' }),
    '/?redirect=%2Fnotes%2F'
  );
  assert.equal(
    fallbackTarget(path, { hostname: 'read.bokdoong.com', pathname: '/notes/', search: '?note=abc' }),
    '/?redirect=%2Fnotes%2F%3Fnote%3Dabc'
  );
  assert.equal(
    fallbackTarget(path, { hostname: 'mj880616.github.io', pathname: '/read-think-write/notes/' }),
    '/read-think-write/?redirect=%2Fnotes%2F'
  );
}

console.log('selected-text memo save and SPA notes fallback are stable');
