import assert from 'node:assert/strict';
import fs from 'node:fs';

const patch = fs.readFileSync(new URL('../mobile/scripts/patch-android-auth.mjs', import.meta.url), 'utf8');
const appEntry = fs.readFileSync(new URL('../src/app-entry.js', import.meta.url), 'utf8');
const reading = fs.readFileSync(new URL('../src/reading-entry-flow.js', import.meta.url), 'utf8');

assert.match(patch, /android\.intent\.action\.SEND/);
assert.match(patch, /android:mimeType="text\/plain"/);
assert.match(patch, /Intent\.EXTRA_TEXT/);
assert.ok(patch.includes('https?://'));
assert.match(patch, /APP_ROOT \+ "\?share="/);
assert.ok(!patch.includes('APP_ROOT + "read/?new=1&url="'));

assert.match(appEntry, /normalizeAndroidShareAtBoot/);
assert.match(appEntry, /params\.get\('share'\)/);
assert.match(appEntry, /target\.searchParams\.set\('new', '1'\)/);
assert.match(appEntry, /target\.searchParams\.set\('url', sharedUrl\)/);
assert.match(appEntry, /history\.replaceState/);

assert.match(reading, /params\.get\('share'\)/);
assert.match(reading, /openNewReading\(sharedUrl\)/);

console.log('Android root share handoff and SPA boot normalization ok');
