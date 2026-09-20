import { supabase } from './supabase.js';
import { APP_BASE } from './config.js';
import { isOAuthCallback, rememberLoginUntil, shouldUnlinkEmailIdentity } from './model.js';

const REMEMBER_LOGIN_KEY = 'rtw_remember_until_v1';
const NATIVE_OAUTH_REDIRECT = 'com.bokdoong.read://auth/callback';
let nativeOAuthBootstrapped = false;

function rememberLogin() {
  localStorage.setItem(REMEMBER_LOGIN_KEY, String(rememberLoginUntil()));
}

function functionErrorMessage(error, fallback) {
  if (!error) return fallback;
  return error.message || fallback;
}

function capacitor() {
  return globalThis.Capacitor ?? null;
}

function isNativeAndroid() {
  const cap = capacitor();
  if (!cap) return false;
  try {
    return cap.isNativePlatform?.() === true && cap.getPlatform?.() === 'android';
  } catch {
    return false;
  }
}

function nativePlugin(name) {
  return capacitor()?.Plugins?.[name] ?? null;
}

function parseNativeOAuthUrl(rawUrl) {
  if (!rawUrl) return null;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== 'com.bokdoong.read:' || url.hostname !== 'auth' || url.pathname !== '/callback') {
    return null;
  }

  return url;
}

async function closeNativeBrowser() {
  const browser = nativePlugin('Browser');
  if (!browser?.close) return;
  try {
    await browser.close();
  } catch {
    // The browser may already have closed when Android dispatched the deep link.
  }
}

async function completeNativeOAuth(rawUrl) {
  const url = parseNativeOAuthUrl(rawUrl);
  if (!url) return null;

  const oauthError = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (oauthError) {
    await closeNativeBrowser();
    throw new Error(oauthError);
  }

  const code = url.searchParams.get('code');
  if (!code) return null;

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  await closeNativeBrowser();
  if (error) throw error;

  rememberLogin();
  return data?.session?.user ?? data?.user ?? null;
}

export async function bootstrapOAuth() {
  if (!isOAuthCallback(location.search)) return null;
  const code = new URLSearchParams(location.search).get('code');
  if (!code) return null;

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  rememberLogin();

  const cleanUrl = `${location.pathname}${location.hash || ''}`;
  history.replaceState({}, '', cleanUrl);
  return data?.session?.user ?? data?.user ?? null;
}

export async function bootstrapNativeOAuth() {
  if (!isNativeAndroid() || nativeOAuthBootstrapped) return null;
  nativeOAuthBootstrapped = true;

  const app = nativePlugin('App');
  if (!app?.addListener) return null;

  await app.addListener('appUrlOpen', ({ url }) => {
    completeNativeOAuth(url).catch((error) => {
      console.error('Native OAuth callback failed', error);
      globalThis.dispatchEvent(new CustomEvent('rtw:native-oauth-error', {
        detail: { message: functionErrorMessage(error, 'Google 로그인에 실패했습니다.') }
      }));
    });
  });

  if (!app.getLaunchUrl) return null;
  const launch = await app.getLaunchUrl();
  if (!launch?.url) return null;
  return completeNativeOAuth(launch.url);
}

export async function signInWithGoogle() {
  if (isNativeAndroid()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: NATIVE_OAUTH_REDIRECT,
        skipBrowserRedirect: true
      }
    });
    if (error) throw error;
    if (!data?.url) throw new Error('Google 로그인 주소를 만들지 못했습니다.');

    const browser = nativePlugin('Browser');
    if (browser?.open) {
      await browser.open({ url: data.url });
      return;
    }

    location.assign(data.url);
    return;
  }

  const redirectTo = new URL(APP_BASE, location.origin).href;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo }
  });
  if (error) throw error;
}

export async function keepGoogleIdentityOnly() {
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw error;
  const identities = data?.identities ?? [];
  if (!shouldUnlinkEmailIdentity(identities)) return false;

  const emailIdentity = identities.find((identity) => identity.provider === 'email');
  if (!emailIdentity) return false;

  const { error: unlinkError } = await supabase.auth.unlinkIdentity(emailIdentity);
  if (unlinkError) throw unlinkError;
  return true;
}
