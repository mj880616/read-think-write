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
