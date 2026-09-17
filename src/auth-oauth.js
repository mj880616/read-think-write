import { supabase } from './supabase.js';
import { APP_BASE } from './config.js';
import { isOAuthCallback, rememberLoginUntil } from './model.js';

const REMEMBER_LOGIN_KEY = 'rtw_remember_until_v1';

function rememberLogin() {
  localStorage.setItem(REMEMBER_LOGIN_KEY, String(rememberLoginUntil()));
}

function functionErrorMessage(error, fallback) {
  if (!error) return fallback;
  return error.message || fallback;
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

export async function signInWithGoogle() {
  const redirectTo = new URL(APP_BASE, location.origin).href;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo }
  });
  if (error) throw error;
}

export async function ownerSetupStatus() {
  const { data, error } = await supabase.functions.invoke('rtw-owner-claim', {
    body: { action: 'status' }
  });
  if (error) throw new Error(functionErrorMessage(error, '소유자 상태를 확인하지 못했습니다.'));
  return data?.status ?? 'not-owner';
}

export async function claimOwner(setupCode) {
  const { data, error } = await supabase.functions.invoke('rtw-owner-claim', {
    body: { action: 'claim', setupCode: String(setupCode ?? '').trim() }
  });
  if (error) {
    let message = functionErrorMessage(error, '초기 설정에 실패했습니다.');
    try {
      const payload = await error.context?.json?.();
      if (payload?.message) message = payload.message;
    } catch {
      // Keep the original function error.
    }
    throw new Error(message);
  }
  rememberLogin();
  return data;
}
