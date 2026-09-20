import assert from 'node:assert/strict';
import fs from 'node:fs';

const auth = fs.readFileSync(new URL('../src/auth-oauth.js', import.meta.url), 'utf8');
const mobilePackage = JSON.parse(fs.readFileSync(new URL('../mobile/package.json', import.meta.url), 'utf8'));
const patch = fs.readFileSync(new URL('../mobile/scripts/patch-android-auth.mjs', import.meta.url), 'utf8');

assert.match(auth, /com\.bokdoong\.read:\/\/auth\/callback/);
assert.match(auth, /skipBrowserRedirect:\s*true/);
assert.match(auth, /exchangeCodeForSession\(code\)/);
assert.match(auth, /appUrlOpen/);
assert.equal(mobilePackage.dependencies['@capacitor/app'], '8.0.1');
assert.equal(mobilePackage.dependencies['@capacitor/browser'], '8.0.0');
assert.match(patch, /android:scheme="com\.bokdoong\.read"/);
assert.match(patch, /android:host="auth"/);
assert.match(patch, /android:pathPrefix="\/callback"/);

console.log('mobile OAuth contract ok');
