import { APP_BASE } from './config.js';

export function restoreRedirect() {
  const p = new URLSearchParams(location.search).get('redirect');
  if (!p) return;
  const clean = p.startsWith('/') ? p : '/' + p;
  const base = APP_BASE === '/' ? '' : APP_BASE.replace(/\/$/, '');
  history.replaceState({}, '', base + clean);
}
