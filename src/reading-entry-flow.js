import { APP_BASE } from './config.js';

function basePath() {
  return APP_BASE.replace(/\/$/, '');
}

function appHref(path) {
  return `${basePath()}${path}`;
}

function routePath() {
  return location.pathname.replace(basePath(), '') || '/';
}

function isHome() {
  const path = routePath();
  return path === '/' || path === '';
}

function isReadList() {
  const path = routePath();
  return path === '/read/' || path === '/read';
}

function openNewReading(url = '') {
  const target = new URL(appHref('/read/'), location.origin);
  target.searchParams.set('new', '1');
  if (url) target.searchParams.set('url', url);
  history.pushState({}, '', `${target.pathname}${target.search}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function addHomeQuickAdd() {
  if (!isHome() || document.querySelector('#home-quick-add')) return;
  const hero = document.querySelector('main.page > .hero');
  if (!hero) return;

  const section = document.createElement('section');
  section.className = 'card';
  section.dataset.homeQuickAdd = 'true';
  section.innerHTML = `
    <form id="home-quick-add" class="form">
      <div class="field">
        <label>새 글 바로 추가</label>
        <input name="url" type="url" inputmode="url" placeholder="읽을 글 URL을 붙여넣기" required>
      </div>
      <div class="inline-actions">
        <button class="btn" type="submit">가져오기</button>
        <a class="btn secondary" href="${appHref('/read/?new=1')}">직접 입력</a>
      </div>
    </form>
  `;

  section.querySelector('#home-quick-add').addEventListener('submit', (event) => {
    event.preventDefault();
    const url = String(new FormData(event.currentTarget).get('url') || '').trim();
    if (url) openNewReading(url);
  });

  hero.insertAdjacentElement('afterend', section);
}

function addNewReadingButton(hero) {
  if (hero.querySelector('[data-new-reading-link]')) return;
  const actions = document.createElement('div');
  actions.className = 'inline-actions';
  actions.innerHTML = `<a class="btn" data-new-reading-link href="${appHref('/read/?new=1')}">+ 새 자료</a>`;
  hero.append(actions);
}

function showReadListState() {
  const resourceForm = document.querySelector('#resource-form');
  const hero = document.querySelector('main.page > .hero');
  if (!resourceForm || !hero) return;

  addNewReadingButton(hero);
  resourceForm.closest('.card')?.remove();
}

function showNewReadingState() {
  const resourceForm = document.querySelector('#resource-form');
  const hero = document.querySelector('main.page > .hero');
  if (!resourceForm || !hero || hero.dataset.newReadingView === 'true') return;

  hero.dataset.newReadingView = 'true';
  const eyebrow = hero.querySelector('.eyebrow');
  const title = hero.querySelector('h1');
  const description = hero.querySelector('p');
  if (eyebrow) eyebrow.textContent = '읽기';
  if (title) title.textContent = '새 자료';
  if (description) description.textContent = 'URL로 가져오거나 직접 입력한 뒤 내용을 확인하고 저장한다.';

  const back = document.createElement('div');
  back.className = 'inline-actions';
  back.innerHTML = `<a class="btn secondary small" href="${appHref('/read/')}">← 읽기 목록</a>`;
  hero.append(back);

  const newCard = resourceForm.closest('.card');
  const grid = newCard?.parentElement;
  if (grid) {
    for (const child of [...grid.children]) {
      if (child !== newCard) child.remove();
    }
  }

  resourceForm.addEventListener('submit', () => {
    const target = new URL(appHref('/read/'), location.origin);
    history.replaceState({}, '', target.pathname);
  }, { capture: true });
}

export function enhanceReadingEntryFlow() {
  if (isHome()) {
    addHomeQuickAdd();
    return;
  }
  if (!isReadList()) return;

  const newMode = new URLSearchParams(location.search).get('new') === '1';
  if (newMode) showNewReadingState();
  else showReadListState();
}

const observer = new MutationObserver(() => enhanceReadingEntryFlow());
observer.observe(document.documentElement, { childList: true, subtree: true });
enhanceReadingEntryFlow();
