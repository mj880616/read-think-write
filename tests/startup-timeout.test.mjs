import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
const account = { id: 'test-user', email: 'private@example.test' };

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function harness({ auth, beta, data } = {}) {
  const calls = { auth: 0, beta: 0, data: 0, reload: 0 };
  const listeners = [];
  const root = { innerHTML: '', addEventListener() {} };
  const retry = { click() { this.handler?.(); }, addEventListener(_event, handler) { this.handler = handler; } };
  const element = () => ({ addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, style: {} });
  const document = {
    querySelector(selector) { return selector === '#app' ? root : selector === '#retry-startup' ? retry : element(); },
    querySelectorAll() { return []; }, addEventListener() {}
  };
  const api = {
    currentUser() { calls.auth++; return auth?.() ?? Promise.resolve(account); },
    getBetaAccess() { calls.beta++; return beta?.() ?? Promise.resolve({ active: true, role: 'user' }); },
    listResources() { calls.data++; return data?.() ?? Promise.resolve([]); },
    listRecentResources: async () => ({ resources: [], count: 0 }),
    listNotes: async () => [], listTopics: async () => [], listQuestions: async () => [],
    listBookmarks: async () => [], listNoteTypes: async () => [],
    getAiUsageToday: async () => ({ read: 0, expand: 0 }), AI_DAILY_LIMITS: { read: 3, expand: 3 }
  };
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const setTimeout = (callback, delay = 0) => { const id = ++nextTimer; timers.set(id, { at: now + delay, callback }); return id; };
  const clearTimeout = (id) => timers.delete(id);
  const context = { api, document, supabase: { auth: { onAuthStateChange(fn) { listeners.push(fn); } } },
    APP_BASE: '/app/', APP_BUILD: 'test', location: { pathname: '/app/', search: '', reload() { calls.reload++; } },
    history: { pushState() {}, replaceState() {} }, window: { addEventListener() {}, scrollY: 0 },
    renderMarkdown: (value) => value,
    formatDate: (value) => value, groupResourcesByMonth: () => ({}), matchesQuery: () => false,
    safeHttpUrl: () => null, restoreRedirect() {}, setTimeout, clearTimeout,
    localStorage: { getItem: () => null }, console: { error() {} }, URLSearchParams };
  vm.runInNewContext(source, context);
  return {
    calls, root, retry,
    get state() { return vm.runInNewContext('state', context); },
    blockEntry() { context.__rtwEntryBlocked = true; },
    render() { return vm.runInNewContext('render()', context); },
    authEvent(event, next = account) { for (const listener of listeners) listener(event, next ? { user: next } : null); },
    async flush() { for (let i = 0; i < 50; i++) await Promise.resolve(); },
    async advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
      await this.flush();
    }
  };
}

test('normal startup reaches home after auth, beta and data', async () => {
  const app = harness(); await app.flush();
  assert.match(app.root.innerHTML, /나의 생각 저장소/);
  assert.deepEqual(app.calls, { auth: 1, beta: 1, data: 1, reload: 0 });
});

test('hung auth shows a safe timeout and retry starts auth again', async () => {
  const hold = deferred();
  let first = true;
  const app = harness({ auth: () => first ? hold.promise : Promise.resolve(account) });
  await app.advance(10_000);
  assert.match(app.root.innerHTML, /AUTH_TIMEOUT/);
  assert.match(app.root.innerHTML, /다시 시도/);
  assert.doesNotMatch(app.root.innerHTML, /private@example\.test|나의 생각 저장소/);
  app.retry.click(); await app.flush();
  assert.equal(app.calls.reload, 1);
  first = false;
  const restarted = harness({ auth: () => Promise.resolve(account) });
  await restarted.flush();
  assert.match(restarted.root.innerHTML, /나의 생각 저장소/);
  hold.resolve(account); await app.flush();
  assert.match(app.root.innerHTML, /AUTH_TIMEOUT/);
});

test('hung beta check never opens home and gets its own code', async () => {
  const app = harness({ beta: () => new Promise(() => {}) });
  await app.flush(); await app.advance(15_000);
  assert.match(app.root.innerHTML, /BETA_TIMEOUT/);
  assert.doesNotMatch(app.root.innerHTML, /private@example\.test|나의 생각 저장소/);
});

