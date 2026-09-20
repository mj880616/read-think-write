import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function harness({ holdResourcesFor, holdRelationsFor, holdGetResourceFor, getResourceFailureOnceFor, getResourceFailure, detailFailureFor, detailFailure, holdCreateTopicFor, holdRelationSaveFor, betaAllowed = () => true } = {}) {
  const listeners = [];
  const reads = [];
  const ownerChecks = [];
  const alerts = [];
  const resourceWait = deferred();
  const relationWait = deferred();
  const getResourceWait = deferred();
  const createTopicWait = deferred();
  const relationSaveWait = deferred();
  let current = null;
  let pendingResource = false;
  let pendingRelation = false;
  let getResourceFailed = false;
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
    isPersonalOwner: async () => { ownerChecks.push(current?.id); return true; },
    getBetaAccess: async () => betaAllowed(current?.id) ? { email: current?.email, role: 'user', active: true } : null,
    getAiUsageToday: async () => ({ read: 0, expand: 0, recommend: 0 }),
    AI_DAILY_LIMITS: { read: 20, expand: 10, recommend: 10 },
    signOut: async () => { current = null; listeners.forEach((fn) => fn('SIGNED_OUT', null)); },
    listResources: () => read('resources', current ? [rows[current.id]] : []),
    listNotes: (id) => read('notes', id ? [] : current ? [{ ...rows[current.id], body: `${current.id === A ? 'A' : 'B'} note`, resource_id: null }] : []),
    listTopics: () => read('topics', current ? [rows[current.id]] : []),
    listQuestions: () => read('questions', current ? [{ ...rows[current.id], body: `${current.id === A ? 'A' : 'B'} question`, status: 'open' }] : []),
    listBookmarks: () => read('bookmarks', current ? [{ resource_id: current.id, bookmark_type: 'resource' }] : []),
    listNoteTypes: () => read('noteTypes', []),
    getResource: (id) => {
      if (current?.id === holdGetResourceFor) return getResourceWait.promise;
      if (current?.id === getResourceFailureOnceFor && !getResourceFailed) {
        getResourceFailed = true;
        return read('getResource', Promise.reject(getResourceFailure));
      }
      return read('getResource', current?.id === id ? rows[id] : null);
    },
    listRelations: () => current?.id === detailFailureFor ? Promise.reject(detailFailure) : read('relations', []),
    listRelationsByTarget: () => read('relations', []),
    createTopic: () => current?.id === holdCreateTopicFor ? createTopicWait.promise : Promise.resolve(),
    addRelation: () => current?.id === holdRelationSaveFor ? relationSaveWait.promise : Promise.resolve({ id: 'new-relation' }),
    removeRelation: () => current?.id === holdRelationSaveFor ? relationSaveWait.promise : Promise.resolve(),
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
  const relationToggle = element();
  const retryResource = element();
  const logoutButton = element();
  relationToggle.dataset = { sourceType: 'resource', sourceId: A, targetType: 'topic', targetId: A };
  let html = '';
  const root = element();
  Object.defineProperty(root, 'innerHTML', {
    get: () => html,
    set(value) { html = value; output.innerHTML = ''; }
  });
  const document = {
    querySelector(selector) { return ({ '#app': root, '#search-input': input, '#search-results': output, '#login-form': loginForm, '#topic-form': topicForm, '#retry-resource': retryResource, '[data-logout]': logoutButton })[selector] ?? element(); },
    querySelectorAll: (selector) => selector === '[data-relation-toggle]' ? [relationToggle] : [],
    addEventListener: noop
  };
  const location = { pathname: '/app/', search: '' };
  const supabase = { auth: { onAuthStateChange(fn) { listeners.push(fn); } } };
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
  const context = { api, supabase, APP_BASE: '/app/', document, location, history: { pushState: noop }, window: { addEventListener: noop, scrollY: 0 }, DOMPurify: { sanitize: (s) => s }, marked: { parse: (s) => s }, formatDate: (s) => s, groupResourcesByMonth: () => ({}), matchesQuery: (item, query, fields) => fields.some((field) => String(item[field] ?? '').toLowerCase().includes(query.toLowerCase())), safeHttpUrl: () => null, restoreRedirect: noop, setTimeout, clearTimeout, URLSearchParams, FormData: class { constructor(form) { this.values = form.values; } get(key) { return this.values[key]; } }, alert: (message) => alerts.push(message), console };
  vm.runInNewContext(`${source}\nglobalThis.mainTest = { render, resourceDetailView, notesView, topicsView, topicDetailView, questionDetailView, refreshState, bindRelationToggles, get state() { return state; } };`, context);
  const app = context.mainTest;
  return {
    ...app,
    get state() { return app.state; }, get html() { return html; },
    location, input, output, loginForm, topicForm, relationToggle, retryResource, logoutButton, reads, ownerChecks, alerts,
    async settle() { for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve)); },
    signIn(id) { current = { id, email: `${id}@example.com` }; listeners.forEach((fn) => fn('SIGNED_IN', { user: current })); },
    authEvent(event, id) { current = { id, email: `${id}@example.com` }; listeners.forEach((fn) => fn(event, { user: current })); },
    signOut() { current = null; listeners.forEach((fn) => fn('SIGNED_OUT', null)); },
    releaseResources(id = A) { resourceWait.resolve([rows[id]]); },
    releaseRelations() { relationWait.resolve([]); },
    failGetResource() { getResourceWait.reject(new Error('old resource request failed')); },
    releaseCreateTopic() { createTopicWait.resolve(); },
    releaseRelationSave(value) { relationSaveWait.resolve(value); },
    failRelationSave() { relationSaveWait.reject(new Error('A relation failed')); }
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
  assert.deepEqual(app.ownerChecks, []);
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

