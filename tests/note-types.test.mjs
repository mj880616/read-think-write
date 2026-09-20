import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .split(/\r?\nbindPrimaryTabSwipe\(\);/)[0];
const apiSource = readFileSync(new URL('../src/api.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/^export /gm, '');

function apiHarness() {
  const writes = [];
  const supabase = {
    async rpc(name, args) { writes.push({ operation: 'rpc', name, args }); return { data: 2, error: null }; },
    from(table) {
      const chain = {
        insert(row) { writes.push({ table, operation: 'insert', row }); return chain; },
        update(row) { writes.push({ table, operation: 'update', row }); return chain; },
        eq() { return chain; },
        select() { return chain; },
        async single() { return { data: { id: 'note-1' }, error: null }; }
      };
      return chain;
    }
  };
  const context = { supabase, localStorage: {}, console };
  vm.runInNewContext(apiSource + '\nglobalThis.noteApi = { createNote, updateNote, renameNoteType, deleteNoteType };', context);
  return { writes, api: context.noteApi };
}

function uiHarness(noteTypes = [], createError = null, updateError = null, options = {}) {
  const callbacks = new Map();
  const writes = [];
  const logs = [];
  const alerts = [];
  const confirms = [];
  const initialNotes = options.notes ?? [{ id: 'note-1', body: '기존 본문', note_type: '기억할 것', resource_id: null, updated_at: '2026-09-20T00:00:00Z' }];
  const filterButtons = (options.filters ?? []).map((value) => ({
    dataset: { noteFilter: value },
    attributes: {},
    addEventListener(type, callback) { callbacks.set('filter:' + value + ':' + type, callback); },
    setAttribute(name, value) { this.attributes[name] = value; }
  }));
  const filterItems = initialNotes.map((note) => ({ dataset: { noteType: note.note_type || '' }, hidden: false }));
  const filterEmpty = { hidden: true, textContent: '' };
  let noteReads = 0;
  let relationReads = 0;
  let deleted = false;
  const status = { textContent: '', classList: { add() {}, remove() {} } };
  const editStatus = { textContent: '', classList: { add() {}, remove() {} } };
  const newForm = { addEventListener(type, callback) { callbacks.set('new:' + type, callback); } };
  const editForm = {
    dataset: { noteEditForm: 'note-1' },
    addEventListener(type, callback) { callbacks.set('edit:' + type, callback); },
    querySelector(selector) {
      return selector === 'textarea' ? { value: '바뀐 본문' } : selector === '.status' ? editStatus : null;
    }
  };
  const deleteButton = {
    dataset: { noteDelete: 'note-1' },
    addEventListener(type, callback) { callbacks.set('delete:' + type, callback); }
  };
  const typeDeleteButton = {
    dataset: { deleteNoteType: noteTypes[0]?.id },
    addEventListener(type, callback) { callbacks.set('type-delete:' + type, callback); }
  };
  const renameForm = {
    dataset: { noteTypeRename: noteTypes[0]?.id },
    values: { name: '다시 볼 것' },
    addEventListener(type, callback) { callbacks.set('type-rename:' + type, callback); }
  };
  const root = { innerHTML: '', addEventListener() {} };
  const api = {
    listRelations: async () => { relationReads += 1; return []; },
    createNote: async (input) => {
      writes.push({ operation: 'create', input });
      if (createError instanceof Error) throw createError;
      if (createError) await createError;
    },
    updateNote: async (...args) => { writes.push({ operation: 'update', args }); if (updateError) throw updateError; },
    deleteNote: async (id) => { writes.push({ operation: 'delete', id }); deleted = true; },
    deleteNoteType: async (id) => { writes.push({ operation: 'delete-type', id }); if (options.deleteTypeError) throw options.deleteTypeError; },
    renameNoteType: async (id, name) => {
      writes.push({ operation: 'rename-type', id, name });
      const type = noteTypes.find((item) => item.id === id);
      for (const note of initialNotes) if (note.note_type === type.name) note.note_type = name;
      type.name = name;
    },
    listResources: async () => [],
    listNotes: async () => { noteReads += 1; return deleted ? [] : initialNotes; },
    listTopics: async () => [],
    listQuestions: async () => [],
    listBookmarks: async () => [],
    listNoteTypes: async () => noteTypes
  };
  const noop = () => {};
  const document = {
    querySelector(selector) {
      if (selector === '#app') return root;
      if (selector === '#independent-note-form') return newForm;
      if (selector === '#ind-note-status') return status;
      if (selector === '#note-filter-empty') return filterEmpty;
      return { addEventListener: noop };
    },
    querySelectorAll(selector) {
      if (selector === '[data-note-edit-form]') return [editForm];
      if (selector === '[data-note-delete]') return [deleteButton];
      if (selector === '[data-note-filter]') return filterButtons;
      if (selector === '[data-note-list-item]') return filterItems;
      if (selector === '[data-delete-note-type]') return noteTypes.length ? [typeDeleteButton] : [];
      if (selector === '[data-note-type-rename]') return noteTypes.length ? [renameForm] : [];
      return [];
    },
    addEventListener: noop
  };
  const context = {
    api, document, console: { error: (...args) => logs.push(args) }, supabase: { auth: { onAuthStateChange: noop } }, location: { pathname: '/app/notes/', search: '' },
    APP_BASE: '/app/', restoreRedirect: noop, window: { addEventListener: noop },
    FormData: class {
      constructor(form) { this.form = form; }
      get(key) { return this.form.values?.[key] ?? null; }
      *[Symbol.iterator]() { yield* Object.entries(this.form.values ?? {}); }
    },
    history: { pushState: noop }, confirm: (message) => { confirms.push(message); return true; }, alert: (message) => alerts.push(message),
    formatDate: noop, groupResourcesByMonth: () => ({}), matchesQuery: noop, safeHttpUrl: noop,
    DOMPurify: { sanitize: (value) => value }, marked: { parse: (value) => value }
  };
  context.testTypes = noteTypes;
  context.testNotes = initialNotes;
  vm.runInNewContext(mainSource + '\nuser = { id: "owner-1", email: "test@example.com" }; dataReadyUserId = user.id; state.notes = globalThis.testNotes; state.noteTypes = globalThis.testTypes; globalThis.noteUi = { notesView, noteTypeOptions, setAuthUser, get selectedNoteTypeFilter() { return selectedNoteTypeFilter; } };', context);
  return { root, callbacks, writes, logs, alerts, confirms, status, editStatus, newForm, editForm, renameForm, filterButtons, filterItems, filterEmpty, get noteReads() { return noteReads; }, get relationReads() { return relationReads; }, ui: context.noteUi };
}

test('the memo tab and page header use one clear name, and note types appear as quiet metadata', async () => {
  const notes = [
    { id: 'plain', body: '유형 없는 메모', note_type: null, resource_id: null, updated_at: '2026-09-20T00:00:00Z' },
    { id: 'typed', body: '기억할 메모', note_type: '기억할 것', resource_id: null, updated_at: '2026-09-20T00:00:00Z' },
    { id: 'linked', body: '읽기에 연결된 메모', note_type: '생각', resource_id: 'resource-1', updated_at: '2026-09-20T00:00:00Z' }
  ];
  const h = uiHarness([{ id: 'type-1', name: '기억할 것' }], null, null, { notes });
  await h.ui.notesView();
  assert.match(h.root.innerHTML, />메모<\/a>/);
  assert.doesNotMatch(h.root.innerHTML, />생각<\/a>/);
  assert.doesNotMatch(h.root.innerHTML, /class="eyebrow">생각<\/div><h1>메모/);
  assert.match(h.root.innerHTML, /class="hero memo-hero"><h1>메모<\/h1><p>기록하고, 연결한다\.<\/p>/);
  assert.match(h.root.innerHTML, /data-note-record="typed"[\s\S]*note-type-badge[\s\S]*기억할 것/);
  assert.match(h.root.innerHTML, /data-note-item="linked"[\s\S]*note-type-badge[\s\S]*생각/);
  assert.doesNotMatch(h.root.innerHTML, /data-note-record="plain"[\s\S]*유형 없음<\/span>/);
});

test('memo type filter includes linked and untyped notes without reloading data', async () => {
  const notes = [
    { id: 'plain', body: '유형 없음', note_type: null, resource_id: null, updated_at: '2026-09-20T00:00:00Z' },
    { id: 'custom', body: '기억할 것', note_type: '기억할 것', resource_id: null, updated_at: '2026-09-20T00:00:00Z' },
    { id: 'linked', body: '읽기 메모', note_type: '생각', resource_id: 'resource-1', updated_at: '2026-09-20T00:00:00Z' }
  ];
  const h = uiHarness([{ id: 'type-1', name: '기억할 것' }], null, null, { notes, filters: ['', '기억할 것', '생각'] });
  await h.ui.notesView();
  assert.match(h.root.innerHTML, /data-swipe-ignore[^>]*aria-label="메모 유형 필터"/);
  assert.match(h.root.innerHTML, /data-note-filter="기억할 것"/);
  assert.match(h.root.innerHTML, /data-note-item="linked"/);
  const before = { notes: h.noteReads, relations: h.relationReads };
  h.callbacks.get('filter:기억할 것:click')();
  assert.deepEqual(h.filterItems.map((item) => item.hidden), [true, false, true]);
  h.callbacks.get('filter:생각:click')();
  assert.deepEqual(h.filterItems.map((item) => item.hidden), [true, true, false]);
  h.callbacks.get('filter::click')();
  assert.deepEqual(h.filterItems.map((item) => item.hidden), [false, false, false]);
  assert.deepEqual({ notes: h.noteReads, relations: h.relationReads }, before);
});

test('memo filter selection clears at the user boundary', async () => {
  const h = uiHarness([], null, null, { filters: ['', '기억할 것'] });
  await h.ui.notesView();
  h.callbacks.get('filter:기억할 것:click')();
  assert.equal(h.ui.selectedNoteTypeFilter, '기억할 것');
  h.ui.setAuthUser({ id: 'owner-2', email: 'other@example.com' });
  assert.equal(h.ui.selectedNoteTypeFilter, '');
});

test('renaming a custom type uses one owner-scoped database operation', async () => {
  const { api, writes } = apiHarness();
  await api.renameNoteType('type-1', '  다시 볼 것  ');
  assert.equal(writes[0].operation, 'rpc');
  assert.equal(writes[0].name, 'rtw_rename_note_type');
  assert.equal(writes[0].args.p_type_id, 'type-1');
  assert.equal(writes[0].args.p_new_name, '다시 볼 것');
});

test('type deletion asks the database to reject types still in use', async () => {
  const { api, writes } = apiHarness();
  await api.deleteNoteType('type-1');
  assert.equal(writes[0].operation, 'rpc');
  assert.equal(writes[0].name, 'rtw_delete_note_type_if_unused');
  assert.equal(writes[0].args.p_type_id, 'type-1');
});

test('a type in use cannot be deleted and keeps its note metadata', async () => {
  const h = uiHarness([{ id: 'type-1', name: '기억할 것' }]);
  await h.ui.notesView();
  await h.callbacks.get('type-delete:click')();
  assert.equal(h.writes.some((write) => write.operation === 'delete-type'), false);
  assert.match(h.alerts[0], /사용 중인 메모/);
  assert.match(h.root.innerHTML, /기억할 것/);
});

test('an unused custom type asks before deletion', async () => {
  const h = uiHarness([{ id: 'type-1', name: '사용 안 함' }]);
  await h.ui.notesView();
  await h.callbacks.get('type-delete:click')();
  assert.match(h.confirms[0], /사용 안 함/);
  assert.deepEqual(h.writes.filter((write) => write.operation === 'delete-type'), [{ operation: 'delete-type', id: 'type-1' }]);
});

test('a concurrent memo assignment keeps its type when deletion is rejected by the database', async () => {
  const h = uiHarness([{ id: 'type-1', name: '사용 안 함' }], null, null, { deleteTypeError: { code: '23503', message: 'internal table detail' } });
  await h.ui.notesView();
  await h.callbacks.get('type-delete:click')();
  assert.match(h.alerts[0], /사용 중인 메모/);
  assert.doesNotMatch(h.alerts[0], /internal table detail/);
  assert.match(h.root.innerHTML, /사용 안 함/);
});

test('renaming a custom type updates the saved memo label on screen', async () => {
  const h = uiHarness([{ id: 'type-1', name: '기억할 것' }]);
  await h.ui.notesView();
  h.renameForm.values = { name: '다시 볼 것' };
  await h.callbacks.get('type-rename:submit')({ preventDefault() {} });
  assert.deepEqual(h.writes.filter((write) => write.operation === 'rename-type'), [{ operation: 'rename-type', id: 'type-1', name: '다시 볼 것' }]);
  assert.match(h.root.innerHTML, /note-type-badge[^>]*>다시 볼 것<\/span>/);
});

test('a memo list with no notes keeps the full filter and shows an empty state', async () => {
  const h = uiHarness([], null, null, { notes: [], filters: [''] });
  await h.ui.notesView();
  assert.match(h.root.innerHTML, /data-note-filter=""/);
  assert.equal(h.filterEmpty.hidden, false);
  assert.equal(h.filterEmpty.textContent, '메모가 아직 없음');
});

test('new notes send null for no type and the selected custom type for a named choice', async () => {
  const { api, writes } = apiHarness();
  await api.createNote({ body: '  본문  ', note_type: '' }, 'owner-1');
  await api.createNote({ body: '본문', note_type: '기억할 것' }, 'owner-1');
  assert.equal(writes[0].row.note_type, null);
  assert.equal(writes[1].row.note_type, '기억할 것');
});

test('existing note updates persist both its body and selected type', async () => {
  const { api, writes } = apiHarness();
  await api.updateNote('note-1', '  바뀐 본문  ', '질문');
  await api.updateNote('note-1', '바뀐 본문', '');
  assert.equal(writes[0].row.body, '바뀐 본문');
  assert.equal(writes[0].row.note_type, '질문');
  assert.equal(writes[1].row.note_type, null);
});

test('note editor offers saved custom type even after it is removed from type management', async () => {
  const { root, ui } = uiHarness();
  await ui.notesView();
  assert.match(root.innerHTML, /data-note-edit-form="note-1"[\s\S]*name="note_type"/);
  assert.match(root.innerHTML, /<option value="기억할 것" selected>기억할 것<\/option>/);
});

test('new and existing note forms pass their chosen type and hide raw database errors', async () => {
  const h = uiHarness([{ id: 'type-1', name: '기억할 것' }]);
  await h.ui.notesView();
  h.newForm.values = { body: '새 본문', note_type: '기억할 것' };
  await h.callbacks.get('new:submit')({ preventDefault() {}, currentTarget: h.newForm });
  assert.equal(h.writes[0].input.note_type, '기억할 것');
  assert.match(h.root.innerHTML, /기억할 것/);
  h.editForm.values = { note_type: '질문' };
  await h.callbacks.get('edit:submit')({ preventDefault() {}, currentTarget: h.editForm });
  assert.equal(h.writes[1].args[2], '질문');
  const failure = uiHarness([], new Error('new row for relation "rtw_notes" violates check constraint "rtw_notes_note_type_check"'));
  await failure.ui.notesView();
  failure.newForm.values = { body: '새 본문', note_type: '기억할 것' };
  await failure.callbacks.get('new:submit')({ preventDefault() {}, currentTarget: failure.newForm });
  assert.equal(failure.status.textContent, '메모를 저장하지 못했습니다. 다시 시도해주세요.');
  assert.match(failure.logs[0][1].message, /rtw_notes_note_type_check/);
  const editFailure = uiHarness([], null, new Error('relation rtw_notes failed'));
  await editFailure.ui.notesView();
  editFailure.editForm.values = { note_type: '질문' };
  await editFailure.callbacks.get('edit:submit')({ preventDefault() {}, currentTarget: editFailure.editForm });
  assert.equal(editFailure.editStatus.textContent, '메모를 저장하지 못했습니다. 다시 시도해주세요.');
  assert.match(editFailure.logs[0][1].message, /rtw_notes/);
});

test('deleting a note refreshes the list without leaving a stale record', async () => {
  const h = uiHarness();
  await h.ui.notesView();
  await h.callbacks.get('delete:click')();
  assert.equal(h.writes[0].operation, 'delete');
  assert.doesNotMatch(h.root.innerHTML, /data-note-record="note-1"/);
});

test('a failed save from the previous user cannot show its error in the next user view', async () => {
  let rejectSave;
  const pending = new Promise((_, reject) => { rejectSave = reject; });
  const h = uiHarness([], pending);
  await h.ui.notesView();
  h.newForm.values = { body: 'old user note', note_type: '기억할 것' };
  const saving = h.callbacks.get('new:submit')({ preventDefault() {}, currentTarget: h.newForm });
  h.ui.setAuthUser({ id: 'owner-2', email: 'other@example.com' });
  rejectSave(new Error('rtw_notes internal error'));
  await saving;
  assert.equal(h.logs.length, 0);
  assert.doesNotMatch(h.root.innerHTML, /rtw_notes/);
});
