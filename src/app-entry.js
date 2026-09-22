const RTW_DELETE_ACCOUNT_PENDING = 'rtw_delete_account_pending_v1';

function captureAccountDeletionRequest() {
  const params = new URLSearchParams(location.search);
  if (params.get('delete-account') !== '1') return;
  localStorage.setItem(RTW_DELETE_ACCOUNT_PENDING, '1');
  params.delete('delete-account');
  const query = params.toString();
  history.replaceState({}, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash || ''}`);
}

captureAccountDeletionRequest();

function normalizeAndroidShareAtBoot() {
  const params = new URLSearchParams(location.search);
  const sharedUrl = String(params.get('share') || '').trim();
  if (!sharedUrl) return;

  const target = new URL('/read/', location.origin);
  target.searchParams.set('new', '1');
  target.searchParams.set('url', sharedUrl);
  history.replaceState({}, '', `${target.pathname}${target.search}`);
}

normalizeAndroidShareAtBoot();

import { bootstrapNativeOAuth, bootstrapOAuth } from './auth-oauth.js';

try {
  await bootstrapOAuth();
  await bootstrapNativeOAuth();
} catch (error) {
  console.error('OAuth callback failed', error);
}

await import('./main.js');
await import('./auth-enhance.js');
await import('./reading-entry-flow.js');
await import('./reading-import-ui.js');
await import('./reading-ai-ui.js');
await import('./records-ui.js');

const { bootstrapNativeNavigation } = await import('./mobile-native.js');
await bootstrapNativeNavigation();
