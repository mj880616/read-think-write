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
