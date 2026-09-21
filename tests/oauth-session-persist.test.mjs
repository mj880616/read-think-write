import assert from 'node:assert/strict';
import fs from 'node:fs';

const auth = fs.readFileSync(new URL('../src/auth-oauth.js', import.meta.url), 'utf8');

const nativeStart = auth.indexOf('async function completeNativeOAuth');
const nativeEnd = auth.indexOf('export async function bootstrapOAuth');
const nativeBlock = auth.slice(nativeStart, nativeEnd);

assert.ok(nativeBlock.indexOf('rememberLogin();') < nativeBlock.indexOf('exchangeCodeForSession(code)'));

const webStart = auth.indexOf('export async function bootstrapOAuth');
const webEnd = auth.indexOf('export async function bootstrapNativeOAuth');
const webBlock = auth.slice(webStart, webEnd);

assert.ok(webBlock.indexOf('rememberLogin();') < webBlock.indexOf('exchangeCodeForSession(code)'));
assert.match(auth, /localStorage\.removeItem\(REMEMBER_LOGIN_KEY\)/);

console.log('OAuth remember window is set before session exchange');
