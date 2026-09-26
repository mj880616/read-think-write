import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
function mediaBlock(query) {
  const start = styles.indexOf(`${query}{\n`);
  assert.notEqual(start, -1, `missing ${query}`);
  return styles.slice(start, styles.indexOf('\n}', start));
}
const notesPcCss = styles.slice(styles.indexOf('/* PC memo screen'));
assert.match(notesPcCss, /^\/\* PC memo screen[^\n]*\n@media\(min-width:1024px\)\{/);
const beforePc = styles.slice(0, styles.indexOf('/* PC memo screen'));
const tabletCss = mediaBlock('@media(min-width:761px) and (max-width:1023px)');

const mainSource = main.replace(/^import .*;\r?\n/gm, '').split(/\r?\nbindPrimaryTabSwipe\(\);/)[0];

function notesHarness({ notes, createNote } = {}) {
  const callbacks = new Map();
  const writes = [];
  const root = { innerHTML: '', addEventListener() {} };
  const saveButton = { disabled: false, click() { callbacks.get('submit')?.({ preventDefault() {}, currentTarget: form }); } };
  const textarea = { style: {}, addEventListener(type, fn) { callbacks.set('textarea:' + type, fn); } };
  const form = {
    values: { body: '새 메모', note_type: '' },
    addEventListener(type, fn) { callbacks.set(type, fn); },
    querySelector(selector) { return selector === 'button[type="submit"]' ? saveButton : selector === 'textarea' ? textarea : null; }
  };
  const status = { textContent: '', classList: { add() {} } };
  const noop = () => {};
  const document = {
    querySelector(selector) {
      if (selector === '#app') return root;
      if (selector === '#independent-note-form') return form;
      if (selector === '#ind-note-status') return status;
      return null;
    },
    querySelectorAll: () => [],
    addEventListener: noop
  };
  const api = {
    listRelations: async () => [],
    createNote: async (input) => { writes.push(input); await (createNote?.() ?? null); },
    listResources: async () => [], listNotes: async () => notes, listTopics: async () => [], listQuestions: async () => [],
    listBookmarks: async () => [], listNoteTypes: async () => []
  };
  const context = {
    api, document, console, supabase: { auth: { onAuthStateChange: noop } }, location: { pathname: '/app/notes/', search: '' },
    APP_BASE: '/app/', restoreRedirect: noop, window: { addEventListener: noop }, history: { pushState: noop },
    FormData: class { constructor(f) { this.f = f; } *[Symbol.iterator]() { yield* Object.entries(this.f.values); } },
    formatDate: noop, groupResourcesByMonth: () => ({}), matchesQuery: noop, safeHttpUrl: noop,
    DOMPurify: { sanitize: (v) => v }, marked: { parse: (v) => v }, testNotes: notes
  };
  vm.runInNewContext(mainSource + '\nuser = { id: "owner-1", email: "t@example.com" }; dataReadyUserId = user.id; state.notes = globalThis.testNotes; globalThis.ui = { notesView, isSaveShortcut, noteRowText };', context);
  return { root, callbacks, writes, saveButton, ui: context.ui };
}

const sampleNotes = [
  { id: 'plain', body: '첫 줄 제목\n둘째 줄 본문\n셋째 줄', note_type: '생각', resource_id: null, updated_at: '2026-09-20T00:00:00Z' },
  { id: 'title-only', body: '본문 없는 메모', note_type: null, resource_id: null, updated_at: '2026-09-20T00:00:00Z' },
  { id: 'linked', body: '> 인용한 문장\n\n내 생각', note_type: '질문', resource_id: 'resource-1', updated_at: '2026-09-20T00:00:00Z' }
];

test('PC memo screen: fixed composer column, wide list, 1280px max width', () => {
  assert.match(notesPcCss, /\.notes-shell\{max-width:1280px\}/);
  assert.match(notesPcCss, /\.notes-layout\{grid-template-columns:312px minmax\(0,1fr\);[^}]*align-items:start/);
});

test('PC composer sticks just under the header height and scrolls inside instead of being cut off', () => {
  assert.match(notesPcCss, /\.notes-compose\{position:sticky;top:calc\(var\(--header-h\) \+ 16px\);max-height:calc\(100vh - var\(--header-h\) - 32px\);overflow-y:auto/);
});

test('header stickiness is one shared rule for every width, never a per-screen override', () => {
  const shared = styles.slice(styles.indexOf('/* sticky header for every screen width'), styles.indexOf('/* PC and tablet header (>=761px)'));
  assert.notEqual(shared, '', 'shared sticky-header block exists');
  assert.match(shared, /^[^@]*@supports\(overflow:clip\)\{body\{overflow-x:clip\}\}/m, 'body must not become a scroll container at any width');
  assert.match(shared, /html\{scroll-padding-top:calc\(var\(--header-h\) \+ 12px\)\}/, 'anchors and focus targets clear the pinned header');
  assert.match(shared, /\.topbar\{top:var\(--header-top\)\}/);
  assert.match(mediaBlock('@media(min-width:761px)'), /:root\{--header-h:94px;--header-top:0px\}/);
  assert.match(mediaBlock('@media(min-width:1024px)'), /:root\{--header-h:64px\}/);
  assert.match(styles, /\.topbar\{position:sticky;top:0;z-index:10;/);
  assert.match(styles.slice(0, 600), /body\{[^}]*overflow-x:hidden\}/, 'hidden stays as the no-clip fallback');
  assert.equal((styles.match(/overflow-x:clip/g) || []).length, 1, 'exactly one clip rule');
  assert.doesNotMatch(styles, /:has\(\.notes-shell\)|\.notes-shell[^{]*\{[^}]*overflow-x/, 'no memo-only overflow workaround');
  assert.doesNotMatch(styles, /\.topbar\{[^}]*position:(relative|fixed)/, 'no width switches the header off sticky');
});

test('phones (<=760px) pin only the menu row: the first header row is exactly pulled out of view', () => {
  const shared = styles.slice(styles.indexOf('/* sticky header for every screen width'), styles.indexOf('/* PC and tablet header (>=761px)'));
  const root = shared.match(/:root\{--header-h:(\d+)px;--header-top:-(\d+)px\}/);
  assert.ok(root, 'phone defaults for --header-h and --header-top');
  const [, pinned, collapse] = root.map(Number);
  const phoneRow = shared.match(/@media\(max-width:760px\)\{\.topbar\{grid-template-rows:(\d+)px auto\}\.brand\{line-height:(\d+)px\}\}/);
  assert.ok(phoneRow, 'first row height is fixed so the offset does not depend on the font');
  const phoneTopbar = styles.match(/@media\(max-width:760px\)\{[^\n]*?\.topbar\{([^}]*)\}/)[1];
  const [padTop, , padBottom] = phoneTopbar.match(/padding:(\d+)px (\d+)px (\d+)px/).slice(1).map(Number);
  const rowGap = Number(phoneTopbar.match(/gap:(\d+)px/)[1]);
  const navHeight = Number(styles.match(/@media\(max-width:760px\)\{[^\n]*?\.nav a\{min-height:(\d+)px/)[1]);
  assert.equal(Number(phoneRow[1]), Number(phoneRow[2]));
  assert.equal(collapse, padTop + Number(phoneRow[1]) + rowGap, '--header-top hides padding + row 1 + gap, nothing more');
  assert.equal(pinned, navHeight + padBottom + 1, '--header-h is the pinned menu row incl. bottom padding and border');
  assert.match(styles, /@media\(max-width:760px\)\{[^\n]*\.nav\{grid-area:nav;overflow-x:auto;/, 'the pinned menu row still scrolls sideways');
});

test('PC composer is compact: textarea, then type select + type manager on one row, then save', () => {
  assert.match(notesPcCss, /\.notes-compose \.note-compose-type-row\{display:flex;/);
  assert.match(notesPcCss, /\.notes-compose \.note-type-manage-inline\{display:block;/);
  assert.match(notesPcCss, /\.notes-compose \.note-type-manage-bottom\{display:none\}/);
  assert.match(beforePc, /\.note-type-manage-inline\{display:none\}/, 'narrow screens keep the bottom toggle only');
  assert.match(notesPcCss, /textarea\{min-height:96px;max-height:min\(360px,45vh\);resize:none/, 'smaller start height with a growth cap');
});

test('composer Tab order follows DOM order: no CSS order, no positive tabindex, DOM matches the visual sequence', async () => {
  assert.doesNotMatch(notesPcCss, /(^|[;{])order:/m);
  assert.doesNotMatch(main, /tabindex="[1-9]/);
  const h = notesHarness({ notes: [] });
  await h.ui.notesView();
  const html = h.root.innerHTML;
  const at = (needle) => { const i = html.indexOf(needle); assert.notEqual(i, -1, needle); return i; };
  const sequence = ['<textarea name="body"', '<select name="note_type"', 'note-type-manage-inline', 'note-compose-save', 'note-type-manage-bottom', 'id="note-type-manager-panel"'].map(at);
  assert.deepEqual([...sequence].sort((a, b) => a - b), sequence, 'textarea → type → type manager (PC) → save → type manager (narrow) → panel');
  const row = html.slice(at('note-compose-type-row'), at('note-compose-save'));
  assert.match(row, /<select name="note_type"[\s\S]*data-note-type-toggle type="button"/, 'type select and its manager share one row');
  assert.equal((html.match(/data-note-type-toggle/g) || []).length, 2);
  assert.equal((html.match(/aria-controls="note-type-manager-panel"/g) || []).length, 2);
});

test('PC memo filter highlights only the selected chip with a filled accent', () => {
  assert.match(notesPcCss, /\.notes-list \.note-type-filters button\[aria-pressed="true"\]\{background:var\(--accent\);border-color:var\(--accent\);color:#fff\}/);
});

test('screens up to 1023px keep their memo layout; PC row parts are hidden outside the PC block', () => {
  assert.match(beforePc, /\.notes-layout\{display:grid;grid-template-columns:340px 1fr;/);
  assert.match(beforePc, /\.note-row-toggle,\.note-row-type,\.note-row-title,\.note-row-preview,\.note-row-date,\.note-row-chevron,\.note-row-full\{display:none\}/);
  assert.doesNotMatch(tabletCss, /note|notes-/);
  assert.doesNotMatch(beforePc, /\.notes-compose|\.notes-list/);
});

test('memo rows render toggle, type, title, 2-line preview and date, with edit/delete only in the ⋯ menu', async () => {
  const h = notesHarness({ notes: sampleNotes });
  await h.ui.notesView();
  const html = h.root.innerHTML;
  assert.match(html, /class="card notes-compose"/);
  assert.match(html, /class="card notes-list"/);
  assert.match(html, /data-note-record="plain"><summary><span class="note-row-chevron" aria-hidden="true">▸<\/span>[\s\S]*?<span class="note-row-title" title="첫 줄 제목">첫 줄 제목<\/span><span class="note-row-preview">둘째 줄 본문 셋째 줄<\/span><span class="note-row-date">/);
  assert.match(html, /data-note-record="title-only">[\s\S]*?note-row-title[^>]*>본문 없는 메모<\/span><span class="note-row-date">/, 'no empty preview for a memo without body');
  assert.match(html, /<button class="note-row-toggle" data-note-expand="linked" type="button" aria-expanded="false" aria-controls="note-full-linked" aria-label="메모 전체 보기: 내 생각">/);
  assert.match(html, /id="note-full-linked" hidden>/);
  assert.doesNotMatch(html, /note-record-actions|data-note-actions/, 'no separate always-visible action row');
  for (const id of ['plain', 'title-only', 'linked']) {
    const menu = html.match(new RegExp(`<button class="note-menu-button" data-note-menu="${id}"[^>]*>[\\s\\S]*?</div></div>`))?.[0];
    assert.ok(menu, `⋯ menu for ${id}`);
    assert.match(menu, /aria-label="메모 메뉴" aria-haspopup="menu" aria-expanded="false" aria-controls="note-menu-/);
    assert.match(menu, /role="menu"[^>]*hidden>/);
    assert.match(menu, /role="menuitem"[^>]*data-note-(record-)?edit="[^"]+">수정<\/button><button type="button" role="menuitem"[^>]*data-note-delete="[^"]+">삭제/);
  }
});

test('row text uses the first line as title and never leaves an empty title', () => {
  const h = notesHarness({ notes: [] });
  assert.deepEqual({ ...h.ui.noteRowText({ body: '> 인용만 있음' }) }, { title: '인용만 있음', preview: '' });
  assert.deepEqual({ ...h.ui.noteRowText({ body: '> 인용\n\n생각 한 줄' }) }, { title: '생각 한 줄', preview: '인용' });
  assert.equal(h.ui.noteRowText({ body: '' }).title, '내용 없음');
});

test('Ctrl/Cmd+Enter saves, but not while an IME is still composing', () => {
  const { isSaveShortcut } = notesHarness({ notes: [] }).ui;
  assert.equal(isSaveShortcut({ key: 'Enter', ctrlKey: true, isComposing: false, keyCode: 13 }), true);
  assert.equal(isSaveShortcut({ key: 'Enter', metaKey: true, isComposing: false, keyCode: 13 }), true);
  assert.equal(isSaveShortcut({ key: 'Enter', ctrlKey: true, isComposing: true, keyCode: 229 }), false);
  assert.equal(isSaveShortcut({ key: 'Enter', ctrlKey: true, isComposing: false, keyCode: 229 }), false);
  assert.equal(isSaveShortcut({ key: 'Enter', isComposing: false, keyCode: 13 }), false, 'plain Enter keeps inserting a newline');
});

test('Korean composition then Ctrl+Enter saves once, and repeats during a save are ignored', async () => {
  let finish;
  const h = notesHarness({ notes: [], createNote: () => new Promise((resolve) => { finish = resolve; }) });
  await h.ui.notesView();
  const keydown = h.callbacks.get('textarea:keydown');
  const press = (extra) => keydown({ key: 'Enter', ctrlKey: true, keyCode: 13, isComposing: false, preventDefault() {}, ...extra });
  press({ isComposing: true, keyCode: 229 });
  assert.equal(h.writes.length, 0, 'composing keydown is ignored');
  press();
  press();
  h.saveButton.click();
  assert.equal(h.writes.length, 1);
  assert.equal(h.saveButton.disabled, true);
  finish();
});
