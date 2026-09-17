import { bootstrapOAuth } from './auth-oauth.js';

try {
  await bootstrapOAuth();
} catch (error) {
  console.error('OAuth callback failed', error);
}

await import('./main.js');
await import('./auth-enhance.js');
