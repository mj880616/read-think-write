import { href, navigate } from '../router.js';
import { signOut } from '../runtime/auth.js';

const nav = [
  ['/', '홈'], ['/reading', '읽기'], ['/notes', '생각'], ['/topics', '주제'], ['/questions', '질문'], ['/archive/2026', '아카이브'], ['/search', '검색'],
];

export function mountShell(root) {
  root.innerHTML = `
    <div class="app-shell">
      <header class="site-header">
        <a class="brand" data-route href="${href('')}">읽고 생각하고 쓰기</a>
        <nav class="main-nav">${nav.map(([p,l]) => `<a data-route data-nav="${p}" href="${href(p)}">${l}</a>`).join('')}</nav>
        <button class="quiet-button" id="logoutButton" type="button">로그아웃</button>
      </header>
      <main id="main" class="main-content"></main>
    </div>`;
  root.querySelector('#logoutButton').addEventListener('click', async () => {
    await signOut();
    navigate('/login', { replace: true });
  });
  return {
    main: root.querySelector('#main'),
    setActive(path) {
      root.querySelectorAll('[data-nav]').forEach(a => {
        const p = a.dataset.nav;
        a.classList.toggle('active', p === '/' ? path === '/' : path.startsWith(p));
      });
    },
  };
}
