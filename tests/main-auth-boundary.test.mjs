import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function harness({ holdResourcesFor, holdRelationsFor, holdCreateTopicFor, ownerAllowed = () => true } = {}) {
  const listeners = [];
  const reads = [];
  const ownerChecks = [];
  const resourceWait = deferred();
  const relationWait = deferred();
  const createTopicWait = deferred();
  let current = null;
  let pendingResource = false;
  let pendingRelation = false;
  const row = (id, label) => ({ id, title: `${label} resource`, body_md: `${label} article`, name: `${label} topic`, summary: '', published_on: '2026-09-19', updated_at: '2026-09-19' });
  const rows = { [A]: row(A, 'A'), [B]: row(B, 'B') };
  const read = (kind, value) => {
    const id = current?.id;
    reads.push({ kind, id });
    if (kind === 'resources' && id === holdResourcesFor && !pendingResource) {
      pendingResource = true;
      return resourceWait.promise;
    }
    if (kind === 'relations' && id === holdRelationsFor && !pendingRelation) {
      pendingRelation = true;
      return relationWait.promise;
    }
    return Promise.resolve(value);
  };
  const api = {
    currentUser: async () => null,
    signIn: async (email) => { current = { id: email.startsWith('a@') ? A : B, email }; return current; },
    isPersonalOwner: async () => { ownerChecks.push(current?.id); return ownerAllowed(current?.id); },
    signOut: async () => { current = null; listeners.forEach((fn) => fn('SIGNED_OUT', null)); },
    listResources: () => read('resources', current ? [rows[current.id]] : []),
    listNotes: (id) => read('notes', id ? [] : current ? [{ ...rows[current.id], body: `${current.id === A ? 'A' : 'B'} note`, resource_id: null }] : []),
    listTopics: () => read('topics', current ? [rows[current.id]] : []),
    listQuestions: () => read('questions', current ? [{ ...rows[current.id], body: `${current.id === A ? 'A' : 'B'} question`, status: 'open' }] : []),
    listBookmarks: () => read('bookmarks', current ? [{ resource_id: current.id, bookmark_type: 'resource' }] : []),
    listNoteTypes: () => read('noteTypes', []),
    getResource: (id) => read('getResource', rows[id]),
    listRelations: () => read('relations', []),
    listRelationsByTarget: () => read('relations', []),
    createTopic: () => current?.id === holdCreateTopicFor ? createTopicWait.promise : Promise.resolve(),
  };
  const noop = () => {};
  const element = () => ({
    listeners: {},
    addEventListener(type, callback) { this.listeners[type] = callback; },
    emit(type, event) { this.listeners[type]?.(event); },
    classList: { add: noop, remove: noop, toggle: noop }, style: {}, dataset: {}, innerHTML: '', value: '', hidden: false
  });
  const input = element();
  const output = element();
  const loginForm = element();
  const topicForm = element();
  let html = '';
  const root = element();
  Object.defineProperty(root, 'innerHTML', {
    get: () => html,
    set(value) { html = value; output.innerHTML = ''; }
  });
  const document = {
    querySelector(selector) { return ({ '#app': root, '#search-input': input, '#search-results': output, '#login-form': loginForm, '#topic-form': topicForm })[selector] ?? element(); },
    querySelectorAll: () => [],
    addEventListener: noop
  };
  const location = { pathname: '/app/', search: '' };
  const supabase = { auth: { onAuthStateChange(fn) { listeners.push(fn); } } };
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
  const context = { api, supabase, APP_BASE: '/app/', document, location, history: { pushState: noop }, window: { addEventListener: noop, scrollY: 0 }, DOMPurify: { sanitize: (s) => s }, marked: { parse: (s) => s }, formatDate: (s) => s, groupResourcesByMonth: () => ({}), matchesQuery: (item, query, fields) => fields.some((field) => String(item[field] ?? '').toLowerCase().includes(query.toLowerCase())), safeHttpUrl: () => null, restoreRedirect: noop, setTimeout, clearTimeout, URLSearchParams, FormData: class { constructor(form) { this.values = form.values; } get(key) { return this.values[key]; } }, console };
  vm.runInNewContext(`${source}\nglobalThis.mainTest = { render, resourceDetailView, notesView, topicsView, topicDetailView, questionDetailView, refreshState, get state() { return state; } };`, context);
  const app = context.mainTest;
  return {
    ...app,
    get state() { return app.state; }, get html() { return html; },
    location, input, output, loginForm, topicForm, reads, ownerChecks,
    async settle() { for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve)); },
    signIn(id) { current = { id, email: `${id}@example.com` }; listeners.forEach((fn) => fn('SIGNED_IN', { user: current })); },
    signOut() { current = null; listeners.forEach((fn) => fn('SIGNED_OUT', null)); },
    releaseResources(id = A) { resourceWait.resolve([rows[id]]); },
    releaseRelations() { relationWait.resolve([]); },
    releaseCreateTopic() { createTopicWait.resolve(); }
  };
}

test('direct A to B transition clears all user state and the A home immediately', async () => {
  const app = harness();
  app.signIn(A); await app.settle();
  assert.match(app.html, /A resource/);
  app.state.relations = [{ source_id: A }];
  app.signIn(B);
  for (const key of ['resources', 'notes', 'questions', 'topics', 'bookmarks', 'relations']) assert.equal(app.state[key].length, 0, key);
  assert.doesNotMatch(app.html, /A resource|A note|A question/);
  await app.settle();
  assert.match(app.html, /B resource/);
  assert.deepEqual(app.ownerChecks, [A, B]);
});

