import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/mobile-native.js', import.meta.url), 'utf8');
const entry = fs.readFileSync(new URL('../src/app-entry.js', import.meta.url), 'utf8');

assert.match(source, /addListener\('backButton'/);
assert.match(source, /history\.back\(\)/);
assert.match(source, /minimizeApp/);
assert.match(source, /document\.addEventListener\('click'/);
assert.match(source, /url\.origin === location\.origin/);
assert.match(source, /browser\.open\(\{ url: externalUrl \}\)/);
assert.match(entry, /bootstrapNativeNavigation/);

console.log('native Android navigation contract ok');
