import { BASE_PATH } from './config.js';

const listeners = new Set();

function restoreDeepLink() {
  const saved = sessionStorage.getItem('rtw:redirect');
  if (!saved) return;
  sessionStorage.removeItem('rtw:redirect');
  const url = new URL(saved, window.location.origin);
  if (url.pathname.startsWith(BASE_PATH)) {
    history.replaceState({}, '', url.pathname + url.search + url.hash);
  }
}

export function currentRoute() {
  const path = location.pathname.startsWith(BASE_PATH)
    ? `/${location.pathname.slice(BASE_PATH.length).replace(/^\/+|\/+$/g, '')}`
    : '/';
  const normalized = path === '/' ? '/' : path.replace(/\/$/, '');
  const parts = normalized.split('/').filter(Boolean);
  const params = new URLSearchParams(location.search);
  if (parts[0] === 'resource' && parts[1]) return { name: 'resource', id: parts[1], params };
  if (parts[0] === 'archive') return { name: 'archive', year: parts[1] || null, month: parts[2] || null, params };
  const known = new Set(['login','reading','notes','topics','questions','search']);
  return { name: known.has(parts[0]) ? parts[0] : 'home', params };
}

export function href(path = '') {
  return `${BASE_PATH}${String(path).replace(/^\//, '')}`;
}

export function navigate(path, { replace = false } = {}) {
  const url = path.startsWith(BASE_PATH) ? path : href(path);
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
  notify();
}

function notify() {
  const route = currentRoute();
  listeners.forEach(fn => fn(route));
}

export function startRouter(callback) {
  restoreDeepLink();
  listeners.add(callback);
  window.addEventListener('popstate', notify);
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-route]');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.getAttribute('href'));
  });
  callback(currentRoute());
  return () => listeners.delete(callback);
}
