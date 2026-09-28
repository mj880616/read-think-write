import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const configSource = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const oauthSource = readFileSync(new URL('../src/auth-oauth.js', import.meta.url), 'utf8');

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

for (const [hostname, base, redirectTo] of [
  ['read.bokdoong.com', '/', 'https://read.bokdoong.com/'],
  ['mj880616.github.io', '/read-think-write/', 'https://mj880616.github.io/read-think-write/'],
  ['read-test.bokdoong.com', '/', 'https://read-test.bokdoong.com/']
]) {
  assert.equal(configFor(hostname).APP_BASE, base, `${hostname} APP_BASE`);
  const { options } = await oauthOptions({ hostname, origin: `https://${hostname}` });
  assert.equal(options.redirectTo, redirectTo, `${hostname} web OAuth redirect`);
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

console.log('app base and OAuth redirects match production, test, fallback, and native contracts');
