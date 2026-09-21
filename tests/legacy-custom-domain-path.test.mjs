import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(main, /function normalizeLegacyCustomDomainPath\(\)/);
assert.match(main, /const legacyBase = '\/read-think-write'/);
assert.match(main, /location\.pathname\.slice\(legacyBase\.length\) \|\| '\/'/);
assert.match(main, /history\.replaceState\(\{\}, '',/);
assert.match(main, /normalizeLegacyCustomDomainPath\(\);/);

console.log('legacy custom-domain path normalization is present');
