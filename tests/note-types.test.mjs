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
  vm.runInNewContext(apiSource + '\nglobalThis.noteApi = { createNote, updateNote };', context);
  return { writes, api: context.noteApi };
}

function uiHarness(noteTypes = [], createError = null, updateError = null) {
  const callbacks = new Map();
  const writes = [];
  const logs = [];
  const alerts = [];
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
  const root = { innerHTML: '', addEventListener() {} };
  const api = {
    listRelations: async () => [],
    createNote: async (input) => {
      writes.push({ operation: 'create', input });
      if (createError instanceof Error) throw createError;
      if (createError) await createError;
    },
    updateNote: async (...args) => { writes.push({ operation: 'update', args }); if (updateError) throw updateError; },
    deleteNote: async (id) => { writes.push({ operation: 'delete', id }); deleted = true; },
    listResources: async () => [],
    listNotes: async () => deleted ? [] : [{ id: 'note-1', body: '기존 본문', note_type: '기억할 것', resource_id: null, updated_at: '2026-09-20T00:00:00Z' }],
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
      return { addEventListener: noop };
    },
    querySelectorAll(selector) {
      if (selector === '[data-note-edit-form]') return [editForm];
      if (selector === '[data-note-delete]') return [deleteButton];
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
    history: { pushState: noop }, confirm: () => true, alert: (message) => alerts.push(message),
    formatDate: noop, groupResourcesByMonth: () => ({}), matchesQuery: noop, safeHttpUrl: noop,
    DOMPurify: { sanitize: (value) => value }, marked: { parse: (value) => value }
  };
  context.testTypes = noteTypes;
  vm.runInNewContext(mainSource + '\nuser = { id: "owner-1", email: "test@example.com" }; ownerVerifiedId = user.id; state.notes = [{ id: "note-1", body: "기존 본문", note_type: "기억할 것", resource_id: null, updated_at: "2026-09-20T00:00:00Z" }]; state.noteTypes = globalThis.testTypes; globalThis.noteUi = { notesView, noteTypeOptions, setAuthUser };', context);
  return { root, callbacks, writes, logs, alerts, status, editStatus, newForm, editForm, ui: context.noteUi };
}

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
  assert.equal(writes[0].row.body, '바뀐 본문');
  assert.equal(writes[0].row.note_type, '질문');
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