test('beta retry rechecks auth and a late old access response cannot open home', async () => {
  const hold = deferred();
  let first = true;
  const app = harness({ beta: () => first ? hold.promise : Promise.resolve({ active: true, role: 'user' }) });
  await app.flush(); await app.advance(15_000);
  app.retry.click(); await app.flush();
  assert.equal(app.calls.reload, 1);
  first = false;
  const restarted = harness({ beta: () => Promise.resolve({ active: true, role: 'user' }) });
  await restarted.flush();
  assert.equal(restarted.calls.auth, 1);
  assert.equal(restarted.calls.beta, 1);
  assert.match(restarted.root.innerHTML, /나의 생각 저장소/);
  hold.resolve({ active: false }); await app.flush();
  assert.match(app.root.innerHTML, /BETA_TIMEOUT/);
});

test('hung first data load gets its own code', async () => {
  const app = harness({ data: () => new Promise(() => {}) });
  await app.flush(); await app.advance(15_000);
  assert.match(app.root.innerHTML, /DATA_TIMEOUT/);
  assert.doesNotMatch(app.root.innerHTML, /private@example\.test|나의 생각 저장소/);
});

test('data retry starts auth again before loading records', async () => {
  let first = true;
  const app = harness({ data: () => first ? new Promise(() => {}) : Promise.resolve([]) });
  await app.flush(); await app.advance(15_000);
  app.retry.click(); await app.flush();
  assert.equal(app.calls.reload, 1);
  first = false;
  const restarted = harness({ data: () => Promise.resolve([]) });
  await restarted.flush();
  assert.deepEqual(restarted.calls, { auth: 1, beta: 1, data: 1, reload: 0 });
  assert.match(restarted.root.innerHTML, /나의 생각 저장소/);
});

test('late initial data response cannot populate a timed-out startup', async () => {
  const hold = deferred();
  const app = harness({ data: () => hold.promise });
  await app.flush(); await app.advance(15_000);
  hold.resolve([{ id: 'old-row', title: 'old title' }]); await app.flush();
  assert.match(app.root.innerHTML, /DATA_TIMEOUT/);
  assert.equal(app.state.resources.length, 0);
});

test('navigation during initial data load cannot show an empty home', async () => {
  const app = harness({ data: () => new Promise(() => {}) });
  await app.flush();
  app.render(); await app.flush();
  assert.doesNotMatch(app.root.innerHTML, /나의 생각 저장소/);
  await app.advance(15_000);
  assert.match(app.root.innerHTML, /DATA_TIMEOUT/);
});

test('auth failure never displays or logs the sensitive error', async () => {
  const app = harness({ auth: () => Promise.reject(new Error('private@example.test secret-token')) });
  await app.flush();
  assert.match(app.root.innerHTML, /AUTH_ERROR/);
  assert.doesNotMatch(app.root.innerHTML, /private@example\.test|secret-token/);
});

test('late auth event cannot replace a timeout without explicit retry', async () => {
  const app = harness({ auth: () => new Promise(() => {}) });
  await app.advance(10_000);
  app.authEvent('SIGNED_IN'); await app.flush();
  assert.match(app.root.innerHTML, /AUTH_TIMEOUT/);
  assert.equal(app.calls.beta, 0);
});

test('session event still requires server user verification', async () => {
  const app = harness({ auth: () => new Promise(() => {}) });
  app.authEvent('SIGNED_IN');
  await app.advance(0);
  await app.advance(10_000);
  assert.match(app.root.innerHTML, /AUTH_TIMEOUT/);
  assert.equal(app.calls.beta, 0);
});

test('late main module work cannot replace an entry timeout', async () => {
  const hold = deferred();
  const app = harness({ auth: () => hold.promise });
  app.blockEntry();
  hold.resolve(account); await app.flush();
  app.authEvent('SIGNED_IN'); await app.flush();
  assert.equal(app.calls.beta, 0);
  assert.doesNotMatch(app.root.innerHTML, /나의 생각 저장소/);
});

test('beta and data errors only show safe stage codes', async () => {
  for (const [option, code] of [
    [{ beta: () => Promise.reject(new Error('private@example.test secret-token')) }, 'BETA_ERROR'],
    [{ data: () => Promise.reject(new Error('private@example.test secret-token')) }, 'DATA_ERROR']
  ]) {
    const app = harness(option); await app.flush();
    assert.match(app.root.innerHTML, new RegExp(code));
    assert.doesNotMatch(app.root.innerHTML, /private@example\.test|secret-token/);
  }
});