test('switching to B on A resource URL ends loading with the existing not found view', async () => {
  const app = harness();
  app.signIn(A); await app.settle();
  app.location.pathname = `/app/read/${A}/`;
  await app.render();
  assert.match(app.html, /A resource/);

  app.signIn(B);
  assert.doesNotMatch(app.html, /A resource|A article/);
  await app.settle();
  assert.match(app.html, /페이지를 찾을 수 없음/);
  assert.doesNotMatch(app.html, /불러오는 중|A resource|A article/);
  assert.equal(app.state.resources[0].title, 'B resource');
});

test('a late A resource lookup error does not replace the B home', async () => {
  const app = harness({ holdGetResourceFor: A });
  app.signIn(A); await app.settle();
  const missingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  app.location.pathname = `/app/read/${missingId}/`;
  const pending = app.resourceDetailView(missingId);
  await app.settle();

  app.location.pathname = '/app/'; app.signIn(B); await app.settle();
  app.failGetResource(); await pending; await app.settle();
  assert.match(app.html, /B resource/);
  assert.doesNotMatch(app.html, /페이지를 찾을 수 없음|A resource|old resource request failed/);
});

test('current B network failure shows a retryable error instead of not found', async () => {
  const app = harness({ getResourceFailureOnceFor: B, getResourceFailure: new TypeError('Failed to fetch') });
  app.signIn(B); await app.settle();
  app.state.resources.length = 0;
  app.location.pathname = `/app/read/${B}/`;
  await app.render();
  assert.match(app.html, /자료를 불러오지 못함/);
  assert.match(app.html, /Failed to fetch/);
  assert.doesNotMatch(app.html, /페이지를 찾을 수 없음|불러오는 중/);
  assert.equal(typeof app.retryResource.onclick, 'function');
  app.retryResource.onclick(); await app.settle();
  assert.match(app.html, /B resource/);
});

test('current B server failure shows an error instead of not found', async () => {
  const error = Object.assign(new Error('server unavailable'), { status: 503 });
  const app = harness({ getResourceFailureOnceFor: B, getResourceFailure: error });
  app.signIn(B); await app.settle();
  app.state.resources.length = 0;
  app.location.pathname = `/app/read/${B}/`;
  await app.render();
  assert.match(app.html, /자료를 불러오지 못함/);
  assert.match(app.html, /server unavailable/);
  assert.doesNotMatch(app.html, /페이지를 찾을 수 없음|불러오는 중/);
});

test('current B related detail lookup failure also ends loading with an error', async () => {
  const app = harness({ detailFailureFor: B, detailFailure: new Error('relations unavailable') });
  app.signIn(B); await app.settle();
  app.location.pathname = `/app/read/${B}/`;
  await app.render();
  assert.match(app.html, /자료를 불러오지 못함/);
  assert.match(app.html, /relations unavailable/);
  assert.doesNotMatch(app.html, /페이지를 찾을 수 없음|불러오는 중/);
});

