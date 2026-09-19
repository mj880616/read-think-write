import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function record(id, title) {
  return {
    id, owner_id: id, record_type: 'learning', title,
    source_resource_id: null, a_original: `${title} original`,
    b_feedback: `${title} feedback`, c_revision: `${title} revision`,
    takeaway: `${title} takeaway`, tags: [], origin: 'manual',
    created_at: '2026-09-19T00:00:00Z', updated_at: '2026-09-19T00:00:00Z'
  };
}

function createHarness({ holdARecords = false, holdInitialSession = false, initialUserId = null } = {}) {
  const rows = {
    [A_ID]: { records: [record(A_ID, 'A private record')], context: { owner_id: A_ID, profile_md: 'A private context', updated_at: '2026-09-19T00:00:00Z' } },
    [B_ID]: { records: [record(B_ID, 'B private record')], context: { owner_id: B_ID, profile_md: 'B private context', updated_at: '2026-09-19T00:00:00Z' } }
  };
  const reads = [];
  const listeners = [];
  const authCalls = { getUser: 0, getSession: 0 };
  const microtasks = [];
  let user = initialUserId ? { id: initialUserId } : null;
  let releaseARecords = null;
  let releaseInitialSession = null;

  const supabase = {
    auth: {
      async getUser() { authCalls.getUser++; return { data: { user }, error: null }; },
      getSession() {
        authCalls.getSession++;
        const result = { data: { session: user ? { user } : null }, error: null };
        if (holdInitialSession) return new Promise((resolve) => { releaseInitialSession = () => resolve(result); });
        return Promise.resolve(result);
      },
      onAuthStateChange(callback) { listeners.push(callback); }
    },
    from(table) {
      return {
        select() {
          return {
            order() {
              const owner = user?.id;
              reads.push({ table, owner });
              const result = { data: rows[owner]?.records ?? [], error: null };
              if (holdARecords && owner === A_ID) {
                return new Promise((resolve) => { releaseARecords = () => resolve(result); });
              }
              return Promise.resolve(result);
            },
            maybeSingle() {
              const owner = user?.id;
              reads.push({ table, owner });
              return Promise.resolve({ data: rows[owner]?.context ?? null, error: null });
            }
          };
        }
      };
    }
  };

  const page = { dataset: {}, innerHTML: '' };
  let homeCard = null;
  const grid = {
    children: [],
    appendChild(card) {
      homeCard = card;
      this.children.push(card);
      card.remove = () => { homeCard = null; this.children = this.children.filter((item) => item !== card); };
    }
  };
  const nav = {
    link: null,
    querySelector(selector) { return selector === '[data-records-nav]' ? this.link : null; },
    querySelectorAll() { return this.link ? [this.link] : []; },
    appendChild(link) { this.link = link; }
  };
  const searchInput = { value: '' };
  const searchResults = {
    innerHTML: '',
    querySelector(selector) { return selector === '[data-record-search-results]' && this.innerHTML.includes('data-record-search-results') ? {} : null; },
    insertAdjacentHTML(_position, html) { this.innerHTML += html; }
  };
  const root = {
    querySelector(selector) {
      if (selector === '#recent-records-card') return homeCard;
      if (selector === '[data-record-search-results]' && searchResults.innerHTML.includes('data-record-search-results')) {
        return { remove() { searchResults.innerHTML = ''; } };
      }
      return ({ '.page': page, '.topbar': {}, '.nav': nav, '.page .grid': grid, '#search-input': searchInput, '#search-results': searchResults })[selector] ?? null;
    },
    addEventListener() {}
  };
  const location = { pathname: '/app/records/' };
  const document = {
    querySelector(selector) { return selector === '#app' ? root : null; },
    createElement() { return { dataset: {}, classList: { remove() {}, toggle() {} }, textContent: '', href: '' }; }
  };
  class MutationObserver { observe() {} }
  const source = readFileSync(new URL('../src/records-ui.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '');
  const context = {
    supabase, APP_BASE: '/app/', document, location, MutationObserver,
    DOMPurify: { sanitize: (html) => html }, marked: { parse: (text) => text },
    window: { addEventListener() {} }, queueMicrotask(callback) { microtasks.push(callback); },
    setTimeout, console
  };
  vm.runInNewContext(`${source}\nglobalThis.recordsTest = { renderRecordsRoute, listRecords, getWritingContext, enhanceHome, appendSearchRecords };`, context);

  return {
    ...context.recordsTest, page, location, searchInput, searchResults, reads, authCalls,
    get listenerCount() { return listeners.length; },
    get homeCard() { return homeCard; },
    signIn(id) { user = { id }; listeners.forEach((callback) => callback('SIGNED_IN', { user })); },
    signOut() { user = null; listeners.forEach((callback) => callback('SIGNED_OUT', null)); },
    setUserWithoutEvent(id) { user = id ? { id } : null; },
    async flushEnhancements() {
      while (microtasks.length) await microtasks.shift()();
    },
    get releaseInitialSession() { return releaseInitialSession; },
    get releaseARecords() { return releaseARecords; }
  };
}

test('one initial session check serves repeated same-user navigation without getUser calls', async () => {
  const app = createHarness({ initialUserId: A_ID });
  await app.renderRecordsRoute();
  assert.match(app.page.innerHTML, /A private record/);
  await app.renderRecordsRoute();
  app.location.pathname = `/app/records/${A_ID}/`;
  await app.renderRecordsRoute();
  app.location.pathname = '/app/';
  await app.enhanceHome();
  app.location.pathname = '/app/search/';
  app.searchInput.value = 'private record';
  await app.appendSearchRecords();
  assert.equal(app.authCalls.getUser, 0);
  assert.equal(app.authCalls.getSession, 1);
  assert.equal(app.listenerCount, 1);
  assert.equal(app.reads.filter((read) => read.table === 'rtw_records' && read.owner === A_ID).length, 1);
});

test('records and writing context stay with the signed-in user and clear on logout', async () => {
  const app = createHarness();
  app.signIn(A_ID);
  await app.renderRecordsRoute();
  assert.match(app.page.innerHTML, /A private record/);
  assert.match(app.page.innerHTML, /A private context/);

  app.signIn(A_ID);
  await app.renderRecordsRoute();
  assert.equal(app.reads.filter((read) => read.table === 'rtw_records' && read.owner === A_ID).length, 1);
  assert.equal(app.reads.filter((read) => read.table === 'rtw_writing_context' && read.owner === A_ID).length, 1);

  app.signIn(B_ID);
  assert.doesNotMatch(app.page.innerHTML, /A private record|A private context/);
  await app.renderRecordsRoute();
  assert.match(app.page.innerHTML, /B private record/);
  assert.match(app.page.innerHTML, /B private context/);
  assert.doesNotMatch(app.page.innerHTML, /A private record|A private context/);

  app.signOut();
  assert.doesNotMatch(app.page.innerHTML, /B private record|B private context/);
  assert.equal((await app.listRecords()).length, 0);
  assert.equal(await app.getWritingContext(), null);
  app.signIn(B_ID);
  await app.renderRecordsRoute();
  assert.match(app.page.innerHTML, /B private record/);
  assert.equal(app.reads.filter((read) => read.table === 'rtw_records' && read.owner === B_ID).length, 2);
  assert.equal(app.reads.filter((read) => read.table === 'rtw_writing_context' && read.owner === B_ID).length, 2);
});

test('record detail and search show only the new user after a session change', async () => {
  const app = createHarness();
  app.signIn(A_ID);
  app.location.pathname = `/app/records/${A_ID}/`;
  await app.renderRecordsRoute();
  assert.match(app.page.innerHTML, /A private record original/);

  app.signIn(B_ID);
  app.location.pathname = `/app/records/${B_ID}/`;
  await app.renderRecordsRoute();
  assert.match(app.page.innerHTML, /B private record original/);
  assert.doesNotMatch(app.page.innerHTML, /A private record/);

  app.location.pathname = '/app/search/';
  app.searchInput.value = 'private record';
  await app.appendSearchRecords();
  assert.match(app.searchResults.innerHTML, /B private record/);
  assert.doesNotMatch(app.searchResults.innerHTML, /A private record/);
});

test('home card and search results remove the previous user data on session change', async () => {
  const app = createHarness();
  app.signIn(A_ID);
  app.location.pathname = '/app/';
  await app.enhanceHome();
  assert.match(app.homeCard.innerHTML, /A private record/);

  app.location.pathname = '/app/search/';
  app.searchInput.value = 'private record';
  await app.appendSearchRecords();
  assert.match(app.searchResults.innerHTML, /A private record/);

  app.signIn(B_ID);
  assert.equal(app.homeCard, null);
  assert.doesNotMatch(app.searchResults.innerHTML, /A private record/);
  await app.appendSearchRecords();
  assert.match(app.searchResults.innerHTML, /B private record/);
});

test('a changed user clears the old view and cache when the auth event arrives', async () => {
  const app = createHarness();
  app.signIn(A_ID);
  await app.renderRecordsRoute();
  app.setUserWithoutEvent(B_ID);
  assert.match((await app.listRecords())[0].title, /A private record/);
  app.signIn(B_ID);
  assert.match((await app.listRecords())[0].title, /B private record/);
  assert.equal((await app.getWritingContext()).profile_md, 'B private context');
  assert.doesNotMatch(app.page.innerHTML, /A private record|A private context/);
});

test('a late initial session snapshot cannot overwrite a newer auth event', async () => {
  const app = createHarness({ holdInitialSession: true, initialUserId: A_ID });
  app.signIn(B_ID);
  await app.renderRecordsRoute();
  assert.match((await app.listRecords())[0].title, /B private record/);
  assert.equal((await app.getWritingContext()).profile_md, 'B private context');
  app.releaseInitialSession();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(app.page.innerHTML, /B private record/);
  assert.doesNotMatch(app.page.innerHTML, /A private record|A private context/);
  assert.match((await app.listRecords())[0].title, /B private record/);
  assert.equal(app.authCalls.getSession, 1);
  assert.equal(app.authCalls.getUser, 0);
});

test('auth event automatically replaces the old records page with the new user', async () => {
  const app = createHarness();
  app.signIn(A_ID);
  await app.renderRecordsRoute();
  await app.flushEnhancements();
  assert.match(app.page.innerHTML, /A private record/);

  app.signIn(B_ID);
  assert.doesNotMatch(app.page.innerHTML, /A private record|A private context/);
  await app.flushEnhancements();
  assert.match(app.page.innerHTML, /B private record/);
  assert.match(app.page.innerHTML, /B private context/);
  assert.equal(app.reads.filter((read) => read.table === 'rtw_records' && read.owner === B_ID).length, 1);
  assert.equal(app.authCalls.getSession, 1);
  assert.equal(app.authCalls.getUser, 0);
});

test('logout event removes records and writing context without another auth lookup', async () => {
  const app = createHarness();
  app.signIn(A_ID);
  await app.renderRecordsRoute();
  await app.flushEnhancements();
  const readsBeforeLogout = app.reads.length;

  app.signOut();
  assert.doesNotMatch(app.page.innerHTML, /A private record|A private context/);
  assert.equal((await app.listRecords()).length, 0);
  assert.equal(await app.getWritingContext(), null);
  assert.equal(app.reads.length, readsBeforeLogout);
  assert.equal(app.authCalls.getSession, 1);
  assert.equal(app.authCalls.getUser, 0);
});

test('an old in-flight records response cannot replace the new user cache', async () => {
  const app = createHarness({ holdARecords: true });
  app.signIn(A_ID);
  const oldRead = app.listRecords();
  while (!app.releaseARecords) await Promise.resolve();

  app.signIn(B_ID);
  assert.match((await app.listRecords())[0].title, /B private record/);
  app.releaseARecords();
  assert.match((await oldRead)[0].title, /B private record/);
  assert.match((await app.listRecords())[0].title, /B private record/);
});

test('a session switch during list rendering cannot mix B records with A writing context', async () => {
  const app = createHarness({ holdARecords: true });
  app.signIn(A_ID);
  const oldRender = app.renderRecordsRoute();
  while (!app.releaseARecords) await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.reads.filter((read) => read.table === 'rtw_writing_context' && read.owner === A_ID).length, 1);

  app.signIn(B_ID);
  app.releaseARecords();
  await oldRender;
  assert.match(app.page.innerHTML, /B private record/);
  assert.match(app.page.innerHTML, /B private context/);
  assert.doesNotMatch(app.page.innerHTML, /A private record|A private context/);
});