test('A search results disappear on B transition and B search uses B data', async () => {
  const app = harness();
  app.signIn(A); await app.settle();
  app.location.pathname = '/app/search/'; await app.render();
  app.input.value = 'resource'; app.input.emit('input');
  assert.match(app.output.innerHTML, /A resource/);
  app.signIn(B);
  assert.doesNotMatch(app.html, /A resource|A note/);
  assert.equal(app.output.innerHTML, '');
  await app.settle();
  app.input.value = 'resource'; app.input.emit('input');
  assert.match(app.output.innerHTML, /B resource/);
  assert.doesNotMatch(app.output.innerHTML, /A resource/);
  assert.equal(app.state.resources[0].title, 'B resource');
});

test('late A refresh cannot replace B state or redraw after logout', async () => {
  const app = harness({ holdResourcesFor: A });
  app.signIn(A); await app.settle();
  app.signIn(B); await app.settle();
  assert.equal(app.state.resources[0].title, 'B resource');
  app.releaseResources(); await app.settle();
  assert.equal(app.state.resources[0].title, 'B resource');
  assert.doesNotMatch(app.html, /A resource/);
  app.signOut();
  assert.equal(app.state.resources.length, 0);
  assert.doesNotMatch(app.html, /B resource/);
});

test('logout discards A refresh even when the A response arrives afterward', async () => {
  const app = harness({ holdResourcesFor: A });
  app.signIn(A); await app.settle();
  app.signOut();
  assert.equal(app.state.resources.length, 0);
  app.releaseResources(); await app.settle();
  assert.equal(app.state.resources.length, 0);
  assert.doesNotMatch(app.html, /A resource|A note|A question/);
});

test('late detail responses for resource, note, topic and question never redraw another user', async () => {
  for (const [path, view] of [
    [`/read/${A}/`, 'resourceDetailView'], ['/notes/', 'notesView'],
    [`/topics/${A}/`, 'topicDetailView'], [`/questions/${A}/`, 'questionDetailView']
  ]) {
    const app = harness({ holdRelationsFor: A });
    app.signIn(A); await app.settle();
    app.location.pathname = `/app${path}`;
    const pending = view === 'notesView' ? app[view]() : app[view](A);
    await app.settle();
    app.location.pathname = '/app/'; app.signIn(B); await app.settle();
    app.releaseRelations(); await pending; await app.settle();
    assert.match(app.html, /B resource/, view);
    assert.doesNotMatch(app.html, /A resource|A note|A topic|A question/, view);
  }
});

test('a detail response does not redraw after same-user route navigation', async () => {
  const app = harness({ holdRelationsFor: A });
  app.signIn(A); await app.settle();
  app.location.pathname = `/app/topics/${A}/`;
  const pending = app.topicDetailView(A);
  await app.settle();
  app.location.pathname = '/app/'; await app.render();
  app.releaseRelations(); await pending;
  assert.match(app.html, /최근 읽기/);
  assert.doesNotMatch(app.html, /관련 읽기/);
});

test('same-user auth event keeps state and avoids owner check and reload', async () => {
  const app = harness();
  app.signIn(A); await app.settle();
  const state = app.state;
  const reads = app.reads.length;
  app.signIn(A); await app.settle();
  assert.equal(app.state, state);
  assert.equal(app.reads.length, reads);
  assert.deepEqual(app.ownerChecks, [A]);
});

test('personal owner check runs for B before B data is loaded and rejects unauthorized B', async () => {
  const app = harness({ ownerAllowed: (id) => id === A });
  app.signIn(A); await app.settle();
  app.signIn(B); await app.settle();
  assert.deepEqual(app.ownerChecks, [A, B]);
  assert.equal(app.reads.filter((read) => read.id === B).length, 0);
  assert.match(app.html, /개인용 읽생기/);
  assert.doesNotMatch(app.html, /A resource|B resource/);
});

test('form login checks personal ownership before reading the new account', async () => {
  const app = harness({ ownerAllowed: () => false });
  await app.settle();
  app.loginForm.values = { email: 'b@example.com', password: 'secret' };
  app.loginForm.emit('submit', { preventDefault() {}, currentTarget: app.loginForm });
  await app.settle();
  assert.deepEqual(app.ownerChecks, [B]);
  assert.equal(app.reads.length, 0);
  assert.match(app.html, /개인용 읽생기/);
  assert.doesNotMatch(app.html, /B resource/);
});

test('a late A mutation cannot replace the B home with the old form view', async () => {
  const app = harness({ holdCreateTopicFor: A });
  app.signIn(A); await app.settle();
  app.location.pathname = '/app/topics/'; await app.render();
  app.topicForm.values = { name: 'A topic' };
  app.topicForm.emit('submit', { preventDefault() {}, currentTarget: app.topicForm });
  await app.settle();
  app.location.pathname = '/app/'; app.signIn(B); await app.settle();
  app.releaseCreateTopic(); await app.settle();
  assert.match(app.html, /B resource/);
  assert.match(app.html, /최근 읽기/);
  assert.doesNotMatch(app.html, /새 주제/);
});
