import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync(new URL('../mobile/capacitor.config.json', import.meta.url), 'utf8'));
const patch = fs.readFileSync(new URL('../mobile/scripts/patch-android-auth.mjs', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../.github/workflows/android.yml', import.meta.url), 'utf8');
const privacy = fs.readFileSync(new URL('../privacy.html', import.meta.url), 'utf8');
const support = fs.readFileSync(new URL('../support.html', import.meta.url), 'utf8');

assert.equal(config.appId, 'com.bokdoong.read');
assert.ok(!patch.includes('com.bokdoong.read.captest'));
assert.ok(patch.includes('java/com/bokdoong/read/MainActivity.java'));
assert.match(workflow, /bundleRelease/);
assert.match(workflow, /READSAENGGI_UPLOAD_KEYSTORE_B64/);
assert.match(workflow, /jarsigner -verify/);
assert.match(privacy, /개인정보처리방침/);
assert.match(privacy, /개인정보를 판매하지 않습니다/);
assert.match(support, /읽생기 지원/);

console.log('Play release configuration ok');