test('getResource returns null for no visible row and propagates query errors', async () => {
  let response = { data: null, error: null };
  const supabase = { from(table) {
    assert.equal(table, 'rtw_resources');
    return { select(columns) {
      assert.equal(columns, '*');
      return { eq(field, value) {
        assert.equal(field, 'id');
        assert.equal(value, A);
        return { maybeSingle: async () => response };
      } };
    } };
  } };
  const source = readFileSync(new URL('../src/api.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const context = { supabase };
  vm.runInNewContext(`${source}\nglobalThis.getResourceTest = getResource;`, context);
  assert.equal(await context.getResourceTest(A), null);
  const error = new Error('connection failed');
  response = { data: null, error };
  await assert.rejects(context.getResourceTest(A), error);
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

test('logout control signs out, clears user data and returns to the login view', async () => {
  const app = harness();
  app.signIn(A); await app.settle();
  assert.match(app.html, /A resource/);
  assert.equal(typeof app.logoutButton.listeners.click, 'function');

  app.logoutButton.emit('click', { currentTarget: app.logoutButton });
  await app.settle();

  assert.equal(app.state.resources.length, 0);
  assert.equal(app.state.notes.length, 0);
  assert.match(app.html, /로그인|Google로 로그인/);
  assert.doesNotMatch(app.html, /A resource|A note|A question/);
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
  assert.deepEqual(app.ownerChecks, []);
});

test('same-user INITIAL_SESSION and TOKEN_REFRESHED keep state without reload', async () => {
  const app = harness();
  app.signIn(A); await app.settle();
  const state = app.state;
  const reads = app.reads.length;
  app.authEvent('INITIAL_SESSION', A);
  app.authEvent('TOKEN_REFRESHED', A);
  await app.settle();
  assert.equal(app.state, state);
  assert.equal(app.reads.length, reads);
  assert.deepEqual(app.ownerChecks, []);
});

test('an authenticated account without a beta invitation is blocked before personal data loads', async () => {
  const app = harness({ betaAllowed: (id) => id === A });
  app.signIn(B); await app.settle();
  assert.equal(app.reads.filter((read) => read.id === B).length, 0);
  assert.match(app.html, /초대가 필요한 계정/);
  assert.doesNotMatch(app.html, /B resource|B note|B question/);
});

test('a second authenticated user loads only their own data without a personal-owner gate', async () => {
  const app = harness({ betaAllowed: () => true });
  app.signIn(A); await app.settle();
  app.signIn(B); await app.settle();
  assert.deepEqual(app.ownerChecks, []);
  assert.ok(app.reads.some((read) => read.id === B));
  assert.match(app.html, /B resource/);
  assert.doesNotMatch(app.html, /A resource|개인용 읽생기/);
});

test('form login loads the signed-in user without a personal-owner gate', async () => {
  const app = harness({ betaAllowed: () => true });
  await app.settle();
  app.loginForm.values = { email: 'b@example.com', password: 'secret' };
  app.loginForm.emit('submit', { preventDefault() {}, currentTarget: app.loginForm });
  await app.settle();
  assert.deepEqual(app.ownerChecks, []);
  assert.ok(app.reads.some((read) => read.id === B));
  assert.match(app.html, /B resource/);
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

for (const operation of ['add', 'remove']) {
  for (const result of ['success', 'failure']) {
    test(`late A relation ${operation} ${result} does not update or alert B`, async () => {
      const app = harness({ holdRelationSaveFor: A });
      app.signIn(A); await app.settle();
      app.location.pathname = `/app/read/${A}/`; await app.render();
      const existing = { id: 'existing-relation', target_type: 'topic', target_id: A };
      const relations = operation === 'remove' ? [existing] : [];
      const relationMap = new Map([[`resource:${A}`, relations]]);
      app.bindRelationToggles(relationMap);
      app.relationToggle.checked = operation === 'add';
      app.relationToggle.emit('change');

      app.location.pathname = '/app/'; app.signIn(B); await app.settle();
      if (result === 'success') app.releaseRelationSave({ id: 'new-relation', target_type: 'topic', target_id: A });
      else app.failRelationSave();
      await app.settle();

      assert.equal(relationMap.get(`resource:${A}`).length, operation === 'add' ? 0 : 1);
      assert.equal(app.relationToggle.checked, operation === 'add');
      assert.deepEqual(app.alerts, []);
      assert.match(app.html, /B resource/);
      assert.doesNotMatch(app.html, /A resource|A relation failed/);
    });
  }
}

test('same-user relation save still updates the relation map', async () => {
  const app = harness({ holdRelationSaveFor: A });
  app.signIn(A); await app.settle();
  const relationMap = new Map([[`resource:${A}`, []]]);
  app.bindRelationToggles(relationMap);
  app.relationToggle.checked = true;
  app.relationToggle.emit('change');
  app.releaseRelationSave({ id: 'new-relation', target_type: 'topic', target_id: A });
  await app.settle();
  assert.equal(relationMap.get(`resource:${A}`).length, 1);
  assert.deepEqual(app.alerts, []);
});

test('same-user relation save failure still restores the checkbox and alerts', async () => {
  const app = harness({ holdRelationSaveFor: A });
  app.signIn(A); await app.settle();
  app.bindRelationToggles(new Map([[`resource:${A}`, []]]));
  app.relationToggle.checked = true;
  app.relationToggle.emit('change');
  app.failRelationSave();
  await app.settle();
  assert.equal(app.relationToggle.checked, false);
  assert.match(app.alerts[0], /A relation failed/);
});

test('old relation failure is discarded after the same account logs out and back in', async () => {
  const app = harness({ holdRelationSaveFor: A });
  app.signIn(A); await app.settle();
  app.bindRelationToggles(new Map([[`resource:${A}`, []]]));
  app.relationToggle.checked = true;
  app.relationToggle.emit('change');
  app.signOut(); app.signIn(A); await app.settle();
  app.failRelationSave(); await app.settle();
  assert.deepEqual(app.alerts, []);
  assert.equal(app.relationToggle.checked, true);
  assert.match(app.html, /A resource/);
});
