import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const configSource = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const oauthSource = readFileSync(new URL('../src/auth-oauth.js', import.meta.url), 'utf8');
const allowlistDoc = readFileSync(new URL('../docs/supabase-auth-redirect-urls.md', import.meta.url), 'utf8');
const LEGACY_READ_REDIRECT = 'https://read.bokdoong.com/read-think-write/';

// The Supabase Redirect URLs allowlist lives in docs; compare against it verbatim.
const allowlistBlock = allowlistDoc.match(
  /<!-- redirect-allowlist:start -->\s*```text\r?\n([\s\S]*?)```\s*<!-- redirect-allowlist:end -->/
);
assert.ok(allowlistBlock, 'docs/supabase-auth-redirect-urls.md allowlist block');
const ALLOWED_REDIRECTS = allowlistBlock[1].split(/\r?\n/).filter(Boolean);

function configFor(hostname) {
  return vm.runInNewContext(
    `${configSource.replace(/^export /gm, '')}\n({ APP_BASE, ROOT_APP_HOSTS })`,
    { location: { hostname } }
  );
}

async function oauthOptions(location, capacitor = null) {
  let options;
  const opened = [];
  const context = {
    location,
    Capacitor: capacitor,
    URL,
    ...configFor(location.hostname),
    supabase: {
      auth: {
        async signInWithOAuth(request) {
          options = request.options;
          return { data: { url: 'https://oauth.example/start' }, error: null };
        }
      }
    }
  };
  if (capacitor) capacitor.Plugins.Browser.open = async ({ url }) => { opened.push(url); };
  const executable = oauthSource.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const signInWithGoogle = vm.runInNewContext(`${executable}\nsignInWithGoogle`, context);
  await signInWithGoogle();
  return { options, opened };
}

const computedAllowed = [];
for (const [hostname, base, redirectTo] of [
  ['read.bokdoong.com', '/', 'https://read.bokdoong.com/'],
  ['mj880616.github.io', '/read-think-write/', 'https://mj880616.github.io/read-think-write/'],
  ['read-test.bokdoong.com', '/', 'https://read-test.bokdoong.com/']
]) {
  assert.equal(configFor(hostname).APP_BASE, base, `${hostname} APP_BASE`);
  const { options } = await oauthOptions({ hostname, origin: `https://${hostname}` });
  assert.equal(options.redirectTo, redirectTo, `${hostname} web OAuth redirect`);
  computedAllowed.push(options.redirectTo);
}

const { options: canonicalTest } = await oauthOptions({
  hostname: 'read-test.bokdoong.com',
  origin: 'http://read-test.bokdoong.com'
});
assert.equal(canonicalTest.redirectTo, 'https://read-test.bokdoong.com/');

const preview = { hostname: 'preview.example', origin: 'https://preview.example:8443' };
assert.equal(configFor(preview.hostname).APP_BASE, '/read-think-write/');
const { options: previewOptions } = await oauthOptions(preview);
assert.equal(previewOptions.redirectTo, 'https://preview.example:8443/read-think-write/');

const native = {
  isNativePlatform: () => true,
  getPlatform: () => 'android',
  Plugins: { Browser: {} }
};
const { options: nativeOptions, opened } = await oauthOptions(
  { hostname: 'read-test.bokdoong.com', origin: 'https://read-test.bokdoong.com' },
  native
);
assert.equal(nativeOptions.redirectTo, 'com.bokdoong.read://auth/callback');
assert.equal(nativeOptions.skipBrowserRedirect, true);
assert.deepEqual(opened, ['https://oauth.example/start']);
computedAllowed.push(nativeOptions.redirectTo);

// Every redirect the app computes on a supported surface is in the documented allowlist, and
// every documented entry is still produced by the app (no stale or missing entries).
assert.deepEqual([...computedAllowed].sort(), [...ALLOWED_REDIRECTS].sort(), 'redirects match docs allowlist');

// Hosts outside the allowlist keep today's behavior: their own origin plus the Pages base.
// These redirects are not in Supabase's allowlist, so login there is expected to fail closed.
const outside = [];
for (const [location, redirectTo] of [
  [{ hostname: 'localhost', origin: 'http://localhost:8080' }, 'http://localhost:8080/read-think-write/'],
  [{ hostname: 'www.read.bokdoong.com', origin: 'https://www.read.bokdoong.com' }, 'https://www.read.bokdoong.com/read-think-write/'],
  [{ hostname: 'read.bokdoong.com.', origin: 'https://read.bokdoong.com.' }, 'https://read.bokdoong.com./read-think-write/']
]) {
  const { options } = await oauthOptions(location);
  assert.equal(options.redirectTo, redirectTo, `${location.origin} fallback redirect`);
  assert.ok(!ALLOWED_REDIRECTS.includes(options.redirectTo), `${location.origin} is not allowlisted`);
  outside.push(options.redirectTo);
}

// The removed legacy address must not come back from any path, including legacy deep links.
assert.ok(!ALLOWED_REDIRECTS.includes(LEGACY_READ_REDIRECT), 'legacy address stays out of docs allowlist');
for (const pathname of ['/', '/read-think-write/', '/read-think-write/notes/']) {
  for (const protocol of ['https:', 'http:']) {
    const { options } = await oauthOptions({
      hostname: 'read.bokdoong.com',
      origin: `${protocol}//read.bokdoong.com`,
      pathname
    });
    assert.equal(options.redirectTo, 'https://read.bokdoong.com/', `${protocol}${pathname} redirect`);
  }
}
for (const redirectTo of [...computedAllowed, previewOptions.redirectTo, canonicalTest.redirectTo, ...outside]) {
  assert.notEqual(redirectTo, LEGACY_READ_REDIRECT, 'legacy read redirect is never produced');
}

console.log('app base and OAuth redirects match production, test, fallback, and native contracts');
