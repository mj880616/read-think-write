import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const callback = main.slice(main.indexOf('supabase.auth.onAuthStateChange'), main.indexOf('\n\nrender();', main.indexOf('supabase.auth.onAuthStateChange')));

assert.match(callback, /setTimeout\(\(\) => \{/);
assert.doesNotMatch(callback, /if \(setAuthUser\(next\)\) \{[\s\S]*?if \(next\) render\(\)/);

console.log('auth state render is deferred');
