import assert from 'node:assert/strict';
import fs from 'node:fs';

const patch = fs.readFileSync(new URL('../mobile/scripts/patch-android-auth.mjs', import.meta.url), 'utf8');
const reading = fs.readFileSync(new URL('../src/reading-entry-flow.js', import.meta.url), 'utf8');

assert.match(patch, /android\.intent\.action\.SEND/);
assert.match(patch, /android:mimeType="text\/plain"/);
assert.match(patch, /Intent\.EXTRA_TEXT/);
assert.match(patch, /https?\\:\\/\\//);
assert.match(patch, /\?share=/);

assert.match(reading, /params\.get\('share'\)/);
assert.match(reading, /openNewReading\(sharedUrl\)/);
assert.match(reading, /params\.delete\('share'\)/);

console.log('Android share target contract ok');
