import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
const itemSource = source.slice(source.indexOf('function empty('), source.indexOf('function bindResourceBookmarkButtons'));
const sectionSource = source.slice(source.indexOf('function recentQueryWindow('), source.indexOf('function linkCheckbox('));
assert.ok(sectionSource.startsWith('function recentQueryWindow('));
const recentApiSource = apiSource.slice(apiSource.indexOf('export async function listRecentResources('), apiSource.indexOf('export async function getResource('));
assert.ok(recentApiSource.startsWith('export async function listRecentResources('));
const calls = [];
const query = Object.fromEntries(['select', 'gte', 'lte', 'order'].map((method) => [method, (...args) => { calls.push([method, ...args]); return query; }]));
query.range = async (...args) => { calls.push(['range', ...args]); return { data: [{ id: 'api' }], count: 11, error: null }; };
const apiContext = { supabase: { from: (table) => { calls.push(['from', table]); return query; } }, fail: (error) => { if (error) throw error; } };
vm.runInNewContext(`${recentApiSource.replace('export async function', 'async function')}\nglobalThis.list = listRecentResources;`, apiContext);
const apiResult = await apiContext.list('2026-09-29T15:00:00Z', '2026-09-30T15:30:00Z', 10, 500);
assert.equal(apiResult.count, 11);
assert.deepEqual(calls.map(([method]) => method), ['from', 'select', 'gte', 'lte', 'order', 'order', 'range']);
assert.deepEqual(calls[0], ['from', 'rtw_resources']);
assert.deepEqual(calls.at(-1), ['range', 10, 509]);
assert.deepEqual(calls.filter(([method]) => method === 'order').map(([, column]) => column), ['created_at', 'id']);

const now = Date.parse('2026-09-30T15:30:00Z');
const DateAtBoundary = class extends Date { static now() { return now; } };
const originalTimezone = process.env.TZ;
process.env.TZ = 'America/Los_Angeles';
const resource = (id, created_at, published_on = '2020-01-01') => ({ id, title: `title-${id}`, created_at, published_on });
const recent = Array.from({ length: 11 }, (_, i) => resource(String(i), new Date(now - i * 60000).toISOString()));
const original = [resource('old', '2020-01-01T00:00:00Z', '2026-01-01'), recent[10]];

function render(recentResources, recentCount = recentResources.length, search = '') {
  const root = { innerHTML: '' };
  const listeners = new Map();
  const state = { resources: original, recentResources, recentCount, recentWindow: { since: '', until: '' }, bookmarks: [] };
  const context = {
    Date: DateAtBoundary, Intl, URLSearchParams, location: { search }, state, root,
    esc: (value) => value, href: (value) => value, formatDate: (value) => value,
    shell: (html) => html, bindCommon() {}, bindNoteActions() {}, bindResourceBookmarkButtons() {},
    document: { querySelector: (selector) => ({ addEventListener: (event, listener) => listeners.set(selector + ':' + event, listener) }) },
    api: { listRecentResources: async () => ({ resources: recent.slice(10), count: 11 }) },
    currentViewGuard: () => () => true
  };
  vm.runInNewContext(`${itemSource}\n${sectionSource}\nreadListView();`, context);
  return { root, state, listeners };
}

const windowContext = { Date: DateAtBoundary, Intl };
vm.runInNewContext(`${itemSource}\n${sectionSource.slice(0, sectionSource.indexOf('function readListView()'))}\nglobalThis.window = recentQueryWindow();`, windowContext);
assert.equal(windowContext.window.since, '2026-09-29T15:00:00.000Z',
  'Seoul yesterday midnight is the lower bound even on a Los Angeles device');
assert.equal(windowContext.window.until, '2026-09-30T15:30:00.000Z');

assert.doesNotMatch(render([], 0).root.innerHTML, /recent-resources-section/);
const one = render([recent[0]], 1);
assert.match(one.root.innerHTML, /새 글 1/);
assert.doesNotMatch(one.root.innerHTML, /recent-resources-more/);
const many = render(recent.slice(0, 10), 11);
assert.match(many.root.innerHTML, /새 글 11/);
assert.equal((many.root.innerHTML.match(/class="item bookmark-resource-item"/g) ?? []).length, 12,
  'ten recent cards plus the unchanged two publication-date cards render');
assert.match(many.root.innerHTML, /recent-resources-more/);
assert.ok(many.root.innerHTML.indexOf('title-0') < many.root.innerHTML.indexOf('title-9'));
assert.ok(many.root.innerHTML.lastIndexOf('title-old') < many.root.innerHTML.lastIndexOf('title-10'),
  'the original list keeps publication-date order');
assert.doesNotMatch(render([recent[0]], 1, '?q=test').root.innerHTML, /recent-resources-section/);
assert.doesNotMatch(render([recent[0]], 1, '?topic=abc').root.innerHTML, /recent-resources-section/);
assert.doesNotMatch(render([recent[0]], 1, '?new=1').root.innerHTML, /recent-resources-section/);
assert.deepEqual(original.map(({ id }) => id), ['old', '10'], 'rendering leaves the original list untouched');

await many.listeners.get('#recent-resources-more:click')({ currentTarget: { disabled: false } });
assert.equal(many.state.recentResources.length, 11);
assert.doesNotMatch(many.root.innerHTML, /recent-resources-more/);
assert.ok(many.root.innerHTML.indexOf('title-9') < many.root.innerHTML.indexOf('title-10'));

console.log('recent section visibility, order, expansion, and original list verified');
if (originalTimezone === undefined) delete process.env.TZ;
else process.env.TZ = originalTimezone;
