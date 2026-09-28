import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/app-entry.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/import\(([^)]+)\)/g, 'load($1)');

async function assertEntryTimeout(blocked, code, timeoutMs) {
  let now = 0;
  let nextId = 0;
  let reloads = 0;
  let replaced = null;
  const timers = new Map();
  const root = { innerHTML: '', handler: null, querySelector() { return { addEventListener: (_name, callback) => { root.handler = callback; } }; } };
  const context = {
    location: { search: blocked === 'oauth' ? '?code=fake-once' : '', pathname: '/app/', hash: '', reload() { reloads++; } },
    history: { replaceState(_state, _title, url) { replaced = url; } },
    localStorage: { setItem() {} }, URLSearchParams,
    document: { querySelector: (selector) => selector === '#app' ? root : { addEventListener: (_name, callback) => { root.handler = callback; } } },
    bootstrapOAuth: () => blocked === 'oauth' ? new Promise(() => {}) : Promise.resolve(),
    bootstrapNativeOAuth: () => blocked === 'native' ? new Promise(() => {}) : Promise.resolve(),
    load(path) {
      if (blocked === 'auth-module' && path === './auth-oauth.js') return new Promise(() => {});
      if (blocked === 'module' && path === './main.js') return new Promise(() => {});
      if (path === './auth-oauth.js') return Promise.resolve({ bootstrapOAuth: context.bootstrapOAuth, bootstrapNativeOAuth: context.bootstrapNativeOAuth });
      return Promise.resolve({ bootstrapNativeNavigation: async () => {} });
    },
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
    console: { error() {} }
  };
  const running = vm.runInNewContext(`(async () => { ${source} })()`, context);
  for (let i = 0; i < 100; i++) await Promise.resolve();
  now = timeoutMs;
  for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.match(root.innerHTML, new RegExp(code));
  assert.match(root.innerHTML, /다시 시도/);
  assert.equal(context.__rtwEntryBlocked, true);
  root.handler();
  assert.equal(reloads, 1);
  if (blocked === 'oauth') assert.equal(replaced, '/app/');
  await running;
}

test('auth module timeout shows retry', () => assertEntryTimeout('auth-module', 'AUTH_MODULE_TIMEOUT', 15_000));
test('OAuth callback timeout shows retry', () => assertEntryTimeout('oauth', 'OAUTH_TIMEOUT', 10_000));
test('native OAuth bootstrap timeout shows retry', () => assertEntryTimeout('native', 'NATIVE_TIMEOUT', 10_000));
test('main module timeout shows retry', () => assertEntryTimeout('module', 'APP_MODULE_TIMEOUT', 15_000));
