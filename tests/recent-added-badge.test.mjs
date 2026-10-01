import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const originalTimezone = process.env.TZ;
process.env.TZ = 'America/Los_Angeles';
assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, 'America/Los_Angeles');
assert.equal(new Date('2026-09-30T15:30:00Z').getDate(), 30,
  'the device still sees September 30 while Seoul has reached October 1');

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const itemSource = source.slice(source.indexOf('function empty('), source.indexOf('function bindResourceBookmarkButtons'));
const context = {
  state: { bookmarks: [] },
  esc: (value) => value,
  href: (path) => path,
  formatDate: () => '발표일',
  Date: class extends Date { static now() { return Date.parse('2026-09-30T15:30:00Z'); } }
};
vm.runInNewContext(`${itemSource}\nglobalThis.renderItem = resourceItem;`, context);

const resource = (created_at, published_on = '2020-01-01') => ({
  id: 'resource-1', title: '테스트 글', created_at, published_on
});

assert.match(context.renderItem(resource('2026-09-30T15:00:00Z'), { showRecentBadge: true }), /새 글/,
  'a save just after Seoul midnight counts as today');
assert.match(context.renderItem(resource('2026-09-29T15:00:00Z'), { showRecentBadge: true }), /새 글/,
  'a save at the start of yesterday in Seoul has a badge');
assert.doesNotMatch(context.renderItem(resource('2026-09-29T14:59:59Z'), { showRecentBadge: true }), /새 글/,
  'a save just before yesterday in Seoul does not have a badge');
assert.doesNotMatch(context.renderItem(resource('2026-10-01T15:00:00Z'), { showRecentBadge: true }), /새 글/,
  'a future Seoul calendar day does not have a badge');
assert.doesNotMatch(context.renderItem(resource('2026-09-30T15:31:00Z'), { showRecentBadge: true }), /새 글/,
  'a future save on the current Seoul calendar day does not have a badge');
assert.doesNotMatch(context.renderItem(resource(null, '2026-10-01'), { showRecentBadge: true }), /새 글/,
  'publication date alone does not make a reading recently added');
assert.doesNotMatch(context.renderItem(resource('2026-09-30T15:00:00Z')), /새 글/,
  'other views using the shared item renderer do not gain the badge');

const readListSource = source.slice(source.indexOf('function recentQueryWindow('), source.indexOf('function linkCheckbox('));
const root = { innerHTML: '' };
const readListContext = {
  ...context,
  root,
  state: { resources: [resource('2026-09-30T15:00:00Z')], recentResources: [], recentCount: 0, bookmarks: [] },
  location: { search: '' },
  shell: (html) => html,
  bindCommon: () => {},
  bindNoteActions: () => {},
  bindResourceBookmarkButtons: () => {},
  document: { querySelector: () => ({ addEventListener() {} }) }
};
vm.runInNewContext(`${itemSource}\n${readListSource}\nreadListView();`, readListContext);
assert.match(root.innerHTML, /<span class="recent-added-badge">새 글<\/span> 테스트 글/,
  'the actual reading list shows the badge beside a newly saved title');

console.log('recently added badge follows save time in the read list');
if (originalTimezone === undefined) delete process.env.TZ;
else process.env.TZ = originalTimezone;
