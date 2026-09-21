import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const redirect = fs.readFileSync(new URL('../src/redirect.js', import.meta.url), 'utf8');

assert.match(config, /host === 'read\.bokdoong\.com' \? '\/' : '\/read-think-write\/'/);
assert.match(redirect, /APP_BASE === '\/' \? '' : APP_BASE\.replace/);

console.log('custom domain uses root app base');
