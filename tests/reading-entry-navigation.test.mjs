import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/reading-entry-flow.js', import.meta.url), 'utf8');

assert.match(source, /a\[href\*="new=1"\]/);
assert.match(source, /data-new-reading-link/);
assert.match(source, /event\.preventDefault\(\);\r?\n\s*openNewReading\(\)/);
assert.match(source, /history\.pushState\(\{\}, '', appHref\('\/read\/'\)\)/);
assert.match(source, /dispatchEvent\(new PopStateEvent\('popstate'\)\)/);

const listStateSource = source.slice(source.indexOf('function showReadListState()'), source.indexOf('function showNewReadingState()'));
const shellClasses = new Set();
const gridClasses = new Set();
let removedFormCard = false;
const hero = {
  closest: () => ({ classList: { add: (name) => shellClasses.add(name) } }),
  nextElementSibling: { classList: { add: (name) => gridClasses.add(name) } }
};
const resourceForm = { closest: () => ({ remove: () => { removedFormCard = true; } }) };
vm.runInNewContext(`${listStateSource}\nshowReadListState();`, {
  document: { querySelector: (selector) => selector === '#resource-form' ? resourceForm : hero },
  addNewReadingButton: () => {}
});
assert.ok(shellClasses.has('read-list-shell'), 'read list receives its desktop-only layout scope');
assert.ok(gridClasses.has('page-section'), 'read list keeps its section spacing');
assert.equal(removedFormCard, true, 'read list hides the new-resource form');

console.log('reading entry links use SPA navigation');
