import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/+esm';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@16.2.1/lib/marked.esm.js';
import { supabase } from './supabase.js';
import { APP_BASE } from './config.js';

const root = document.querySelector('#app');
const RECORDS_PATH = '/records/';
let rendering = false;
let queued = false;
let recordsCache = null;
let contextCache = undefined;
let cacheEpoch = 0;
let authUserId = null;
let authError = null;
let authEventSeen = false;
let resolveAuthReady;
const authReady = new Promise((resolve) => { resolveAuthReady = resolve; });

function resetCaches() {
  recordsCache = null;
  contextCache = undefined;
  cacheEpoch += 1;
}

function setAuthUser(ownerId) {
  authError = null;
  if (ownerId !== authUserId) {
    authUserId = ownerId;
    resetCaches();
    clearRenderedRecords();
    if (ownerId) scheduleEnhance();
  }
  resolveAuthReady();
}

async function currentCacheOwnerId() {
  await authReady;
  if (authError) throw authError;
  return authUserId;
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function renderMarkdown(value = '') {
  return DOMPurify.sanitize(marked.parse(value || ''));
}

function appRoot() {
  return APP_BASE.replace(/\/$/, '');
}

function href(path) {
  return `${appRoot()}${path}`;
}

function pathFromLocation() {
  return location.pathname.replace(appRoot(), '') || '/';
}

function isRecordsRoute(path = pathFromLocation()) {
  return path === '/records' || path === '/records/' || /^\/records\/[0-9a-f-]+\/?$/i.test(path);
}

function recordIdFromPath(path = pathFromLocation()) {
  return path.match(/^\/records\/([0-9a-f-]+)\/?$/i)?.[1] || null;
}

function labelFor(type) {
  return ({
    writing_training: '글쓰기 훈련',
    learning: '배운 것',
    thought_change: '생각의 변화',
    principle: '나의 원칙',
    question: '계속 생각할 질문'
  })[type] || '기록';
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ko-KR');
}

async function listRecords(force = false) {
  const ownerId = await currentCacheOwnerId();
  if (!ownerId) return [];
  if (recordsCache && !force) return recordsCache;
  const epoch = cacheEpoch;
  const { data, error } = await supabase
    .from('rtw_records')
    .select('*')
    .order('updated_at', { ascending: false });
  if (await currentCacheOwnerId() !== ownerId || cacheEpoch !== epoch) return listRecords(force);
  if (error) throw error;
  recordsCache = data ?? [];
  return recordsCache;
}

async function getWritingContext(force = false) {
  const ownerId = await currentCacheOwnerId();
  if (!ownerId) return null;
  if (contextCache !== undefined && !force) return contextCache;
  const epoch = cacheEpoch;
  const { data, error } = await supabase
    .from('rtw_writing_context')
    .select('*')
    .maybeSingle();
  if (await currentCacheOwnerId() !== ownerId || cacheEpoch !== epoch) return getWritingContext(force);
  if (error) throw error;
  contextCache = data ?? null;
  return contextCache;
}

async function updateRecord(id, input) {
  const { data, error } = await supabase
    .from('rtw_records')
    .update({
      title: input.title.trim(),
      a_original: input.a_original,
      b_feedback: input.b_feedback,
      c_revision: input.c_revision,
      takeaway: input.takeaway,
      tags: input.tags,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  recordsCache = null;
  return data;
}

async function deleteRecord(id) {
  const { error } = await supabase.from('rtw_records').delete().eq('id', id);
  if (error) throw error;
  recordsCache = null;
}

function ensureRecordsNav() {
  const nav = root?.querySelector('.nav');
  if (!nav || nav.querySelector('[data-records-nav]')) return;
  const link = document.createElement('a');
  link.href = href(RECORDS_PATH);
  link.dataset.recordsNav = RECORDS_PATH;
  link.textContent = '기록';
  const notesLink = [...nav.querySelectorAll('a')].find((a) => a.getAttribute('href')?.endsWith('/notes/'));
  if (notesLink?.nextSibling) nav.insertBefore(link, notesLink.nextSibling);
  else nav.appendChild(link);
}

function setRecordsActive(active) {
  const nav = root?.querySelector('.nav');
  if (!nav) return;
  if (active) nav.querySelectorAll('a').forEach((a) => a.classList.remove('active'));
  nav.querySelector('[data-records-nav]')?.classList.toggle('active', active);
}

function tagHtml(tags = []) {
  if (!tags?.length) return '';
  return `<div class="record-tags">${tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div>`;
}

function recordIndexItem(record) {
  return `<a class="record-list-item" href="${href('/records/' + record.id + '/')}" data-record-link="${record.id}">
    <div class="record-list-top">
      <span class="record-kind">${esc(labelFor(record.record_type))}</span>
      <span class="meta">${formatDate(record.updated_at)}</span>
    </div>
    <strong>${esc(record.title)}</strong>
    ${record.takeaway ? `<p>${esc(record.takeaway)}</p>` : ''}
    ${tagHtml(record.tags)}
  </a>`;
}

function page() {
  return root?.querySelector('.page');
}

function clearRenderedRecords() {
  root?.querySelector('#recent-records-card')?.remove();
  root?.querySelector('[data-record-search-results]')?.remove();
  if (isRecordsRoute()) {
    const target = page();
    if (target?.dataset.recordsRoute) {
      target.innerHTML = '';
      delete target.dataset.recordsRoute;
    }
  }
}

async function recordsListView() {
  const target = page();
  if (!target) return;
  const ownerId = await currentCacheOwnerId();
  if (!ownerId) return;
  const epoch = cacheEpoch;
  const [records, context] = await Promise.all([listRecords(), getWritingContext()]);
  if (await currentCacheOwnerId() !== ownerId || cacheEpoch !== epoch) return recordsListView();
  target.dataset.recordsRoute = 'list';
  target.innerHTML = `
    <section class="hero records-hero">
      <div class="eyebrow">기록</div>
      <h1>생각을 훈련의 흔적으로 남기기</h1>
      <p>글쓰기 훈련은 ChatGPT에서 진행하고, 완결된 A·B·C와 배운 원칙만 이곳에 쌓는다. 저장은 내가 요청했을 때만 이루어진다.</p>
    </section>
    <section class="records-layout">
      <div class="card records-index">
        <div class="records-card-head"><div><h2>기록</h2><p class="muted">원문과 피드백, 수정안을 한 묶음으로 다시 본다.</p></div><span class="records-count">${records.length}</span></div>
        <div class="records-list">${records.map(recordIndexItem).join('') || '<div class="empty">아직 기록이 없음</div>'}</div>
      </div>
      <div class="card writing-context-card">
        <details>
          <summary>글쓰기 훈련 기준</summary>
          <div class="writing-context-body">${context?.profile_md ? renderMarkdown(context.profile_md) : '<p class="muted">저장된 훈련 기준이 없음.</p>'}</div>
        </details>
      </div>
    </section>`;
  bindRecordPageActions();
}

function recordSection(letter, title, body, className = '') {
  if (!body) return '';
  return `<section class="card record-section ${className}">
    <div class="record-section-label"><span>${letter}</span><h2>${esc(title)}</h2></div>
    <div class="${className === 'record-feedback' ? 'record-markdown' : 'record-text'}">${className === 'record-feedback' ? renderMarkdown(body) : esc(body)}</div>
  </section>`;
}

async function recordDetailView(id) {
  const target = page();
  if (!target) return;
  const ownerId = await currentCacheOwnerId();
  if (!ownerId) return;
  const epoch = cacheEpoch;
  const records = await listRecords();
  if (await currentCacheOwnerId() !== ownerId || cacheEpoch !== epoch) return recordDetailView(id);
  const record = records.find((item) => item.id === id);
  if (!record) {
    target.innerHTML = '<section class="hero"><h1>기록을 찾을 수 없음</h1><a class="btn secondary" href="' + href(RECORDS_PATH) + '" data-records-nav="' + RECORDS_PATH + '">기록으로</a></section>';
    return;
  }
  target.dataset.recordsRoute = id;
  target.innerHTML = `
    <div class="record-detail-head">
      <a class="record-back" href="${href(RECORDS_PATH)}" data-records-nav="${RECORDS_PATH}">← 기록</a>
      <div class="eyebrow">${esc(labelFor(record.record_type))}</div>
      <h1>${esc(record.title)}</h1>
      <div class="meta">${formatDate(record.updated_at)}</div>
      ${tagHtml(record.tags)}
    </div>
    ${record.takeaway ? `<section class="record-lesson"><div class="eyebrow">이번에 배운 것</div><p>${esc(record.takeaway)}</p></section>` : ''}
    <div class="record-abc">
      ${recordSection('A', '내가 처음 쓴 글', record.a_original)}
      ${recordSection('B', '피드백', record.b_feedback, 'record-feedback')}
      ${recordSection('C', '수정 제안', record.c_revision)}
    </div>
    <section class="record-manage">
      <button class="btn secondary small" type="button" data-record-edit-toggle>기록 수정</button>
      <button class="btn danger small" type="button" data-record-delete="${record.id}">삭제</button>
    </section>
    <section class="card record-edit-card" data-record-edit-card hidden>
      <h2>기록 정리</h2>
      <p class="muted">훈련은 채팅에서 진행한다. 이 화면은 저장된 결과의 오탈자나 분류를 정리할 때만 사용한다.</p>
      <form class="form" data-record-edit-form="${record.id}">
        <div class="field"><label>제목</label><input name="title" required value="${esc(record.title)}"></div>
        <div class="field"><label>A. 내가 처음 쓴 글</label><textarea name="a_original">${esc(record.a_original)}</textarea></div>
        <div class="field"><label>B. 피드백</label><textarea name="b_feedback">${esc(record.b_feedback)}</textarea></div>
        <div class="field"><label>C. 수정 제안</label><textarea name="c_revision">${esc(record.c_revision)}</textarea></div>
        <div class="field"><label>이번에 배운 것</label><textarea name="takeaway">${esc(record.takeaway)}</textarea></div>
        <div class="field"><label>태그</label><input name="tags" value="${esc((record.tags || []).join(', '))}" placeholder="쉼표로 구분"></div>
        <div class="inline-actions"><button class="btn small" type="submit">저장</button><button class="btn secondary small" type="button" data-record-edit-cancel>취소</button></div>
        <div class="status" data-record-edit-status></div>
      </form>
    </section>`;
  bindRecordPageActions();
}

function bindRecordPageActions() {
  root.querySelector('[data-record-edit-toggle]')?.addEventListener('click', () => {
    const card = root.querySelector('[data-record-edit-card]');
    if (card) {
      card.hidden = !card.hidden;
      if (!card.hidden) card.querySelector('input')?.focus();
    }
  });
  root.querySelector('[data-record-edit-cancel]')?.addEventListener('click', () => {
    const card = root.querySelector('[data-record-edit-card]');
    if (card) card.hidden = true;
  });
  root.querySelector('[data-record-edit-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector('[data-record-edit-status]');
    status.textContent = '저장 중…';
    status.classList.remove('error');
    try {
      const values = Object.fromEntries(new FormData(form));
      const tags = String(values.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
      await updateRecord(form.dataset.recordEditForm, { ...values, tags });
      await recordDetailView(form.dataset.recordEditForm);
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    }
  });
  root.querySelector('[data-record-delete]')?.addEventListener('click', async (event) => {
    if (!confirm('이 기록을 삭제할까요?')) return;
    await deleteRecord(event.currentTarget.dataset.recordDelete);
    history.pushState({}, '', href(RECORDS_PATH));
    await renderRecordsRoute();
  });
}

async function renderRecordsRoute() {
  if (rendering || !isRecordsRoute()) return;
  const target = page();
  const topbar = root?.querySelector('.topbar');
  if (!target || !topbar) return;
  rendering = true;
  try {
    ensureRecordsNav();
    setRecordsActive(true);
    const id = recordIdFromPath();
    if (id) await recordDetailView(id);
    else await recordsListView();
  } catch (error) {
    target.innerHTML = `<section class="hero"><div class="eyebrow">기록</div><h1>기록을 불러오지 못함</h1><p>${esc(error.message)}</p></section>`;
  } finally {
    rendering = false;
  }
}

async function enhanceHome() {
  if (pathFromLocation() !== '/') return;
  const grid = root?.querySelector('.page .grid');
  if (!grid || root.querySelector('#recent-records-card')) return;
  try {
    const ownerId = await currentCacheOwnerId();
    if (!ownerId) return;
    const epoch = cacheEpoch;
    const records = (await listRecords()).slice(0, 3);
    if (await currentCacheOwnerId() !== ownerId || cacheEpoch !== epoch) return enhanceHome();
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'recent-records-card';
    card.innerHTML = `<h2>최근 기록</h2><div class="records-home-list">${records.map(recordIndexItem).join('') || '<div class="empty">아직 기록이 없음</div>'}</div><div class="inline-actions"><a class="btn secondary small" href="${href(RECORDS_PATH)}" data-records-nav="${RECORDS_PATH}">기록 전체 보기</a></div>`;
    const children = [...grid.children];
    if (children[1]?.nextSibling) grid.insertBefore(card, children[1].nextSibling);
    else grid.appendChild(card);
  } catch {}
}

async function appendSearchRecords() {
  if (!['/search', '/search/'].includes(pathFromLocation())) return;
  const input = root.querySelector('#search-input');
  const output = root.querySelector('#search-results');
  if (!input || !output || output.querySelector('[data-record-search-results]')) return;
  const query = input.value.trim().toLocaleLowerCase('ko-KR');
  if (!query) return;
  try {
    const ownerId = await currentCacheOwnerId();
    if (!ownerId) return;
    const epoch = cacheEpoch;
    const records = (await listRecords()).filter((record) => [
      record.title, record.a_original, record.b_feedback, record.c_revision,
      record.takeaway, ...(record.tags || [])
    ].some((value) => String(value || '').toLocaleLowerCase('ko-KR').includes(query)));
    if (await currentCacheOwnerId() !== ownerId || cacheEpoch !== epoch) return appendSearchRecords();
    output.insertAdjacentHTML('beforeend', `<section class="result-section card" data-record-search-results><h2>기록 ${records.length}</h2><div class="records-list">${records.map(recordIndexItem).join('') || '<div class="empty">없음</div>'}</div></section>`);
  } catch {}
}

function bindSearchEnhancement() {
  if (!['/search', '/search/'].includes(pathFromLocation())) return;
  const input = root.querySelector('#search-input');
  if (!input || input.dataset.recordsSearchBound) return;
  input.dataset.recordsSearchBound = 'true';
  input.addEventListener('input', () => queueMicrotask(appendSearchRecords));
  queueMicrotask(appendSearchRecords);
}

async function enhance() {
  ensureRecordsNav();
  if (isRecordsRoute()) return renderRecordsRoute();
  setRecordsActive(false);
  await enhanceHome();
  bindSearchEnhancement();
}

function scheduleEnhance() {
  if (queued) return;
  queued = true;
  queueMicrotask(async () => {
    queued = false;
    await enhance();
  });
}

root?.addEventListener('click', (event) => {
  const recordNav = event.target.closest('[data-records-nav]');
  const recordLink = event.target.closest('[data-record-link]');
  if (!recordNav && !recordLink) return;
  event.preventDefault();
  const path = recordLink ? '/records/' + recordLink.dataset.recordLink + '/' : recordNav.dataset.recordsNav;
  history.pushState({}, '', href(path));
  renderRecordsRoute();
});

window.addEventListener('popstate', () => {
  if (isRecordsRoute()) setTimeout(renderRecordsRoute, 0);
  else setTimeout(scheduleEnhance, 0);
});

supabase.auth.onAuthStateChange((_event, session) => {
  authEventSeen = true;
  setAuthUser(session?.user?.id ?? null);
});

supabase.auth.getSession().then(({ data, error }) => {
  if (authEventSeen) return;
  if (error) {
    authError = error;
    resolveAuthReady();
    return;
  }
  setAuthUser(data?.session?.user?.id ?? null);
}).catch((error) => {
  if (authEventSeen) return;
  authError = error;
  resolveAuthReady();
});

new MutationObserver(() => {
  if (isRecordsRoute() && page()?.dataset.recordsRoute) return;
  scheduleEnhance();
}).observe(root, { childList: true, subtree: true });
scheduleEnhance();
