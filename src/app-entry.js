import { bootstrapOAuth } from './auth-oauth.js?v=20260918-1';

try {
  await bootstrapOAuth();
} catch (error) {
  console.error('OAuth callback failed', error);
}

await import('./main.js?v=20260918-1');
await import('./auth-enhance.js?v=20260918-1');
await import('./reading-entry-flow.js?v=20260918-1');
await import('./reading-import-ui.js?v=20260918-1');
await import('./reading-ai-ui.js?v=20260918-1');
