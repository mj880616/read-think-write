import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/reading-entry-flow.js', import.meta.url), 'utf8');

assert.match(source, /a\[href\*="new=1"\]/);
assert.match(source, /data-new-reading-link/);
assert.match(source, /event\.preventDefault\(\);\n\s*openNewReading\(\)/);
assert.match(source, /history\.pushState\(\{\}, '', appHref\('\/read\/'\)\)/);
assert.match(source, /dispatchEvent\(new PopStateEvent\('popstate'\)\)/);

console.log('reading entry links use SPA navigation');
