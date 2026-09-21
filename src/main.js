import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/+esm';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@16.2.1/lib/marked.esm.js';
import { supabase } from './supabase.js';
import * as api from './api.js';
import { APP_BASE, APP_BUILD } from './config.js';
import { formatDate, groupResourcesByMonth, matchesQuery, safeHttpUrl } from './model.js';
import { bookmarkSelectionData, locateBookmarkRange } from './bookmark-location.js';
import { restoreRedirect } from './redirect.js';

restoreRedirect();

const root = document.querySelector('#app');
const PRIMARY_TABS = [
  { key: 'home', label: '홈', path: '/' },
  { key: 'read', label: '읽기', path: '/read/' },
  { key: 'bookmarks', label: '책갈피', path: '/bookmarks/' },
  { key: 'notes', label: '메모', path: '/notes/' },
  { key: 'topics', label: '주제', path: '/topics/' },
  { key: 'questions', label: '질문', path: '/questions/' },
  { key: 'archive', label: '아카이브', path: '/archive/2026/' },
  { key: 'search', label: '검색', path: '/search/' }
];
const SWIPE_TABS = [
  ...PRIMARY_TABS.slice(0, 4),
  { key: 'records', label: '쓰기', path: '/records/' },
  ...PRIMARY_TABS.slice(4)
];
let user = null;
let authEpoch = 0;
let dataReadyUserId = null;
let accessReadyUserId = null;
let betaAccess = null;
let state = emptyUserState();

function emptyUserState() {
  return { resources: [], notes: [], questions: [], topics: [], bookmarks: [], relations: [], noteTypes: [] };
}

function clearUserState() {
  state = emptyUserState();
  selectedNoteTypeFilter = '';
}

function isCurrentRequest(userId, epoch, route) {
  return user?.id === userId && authEpoch === epoch && (route === undefined || pathFromLocation() === route);
}

function currentViewGuard() {
  const userId = user?.id;
  const epoch = authEpoch;
  const route = pathFromLocation();
  return () => isCurrentRequest(userId, epoch, route);
}

function setAuthUser(next) {
  if (next?.id === user?.id) {
    user = next;
    return false;
  }
  authEpoch += 1;
  user = next;
  dataReadyUserId = null;
  accessReadyUserId = null;
  betaAccess = null;
  clearUserState();
  root.innerHTML = '<div class="shell"><div class="empty">불러오는 중…</div></div>';
  return true;
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function renderMarkdown(value = '') {
  return DOMPurify.sanitize(marked.parse(value));
}

function pathFromLocation() {
  return location.pathname.replace(APP_BASE.replace(/\/$/, ''), '') || '/';
}

function href(path) {
  return `${APP_BASE.replace(/\/$/, '')}${path}`;
}

function navigate(path) {
  history.pushState({}, '', href(path));
  if (path === '/records/' || path === '/records') {
    window.dispatchEvent(new CustomEvent('rtw:navigate-records'));
    return;
  }
  window.dispatchEvent(new CustomEvent('rtw:leave-records'));
  render();
}

function routeLink(label, path, active) {
  return `<a href="${href(path)}" data-nav="${path}" class="${active ? 'active' : ''}">${label}</a>`;
}

function shell(content, active = 'home') {
  return `<div class="shell">
    <header class="topbar">
      <a class="brand" href="${href('/')}" data-nav="/">읽고 생각하고 기록하기</a>
      <nav class="nav">
${PRIMARY_TABS.map(tab => routeLink(tab.label, tab.path, active === tab.key)).join('')}
      </nav>
      <div class="userbar">
        <a class="userbar-link" href="${href('/about/')}" data-nav="/about/">안내</a>
        <a class="userbar-link" href="${href('/feedback/')}" data-nav="/feedback/">피드백</a>
        ${betaAccess?.role === 'admin' ? `<a class="userbar-link" href="${href('/beta/')}" data-nav="/beta/">베타 관리</a>` : ''}
        <span class="user-email">${esc(user?.email || '')}</span>
        <button class="logout-link" type="button" data-logout>로그아웃</button>
      </div>
    </header>
    <main class="page">${content}</main>
  </div>`;
}

function bindCommon() {
  document.querySelectorAll('[data-nav]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(anchor.dataset.nav);
    });
  });

  document.querySelector('[data-logout]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = '로그아웃 중…';
    try {
      await api.signOut();
    } catch (error) {
      button.disabled = false;
      button.textContent = '로그아웃';
      console.error('로그아웃 실패', error);
      alert('로그아웃하지 못했습니다. 다시 시도해주세요.');
    }
  });
}

async function refreshState() {
  const userId = user?.id;
  const epoch = authEpoch;
  if (!userId || dataReadyUserId !== userId) return false;
  const [resources, notes, topics, questions, bookmarks, noteTypes] = await Promise.all([
    api.listResources(), api.listNotes(), api.listTopics(), api.listQuestions(), api.listBookmarks(), api.listNoteTypes()
  ]);
  if (!isCurrentRequest(userId, epoch)) return false;
  state = { resources, notes, topics, questions, bookmarks, relations: [], noteTypes };
  return true;
}

function loginView() {
  root.innerHTML = `<div class="shell login-wrap">
    <section class="login">
      <div class="eyebrow">Personal knowledge archive</div>
      <h1>읽고 생각하고 기록하기</h1>
      <p class="muted">읽은 것을 저장하는 데서 끝내지 않고, 생각과 질문을 다시 연결하는 개인 작업공간.</p>
      <p class="login-privacy">현재 무료 베타는 초대된 Google 계정만 이용할 수 있습니다. 로그인 정보는 계정 식별과 접근 확인에 사용하며, 글·메모·질문·책갈피 등 개인 기록은 계정별로 분리해 보관합니다.</p>
      <details class="beta-policy">
        <summary>베타 이용·개인정보 안내</summary>
        <div class="beta-policy-body">
          <p><strong>베타 이용.</strong> 현재 기능은 시험 운영 중이며 변경·중단될 수 있습니다. 개인 기록의 별도 백업이 필요한 경우 이용자가 직접 보관해야 합니다.</p>
          <p><strong>저장 정보.</strong> Google 계정 이메일, 이용자가 직접 저장한 글·메모·질문·책갈피·글쓰기 기록, 기능 이용에 필요한 최소한의 사용량 정보를 저장합니다.</p>
          <p><strong>AI 처리.</strong> AI 읽기·생각 확장 기능을 실행할 때 해당 기능에 필요한 글과 일부 개인 기록이 AI 처리에 사용됩니다. 외부 GPT 직접쓰기 경로는 운영자 계정에만 연결되어 있습니다.</p>
          <p><strong>삭제.</strong> 계정 삭제 기능을 사용하면 해당 계정에 연결된 읽생기 개인 데이터와 인증 계정을 삭제합니다. 서비스 운영·보안상 필요한 최소 로그는 별도 시스템의 보존정책에 따를 수 있습니다.</p>
          <p>피드백은 서비스 개선 목적으로 확인하며, 민감한 개인정보는 피드백에 적지 않는 것을 권장합니다.</p>
        </div>
      </details>
      <form id="login-form" class="form">
        <div class="field"><label>이메일</label><input name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label>비밀번호</label><input name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn">로그인</button>
        <div class="status" id="login-status"></div>
      </form>
    </section>
  </div>`;

  document.querySelector('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#login-status');
    status.textContent = '로그인 중…';
    try {
      const form = new FormData(event.currentTarget);
      const epoch = authEpoch;
      const signedIn = await api.signIn(form.get('email'), form.get('password'));
      if (authEpoch !== epoch && user?.id !== signedIn?.id) return;
      if (setAuthUser(signedIn)) render();
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    }
  });
}

function empty(text) {
  return `<div class="empty">${esc(text)}</div>`;
}

function resourceItem(resource) {
  const saved = state.bookmarks.some((b) => b.resource_id === resource.id && b.bookmark_type === 'resource');
  return `<div class="item bookmark-resource-item">
    <div class="bookmark-resource-copy">
      <a href="${href(`/read/${resource.id}/`)}" data-nav="/read/${resource.id}/">${esc(resource.title)}</a>
      <div class="meta">${formatDate(resource.published_on)}${resource.author ? ` · ${esc(resource.author)}` : ''}${resource.source_name ? ` · ${esc(resource.source_name)}` : ''}</div>
    </div>
    <button class="bookmark-star ${saved ? 'saved' : ''}" data-resource-bookmark="${resource.id}" type="button" aria-label="자료 책갈피">${saved ? '★' : '☆'}</button>
  </div>`;
}

function bindResourceBookmarkButtons(){document.querySelectorAll('[data-resource-bookmark]').forEach(button=>button.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();const stillCurrent=currentViewGuard();const rid=button.dataset.resourceBookmark;const old=state.bookmarks.find(b=>b.resource_id===rid&&b.bookmark_type==='resource');if(old)await api.deleteBookmark(old.id);else await api.createBookmark({resource_id:rid,bookmark_type:'resource'},user.id);if(!stillCurrent()||!await refreshState()||!stillCurrent())return;render();}));}
function bookmarkView(){const rm=new Map(state.resources.map(r=>[r.id,r]));const items=state.bookmarks.map(b=>({b,r:rm.get(b.resource_id)})).filter(x=>x.r);root.innerHTML=shell(`<section class="hero bookmark-hero"><div class="eyebrow">책갈피</div><h1>다시 볼 곳</h1><p>다시 보고 싶은 글과 문장을 한곳에서 찾는다.</p></section><section class="card bookmark-section bookmark-unified"><div class="bookmark-index">${items.map(({b,r})=>b.bookmark_type==='resource'?`<div class="bookmark-index-row"><a class="bookmark-index-main" href="${href('/read/'+r.id+'/')}" data-nav="/read/${r.id}/"><span class="bookmark-kind">글</span><span class="bookmark-index-title">${esc(r.author||r.source_name||'')}${(r.author||r.source_name)?' · ':''}${esc(r.title)}</span></a><button class="bookmark-index-delete" data-delete-bookmark="${b.id}" type="button" aria-label="책갈피 삭제" title="삭제">×</button></div>`:`<div class="bookmark-index-row"><a class="bookmark-index-main bookmark-index-passage" href="${href('/read/'+b.resource_id+'/?bookmark='+encodeURIComponent(b.id))}" data-passage-bookmark="${b.id}"><span class="bookmark-kind">문장</span><span class="bookmark-index-copy"><strong class="bookmark-index-context">${esc(r.title)}</strong><span class="bookmark-index-text">“${esc(b.selected_text||'')}”</span></span></a><button class="bookmark-index-delete" data-delete-bookmark="${b.id}" type="button" aria-label="책갈피 삭제" title="삭제">×</button></div>`).join('')||empty('아직 책갈피가 없음')}</div></section>`,'bookmarks');bindCommon();document.querySelectorAll('[data-passage-bookmark]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const url=new URL(a.href,location.href);history.pushState({},'',url.pathname+url.search);render();}));document.querySelectorAll('[data-delete-bookmark]').forEach(x=>x.addEventListener('click',async()=>{const stillCurrent=currentViewGuard();await api.deleteBookmark(x.dataset.deleteBookmark);if(!stillCurrent()||!await refreshState()||!stillCurrent())return;bookmarkView();}));}

const DEFAULT_NOTE_TYPES = ['생각','질문','좋은 문장','반론','글감','업무 연결'];
let selectedNoteTypeFilter = '';

function noteTypeNames(selected = '', includeSaved = false) {
  return [...DEFAULT_NOTE_TYPES, ...state.noteTypes.map((item) => item.name), ...(includeSaved ? state.notes.map((note) => note.note_type) : []), selected]
    .filter(Boolean)
    .filter((name, index, all) => all.indexOf(name) === index);
}

function noteTypeOptions(selected = '') {
  return '<option value="">유형 없음</option>' + noteTypeNames(selected).map((name) => `<option value="${esc(name)}" ${name === selected ? 'selected' : ''}>${esc(name)}</option>`).join('');
}

function noteTypeBadge(name) {
  return name ? `<span class="note-type-badge" title="${esc(name)}">${esc(name)}</span>` : '';
}

function showNoteError(error, status, action = '저장') {
  console.error(`메모 ${action} 실패`, error);
  const message = `메모를 ${action}하지 못했습니다. 다시 시도해주세요.`;
  if (status) {
    status.textContent = message;
    status.classList.add('error');
  } else {
    alert(message);
  }
}

function noteParts(note) {
  const body = String(note?.body || '');
  if (!body.startsWith('> ')) return { quoted: false, quote: '', memo: body };
  const splitAt = body.indexOf('\n\n');
  const quoteBlock = splitAt >= 0 ? body.slice(0, splitAt) : body;
  return {
    quoted: true,
    quote: quoteBlock.replace(/^> ?/gm, ''),
    memo: splitAt >= 0 ? body.slice(splitAt + 2).trim() : ''
  };
}

function noteItem(note) {
  const parts = noteParts(note);
  const hrefTarget = note.resource_id ? href('/read/' + note.resource_id + '/?note=' + encodeURIComponent(note.id)) : href('/notes/?note=' + encodeURIComponent(note.id));
  const quotePreview = esc(parts.quote).replace(/\n/g, ' ');
  const memoPreview = esc(parts.memo).replace(/\n/g, ' ');
  return `<div class="item note-item ${parts.quoted ? 'note-item-quoted' : ''}" data-note-item="${note.id}" data-note-list-item data-note-type="${esc(note.note_type || '')}">
    <div class="note-item-head">
      <a class="note-item-link" data-note-display href="${hrefTarget}" data-note-target="${note.id}" data-note-resource="${note.resource_id || ''}">
        ${parts.quoted ? `<span class="note-quote-preview">${quotePreview.slice(0, 180)}${quotePreview.length > 180 ? '…' : ''}</span>${memoPreview ? `<span class="note-memo-preview">${memoPreview}</span>` : ''}` : `<span class="note-memo-preview">${memoPreview.slice(0, 180)}${memoPreview.length > 180 ? '…' : ''}</span>`}
      </a>
      <button class="note-menu-button" data-note-menu="${note.id}" type="button" aria-label="메모 메뉴">⋯</button>
    </div>
    <div class="meta">${noteTypeBadge(note.note_type)}${note.note_type ? ' · ' : ''}${new Date(note.updated_at).toLocaleDateString('ko-KR')}</div>
    <div class="note-actions" data-note-actions="${note.id}" hidden><button type="button" data-note-edit="${note.id}">수정</button><button type="button" data-note-delete="${note.id}">삭제</button></div>
    <form class="note-inline-edit" data-note-edit-form="${note.id}" hidden><textarea required maxlength="20000">${esc(note.body)}</textarea><div class="field"><label>유형 (선택)</label><select name="note_type">${noteTypeOptions(note.note_type || '')}</select></div><div class="inline-actions"><button class="btn small" type="submit">저장</button><button class="btn secondary small" type="button" data-note-edit-cancel="${note.id}">취소</button></div><div class="status" aria-live="polite"></div></form>
  </div>`;
}

function bindNoteActions() {
  document.querySelectorAll('[data-note-target]').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    const id = link.dataset.noteTarget;
    const resourceId = link.dataset.noteResource;
    if (resourceId) {
      history.pushState({}, '', href('/read/' + resourceId + '/?note=' + encodeURIComponent(id)));
      resourceDetailView(resourceId);
    } else {
      history.pushState({}, '', href('/notes/?note='+encodeURIComponent(id)));
      notesView();
    }
  }));
  document.querySelectorAll('[data-note-menu]').forEach((button) => button.addEventListener('click', () => {
    const actions = document.querySelector(`[data-note-actions="${button.dataset.noteMenu}"]`);
    if (actions) actions.hidden = !actions.hidden;
  }));
  document.querySelectorAll('[data-note-edit]').forEach((button) => button.addEventListener('click', () => {
    const item = button.closest('[data-note-item]');
    item?.querySelector('[data-note-display]')?.setAttribute('hidden', '');
    const form = item?.querySelector('[data-note-edit-form]');
    if (form) { form.hidden = false; form.querySelector('textarea')?.focus(); }
    const actions = item?.querySelector('[data-note-actions]');
    if (actions) actions.hidden = true;
  }));
  document.querySelectorAll('[data-note-edit-cancel]').forEach((button) => button.addEventListener('click', () => {
    const item = button.closest('[data-note-item]');
    item?.querySelector('[data-note-display]')?.removeAttribute('hidden');
    const form = item?.querySelector('[data-note-edit-form]');
    if (form) form.hidden = true;
  }));
  document.querySelectorAll('[data-note-edit-form]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const stillCurrent = currentViewGuard();
    const body = form.querySelector('textarea')?.value.trim() || '';
    if (!body) return;
    const status = form.querySelector('.status');
    if (status) status.textContent = '저장 중…';
    try {
      await api.updateNote(form.dataset.noteEditForm, body, new FormData(form).get('note_type'));
      if (!stillCurrent() || !await refreshState() || !stillCurrent()) return;
      selectedNoteTypeFilter = '';
      await rerenderCurrentView();
    } catch (error) {
      if (!stillCurrent()) return;
      showNoteError(error, status);
    }
  }));
  document.querySelectorAll('[data-note-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('이 메모를 삭제할까요?')) return;
    const stillCurrent = currentViewGuard();
    try {
      await api.deleteNote(button.dataset.noteDelete);
      if (!stillCurrent() || !await refreshState() || !stillCurrent()) return;
      await rerenderCurrentView();
    } catch (error) {
      if (!stillCurrent()) return;
      showNoteError(error, null, '삭제');
    }
  }));
}
async function rerenderCurrentView() {
  const path = pathFromLocation();
  if (path === '/' || path === '') return homeView();
  if (path === '/notes/' || path === '/notes') return notesView();
  if (path === '/search/' || path === '/search') return searchView();
  const resource = path.match(/^\/read\/([0-9a-f-]+)\/?$/);
  if (resource) return resourceDetailView(resource[1]);
  const topic = path.match(/^\/topics\/([0-9a-f-]+)\/?$/);
  if (topic) return topicDetailView(topic[1]);
  const question = path.match(/^\/questions\/([0-9a-f-]+)\/?$/);
  if (question) return questionDetailView(question[1]);
  const archive = path.match(/^\/archive\/(\d{4})\/?$/);
  if (archive) return archiveView(archive[1]);
  return render();
}


function topicLink(topic) {
  return `<a class="tag" href="${href(`/topics/${topic.id}/`)}" data-nav="/topics/${topic.id}/">${esc(topic.name)}</a>`;
}

function questionLink(question) {
  return `<a href="${href(`/questions/${question.id}/`)}" data-nav="/questions/${question.id}/">${esc(question.body)}</a>`;
}

function homeView() {
  const isNewWorkspace = !state.resources.length && !state.notes.length && !state.questions.length && !state.topics.length;
  const resources = state.resources.slice(0, 4);
  const notes = state.notes.slice(0, 4);
  const questions = state.questions.filter((question) => question.status === 'open').slice(0, 4);
  const years = [...new Set(state.resources.map((resource) => resource.published_on?.slice(0, 4)).filter(Boolean))].sort().reverse();
  if (!years.length) years.push('2026');

  root.innerHTML = shell(`
    <section class="hero">
      <div class="eyebrow">나의 생각 저장소</div>
      <h1>읽은 것이 생각이 되고,<br>생각이 다시 글이 되는 곳.</h1>
      ${isNewWorkspace ? '<p>첫 글을 저장하면 읽기·메모·질문이 서로 연결되기 시작한다.</p>' : ''}
    </section>
    <section class="grid">
      <div class="card"><h2>최근 읽기</h2><div class="stack">${resources.map(resourceItem).join('') || empty('아직 저장된 글이 없음')}</div></div>
      <div class="card"><h2>최근 메모</h2><div class="stack">${notes.map(noteItem).join('') || empty('아직 메모가 없음')}</div></div>
      <div class="card"><h2>이어가는 질문</h2><div class="stack">${questions.map((question) => `<div class="item">${questionLink(question)}${question.current_thought ? `<div class="meta">${esc(question.current_thought).slice(0, 120)}</div>` : ''}</div>`).join('') || empty('아직 질문이 없음')}</div></div>
      <div class="card"><h2>주제</h2><div class="tagrow">${state.topics.map(topicLink).join('') || '<span class="muted">주제가 쌓이면 여기에서 다시 만남.</span>'}</div></div>
      <div class="card"><h2>연도별 아카이브</h2><div class="stack">${years.map((year) => `<div class="item"><a href="${href(`/archive/${year}/`)}" data-nav="/archive/${year}/">${year}년 기록 보기</a></div>`).join('')}</div></div>
      <div class="card ai-usage-card"><div class="records-card-head"><div><h2>오늘의 AI 사용량</h2><p class="muted">한국 시간 자정에 초기화됩니다.</p></div></div><div class="ai-usage-summary" id="ai-usage-summary"><span class="muted">불러오는 중…</span></div></div>
    </section>
  `, 'home');
  bindCommon();
  bindNoteActions();
  bindResourceBookmarkButtons();
  loadAiUsageSummary();

}

function readListView() {
  root.innerHTML = shell(`
    <section class="hero"><div class="eyebrow">읽기</div><h1>읽은 글</h1><p>자료는 한 번 저장하고 날짜·주제·질문에서 다시 꺼내 본다.</p></section>
    <div class="grid">
      <section class="card"><h2>자료</h2>${state.resources.map(resourceItem).join('') || empty('아직 자료가 없음')}</section>
      <section class="card">
        <h2>새 자료</h2>
        <form class="form" id="resource-form">
          <div class="field"><label>제목</label><input name="title" required></div>
          <div class="field"><label>원제</label><input name="original_title"></div>
          <div class="field"><label>저자</label><input name="author"></div>
          <div class="field"><label>출처</label><input name="source_name"></div>
          <div class="field"><label>발표일</label><input type="date" name="published_on"></div>
          <div class="field"><label>원문 링크</label><input type="url" name="original_url"></div>
          <div class="field"><label>본문/번역문</label><textarea name="body_md"></textarea></div>
          <button class="btn">저장</button><div id="resource-status" class="status"></div>
        </form>
      </section>
    </div>
  `, 'read');
  bindCommon();
  bindNoteActions();
  bindResourceBookmarkButtons();

  document.querySelector('#resource-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const stillCurrent = currentViewGuard();
    const status = document.querySelector('#resource-status');
    status.textContent = '저장 중…';
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      await api.createResource(form, user.id);
      if (!stillCurrent() || !await refreshState() || !stillCurrent()) return;
      render();
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    }
  });
}

function linkCheckbox(sourceType, sourceId, targetType, targetId, label, checked) {
  return `<label class="check">
    <input type="checkbox" data-relation-toggle data-source-type="${sourceType}" data-source-id="${sourceId}" data-target-type="${targetType}" data-target-id="${targetId}" ${checked ? 'checked' : ''}>
    <span>${esc(label)}</span>
  </label>`;
}

function relationManager(sourceType, sourceId, relations) {
  const topicIds = new Set(relations.filter((relation) => relation.target_type === 'topic').map((relation) => relation.target_id));
  const questionIds = new Set(relations.filter((relation) => relation.target_type === 'question').map((relation) => relation.target_id));
  return `<div class="link-manager">
    <div><h3>주제</h3><div class="checklist">${state.topics.map((topic) => linkCheckbox(sourceType, sourceId, 'topic', topic.id, topic.name, topicIds.has(topic.id))).join('') || empty('먼저 주제를 만들어야 함')}</div></div>
    <div><h3>질문</h3><div class="checklist">${state.questions.map((question) => linkCheckbox(sourceType, sourceId, 'question', question.id, question.body, questionIds.has(question.id))).join('') || empty('먼저 질문을 만들어야 함')}</div></div>
  </div>`;
}

function bindRelationToggles(relationMap) {
  document.querySelectorAll('[data-relation-toggle]').forEach((input) => {
    input.addEventListener('change', async () => {
      const userId = user?.id;
      const epoch = authEpoch;
      const sourceType = input.dataset.sourceType;
      const sourceId = input.dataset.sourceId;
      const targetType = input.dataset.targetType;
      const targetId = input.dataset.targetId;
      const key = `${sourceType}:${sourceId}`;
      const relations = relationMap.get(key) ?? [];
      try {
        if (input.checked) {
          const created = await api.addRelation({ source_type: sourceType, source_id: sourceId, target_type: targetType, target_id: targetId }, userId);
          if (!isCurrentRequest(userId, epoch)) return;
          relations.push(created);
          relationMap.set(key, relations);
        } else {
          const existing = relations.find((relation) => relation.target_type === targetType && relation.target_id === targetId);
          if (existing) {
            await api.removeRelation(existing.id);
            if (!isCurrentRequest(userId, epoch)) return;
            relationMap.set(key, relations.filter((relation) => relation.id !== existing.id));
          }
        }
      } catch (error) {
        if (!isCurrentRequest(userId, epoch)) return;
        input.checked = !input.checked;
        alert(`연결 저장에 실패했습니다: ${error.message}`);
      }
    });
  });
}

async function resourceDetailView(id) {
  const userId = user?.id;
  const epoch = authEpoch;
  const route = pathFromLocation();
  if (!userId || dataReadyUserId !== userId) return;
  let resource, notes, relations, bookmarks;
  try {
    resource = state.resources.find((item) => item.id === id) || await api.getResource(id);
    if (!isCurrentRequest(userId, epoch, route)) return;
    if (!resource) return notFound();
    [notes, relations, bookmarks] = await Promise.all([api.listNotes(id), api.listRelations('resource', id), api.listBookmarks(id)]);
  } catch (error) {
    if (!isCurrentRequest(userId, epoch, route)) return;
    root.innerHTML = shell(`<section class="hero"><div class="eyebrow">읽기</div><h1>자료를 불러오지 못함</h1><p>${esc(error?.message || '잠시 후 다시 시도하세요.')}</p><button class="btn" id="retry-resource" type="button">다시 시도</button></section>`, 'read');
    bindCommon();
    document.querySelector('#retry-resource').onclick = () => render();
    return;
  }
  if (!isCurrentRequest(userId, epoch, route)) return;
  const relationMap = new Map([[`resource:${id}`, relations]]);
  const originalUrl = safeHttpUrl(resource.original_url);

  root.innerHTML = shell(`
    <section class="resource-head">
      <div class="eyebrow">${formatDate(resource.published_on)}</div>
      <h1>${esc(resource.title)}</h1>
      <div class="muted">${esc(resource.author || '')}${resource.source_name ? ` · ${esc(resource.source_name)}` : ''}</div>
      ${resource.original_title ? `<div class="meta">${esc(resource.original_title)}</div>` : ''}
      <div class="inline-actions">
        ${originalUrl ? `<a class="btn secondary small" target="_blank" rel="noopener noreferrer" href="${esc(originalUrl)}">원문 열기</a>` : ''}
        <button class="btn secondary small" id="resource-bookmark-toggle" type="button">${bookmarks.some(b=>b.bookmark_type==='resource') ? '★ 책갈피됨' : '☆ 책갈피'}</button> <button class="btn secondary small" id="resource-edit-toggle" type="button">원문·정보 수정</button>
      </div>
    </section>
    ${bookmarks.some(b=>b.bookmark_type==='passage') ? `<section class="resource-passage-bookmarks"><div class="resource-passage-bookmarks-title">이 글의 책갈피</div><div class="resource-passage-bookmarks-list">${bookmarks.filter(b=>b.bookmark_type==='passage').map(b=>`<a class="item passage-bookmark-link" href="${href('/read/'+id+'/?bookmark='+encodeURIComponent(b.id))}" data-local-passage-bookmark="${b.id}"><blockquote>${esc(b.selected_text||'')}</blockquote>${b.note?`<div class="meta">메모 · ${esc(b.note)}</div>`:''}</a>`).join('')}</div></section>` : ''}
    <button class="back-to-top" id="back-to-top" type="button" aria-label="맨 위로">↑</button>
    <section class="article-note card" id="resource-edit-card" hidden>
      <h2>원문·정보 수정</h2>
      <form class="form" id="resource-edit-form">
        <div class="field"><label>제목</label><input name="title" value="${esc(resource.title)}" required></div>
        <div class="field"><label>원제</label><input name="original_title" value="${esc(resource.original_title || '')}"></div>
        <div class="field"><label>저자</label><input name="author" value="${esc(resource.author || '')}"></div>
        <div class="field"><label>출처</label><input name="source_name" value="${esc(resource.source_name || '')}"></div>
        <div class="field"><label>발표일</label><input type="date" name="published_on" value="${esc(resource.published_on || '')}"></div>
        <div class="field"><label>원문 링크</label><input type="url" name="original_url" value="${esc(resource.original_url || '')}" placeholder="나중에 원문 URL을 추가할 수 있음"></div>
        <div class="field"><label>본문/번역문</label><textarea name="body_md">${esc(resource.body_md || '')}</textarea></div>
        <div class="inline-actions"><button class="btn" type="submit">수정 저장</button><button class="btn secondary" id="resource-edit-cancel" type="button">취소</button></div>
        <div class="status" id="resource-edit-status"></div>
      </form>
    </section>
    <article class="article" id="resource-article">${renderMarkdown(resource.body_md || '') || '<p class="muted">본문이 아직 없음.</p>'}</article><div id="selection-bookmark-pop" class="selection-bookmark-pop" hidden><div class="inline-actions"><button class="btn small" id="save-selection-bookmark" type="button">책갈피</button><button class="btn secondary small" id="save-selection-note" type="button">메모 저장</button></div></div>
    <section class="article-note card">
      <h2>나의 메모</h2>
      <form id="resource-note-form" class="form">
        <div class="field"><textarea name="body" placeholder="읽고 남은 생각, 질문, 반론, 글감…" required></textarea></div>
        <div class="field"><label>유형 (선택)</label><select name="note_type">${noteTypeOptions()}</select></div>
        <button class="btn">메모 저장</button><div class="status" id="note-status"></div>
      </form>
      <div class="stack" style="margin-top:20px">${notes.map(noteItem).join('') || empty('이 글에 남긴 메모가 아직 없음')}</div>
    </section>
    <section class="article-note card"><h2>연결</h2>${relationManager('resource', id, relations)}</section>
  `, 'read');
  bindCommon();
  bindNoteActions();
  bindRelationToggles(relationMap);
  const targetNoteId = new URLSearchParams(location.search).get('note');
  if (targetNoteId) {
    const target = document.querySelector(`[data-note-item="${CSS.escape(targetNoteId)}"]`);
    if (target) {
      const display = target.querySelector('[data-note-display]');
      const note = notes.find((item) => String(item.id) === targetNoteId);
      if (display && note) {
        const parts = noteParts(note);
        display.innerHTML = parts.quoted
          ? `<span class="note-quote-full">${esc(parts.quote).replace(/\n/g, '<br>')}</span>${parts.memo ? `<span class="note-memo-full">${esc(parts.memo).replace(/\n/g, '<br>')}</span>` : ''}`
          : `<span class="note-memo-full">${esc(parts.memo).replace(/\n/g, '<br>')}</span>`;
        display.classList.add('note-item-link-expanded');
      }
      requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }
  }
  const topButton=document.querySelector('#back-to-top');
  const syncTopButton=()=>{if(topButton)topButton.classList.toggle('visible',window.scrollY>500);};
  topButton?.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
  window.addEventListener('scroll',syncTopButton,{passive:true});syncTopButton();
  document.querySelectorAll('[data-local-passage-bookmark]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const url=new URL(a.href,location.href);history.pushState({},'',url.pathname+url.search);resourceDetailView(id);}));

  document.querySelector('#resource-bookmark-toggle')?.addEventListener('click',async()=>{const stillCurrent=currentViewGuard();const old=bookmarks.find(b=>b.bookmark_type==='resource');if(old)await api.deleteBookmark(old.id);else await api.createBookmark({resource_id:id,bookmark_type:'resource'},user.id);if(!stillCurrent()||!await refreshState()||!stillCurrent())return;resourceDetailView(id);});
  const article=document.querySelector('#resource-article'); const pop=document.querySelector('#selection-bookmark-pop'); let pending=null; let selectionTimer=null;
  const captureArticleSelection=()=>{const s=window.getSelection();const t=s?.toString().trim()||'';if(!t||t.length>2000||!s?.rangeCount||!article)return false;const range=s.getRangeAt(0);const common=range.commonAncestorContainer;const node=common.nodeType===Node.TEXT_NODE?common.parentNode:common;if(!article.contains(node))return false;const before=document.createRange();before.selectNodeContents(article);before.setEnd(range.startContainer,range.startOffset);const through=document.createRange();through.selectNodeContents(article);through.setEnd(range.endContainer,range.endOffset);pending=bookmarkSelectionData(article.textContent||'',t,before.toString(),through.toString(),s.toString());if(!pending)return false;pop.hidden=false;return true;};
  const scheduleSelectionCapture=(delay=250)=>{clearTimeout(selectionTimer);selectionTimer=setTimeout(()=>captureArticleSelection(),delay);};
  article?.addEventListener('mouseup',()=>scheduleSelectionCapture(30));
  article?.addEventListener('touchend',()=>{scheduleSelectionCapture(250);scheduleSelectionCapture(650);},{passive:true});
  document.addEventListener('selectionchange',()=>scheduleSelectionCapture(350));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleSelectionCapture(200);});
  document.querySelector('#save-selection-bookmark')?.addEventListener('click',async()=>{if(!pending)return;const stillCurrent=currentViewGuard();const note=prompt('메모를 남길까요? (선택 사항)')||'';await api.createBookmark({resource_id:id,bookmark_type:'passage',selected_text:pending.text,start_offset:pending.start,end_offset:pending.end,context_before:pending.contextBefore,context_after:pending.contextAfter,note},user.id);if(!stillCurrent())return;pop.hidden=true;window.getSelection()?.removeAllRanges();if(!await refreshState()||!stillCurrent())return;resourceDetailView(id);});
  const bookmarkId=new URLSearchParams(location.search).get('bookmark');
  if(bookmarkId){
    const target=bookmarks.find(b=>String(b.id)===bookmarkId&&b.bookmark_type==='passage');
    const nodes=[];
    if(article){const walker=document.createTreeWalker(article,NodeFilter.SHOW_TEXT);while(walker.nextNode())nodes.push(walker.currentNode);}
    const found=target&&locateBookmarkRange(nodes,target);
    if(!found){
      alert('본문이 수정되어 책갈피 위치를 찾지 못했습니다.');
    }else{
      try{
        const range=document.createRange();
        range.setStart(found.startNode,found.startOffset);
        range.setEnd(found.endNode,found.endOffset);
        const mark=document.createElement('mark');
        mark.className='bookmark-target';
        try{range.surroundContents(mark);mark.scrollIntoView({behavior:'smooth',block:'center'});}
        catch{found.startNode.parentElement?.scrollIntoView({behavior:'smooth',block:'center'});}
      }catch(error){
        console.error('Bookmark location failed',error);
        alert('본문이 수정되어 책갈피 위치를 찾지 못했습니다.');
      }
    }
  }

  document.querySelector('#save-selection-note')?.addEventListener('click', async () => {
    if (!pending) return;
    const stillCurrent = currentViewGuard();
    const memo = prompt('선택한 문장에 남길 메모를 입력하세요.');
    if (memo === null) return;
    const clean = memo.trim();
    if (!clean) return;
    try {
      await api.createNote({
        body: `> ${pending.text.replace(/\n/g, '\n> ')}\n\n${clean}`,
        note_type: DEFAULT_NOTE_TYPES[0],
        resource_id: id
      }, user.id);
      if (!stillCurrent()) return;
      pop.hidden = true;
      window.getSelection()?.removeAllRanges();
      if (!await refreshState() || !stillCurrent()) return;
      resourceDetailView(id);
    } catch (error) {
      if (!stillCurrent()) return;
      showNoteError(error);
    }
  });

  const editCard = document.querySelector('#resource-edit-card');
  document.querySelector('#resource-edit-toggle')?.addEventListener('click', () => {
    editCard.hidden = !editCard.hidden;
    if (!editCard.hidden) editCard.querySelector('input[name="title"]')?.focus();
  });
  document.querySelector('#resource-edit-cancel')?.addEventListener('click', () => { editCard.hidden = true; });
  document.querySelector('#resource-edit-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const stillCurrent = currentViewGuard();
    const status = document.querySelector('#resource-edit-status');
    status.textContent = '저장 중…';
    status.classList.remove('error');
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      await api.updateResource(id, form);
      if (!stillCurrent() || !await refreshState() || !stillCurrent()) return;
      resourceDetailView(id);
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    }
  });

  document.querySelector('#resource-note-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const stillCurrent = currentViewGuard();
    const status = document.querySelector('#note-status');
    status.textContent = '저장 중…';
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      await api.createNote({ ...form, resource_id: id }, user.id);
      if (!stillCurrent() || !await refreshState() || !stillCurrent()) return;
      resourceDetailView(id);
    } catch (error) {
      if (!stillCurrent()) return;
      showNoteError(error, status);
    }
  });
}

function applyNoteTypeFilter() {
  if (selectedNoteTypeFilter && !noteTypeNames('', true).includes(selectedNoteTypeFilter)) selectedNoteTypeFilter = '';
  document.querySelectorAll('[data-note-filter]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.noteFilter === selectedNoteTypeFilter));
  });
  let shown = 0;
  document.querySelectorAll('[data-note-list-item]').forEach((item) => {
    item.hidden = Boolean(selectedNoteTypeFilter && item.dataset.noteType !== selectedNoteTypeFilter);
    if (!item.hidden) shown += 1;
  });
  const emptyMessage = document.querySelector('#note-filter-empty');
  if (emptyMessage) {
    emptyMessage.hidden = shown > 0;
    emptyMessage.textContent = selectedNoteTypeFilter ? '이 유형의 메모가 아직 없음' : '메모가 아직 없음';
  }
}

async function notesView() {
  const userId = user?.id;
  const epoch = authEpoch;
  const route = pathFromLocation();
  if (!userId || dataReadyUserId !== userId) return;
  const independent = state.notes.filter((note) => !note.resource_id);
  const relationPairs = await Promise.all(independent.map(async (note) => [note.id, await api.listRelations('note', note.id)]));
  if (!isCurrentRequest(userId, epoch, route)) return;
  const relationMap = new Map(relationPairs.map(([noteId, relations]) => [`note:${noteId}`, relations]));

  root.innerHTML = shell(`
    <section class="hero memo-hero"><h1>메모</h1><p>기록하고, 연결한다.</p></section>
    <div class="notes-layout">
      <section class="card">
        <h2>새 메모</h2>
        <form id="independent-note-form" class="form">
          <div class="field"><textarea name="body" required placeholder="지금 떠오른 생각을 그대로…"></textarea></div>
          <div class="field"><label>유형 (선택)</label><select name="note_type">${noteTypeOptions()}</select></div>
          <button class="btn">저장</button><div id="ind-note-status" class="status"></div>
        </form>
        <div class="note-type-manager">
          <button class="note-type-manage-toggle" id="note-type-manage-toggle" type="button">유형 관리</button>
          <div id="note-type-manager-panel" hidden>
            <form id="note-type-form" class="note-type-form"><input name="name" maxlength="30" placeholder="새 유형"><button class="btn secondary small" type="submit">추가</button></form>
            <div class="note-type-list">${state.noteTypes.map((item)=>`<div class="note-type-row"><span title="${esc(item.name)}">${esc(item.name)}</span><button type="button" data-note-type-edit="${item.id}" aria-label="${esc(item.name)} 이름 수정">수정</button><button type="button" data-delete-note-type="${item.id}" aria-label="${esc(item.name)} 삭제">삭제</button><form class="note-type-rename-form" data-note-type-rename="${item.id}" hidden><input name="name" value="${esc(item.name)}" maxlength="30" required aria-label="새 유형 이름"><button type="submit">저장</button><button type="button" data-note-type-cancel="${item.id}">취소</button></form></div>`).join('') || '<span class="muted">추가한 유형 없음</span>'}</div>
          </div>
        </div>
      </section>
      <section class="card">
        <h2>메모</h2>
        <div class="note-type-filters" data-swipe-ignore role="group" aria-label="메모 유형 필터"><button type="button" data-note-filter="" aria-pressed="${!selectedNoteTypeFilter}">전체</button>${noteTypeNames('', true).map((name) => `<button type="button" data-note-filter="${esc(name)}" title="${esc(name)}" aria-pressed="${selectedNoteTypeFilter === name}">${esc(name)}</button>`).join('')}</div>
        ${state.notes.map((note) => {
          if (note.resource_id) return noteItem(note);
          const relations = relationMap.get(`note:${note.id}`) ?? [];
          return `<details class="note-record" data-note-record="${note.id}" data-note-list-item data-note-type="${esc(note.note_type || '')}"><summary>${noteTypeBadge(note.note_type)}<span>${esc(note.body).slice(0, 90)}${note.body.length > 90 ? '…' : ''}</span></summary>
            <div class="note-body">${esc(note.body).replace(/\n/g, '<br>')}</div>
            <div class="meta">${new Date(note.updated_at).toLocaleString('ko-KR')}</div>
            <div class="note-record-actions"><button type="button" data-note-record-edit="${note.id}">수정</button><button type="button" data-note-delete="${note.id}">삭제</button></div>
    <form class="note-inline-edit" data-note-edit-form="${note.id}" hidden><textarea required maxlength="20000">${esc(note.body)}</textarea><div class="field"><label>유형 (선택)</label><select name="note_type">${noteTypeOptions(note.note_type || '')}</select></div><div class="inline-actions"><button class="btn small" type="submit">저장</button><button class="btn secondary small" type="button" data-note-record-cancel="${note.id}">취소</button></div><div class="status" aria-live="polite"></div></form>
            <div class="note-links"><h3>이 메모 연결하기</h3>${relationManager('note', note.id, relations)}</div>
          </details>`;
        }).join('')}
        <div id="note-filter-empty" class="empty" hidden></div>
      </section>
    </div>
  `, 'notes');
  bindCommon();
  bindNoteActions();
  bindRelationToggles(relationMap);
  applyNoteTypeFilter();
  document.querySelectorAll('[data-note-filter]').forEach((button) => button.addEventListener('click', () => {
    selectedNoteTypeFilter = button.dataset.noteFilter;
    applyNoteTypeFilter();
  }));
  document.querySelector('#note-type-manage-toggle')?.addEventListener('click', () => {
    const panel = document.querySelector('#note-type-manager-panel');
    if (panel) panel.hidden = !panel.hidden;
  });
  document.querySelector('#note-type-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const stillCurrent = currentViewGuard();
    const name = String(new FormData(event.currentTarget).get('name') || '').trim();
    if (noteTypeNames('', true).includes(name)) { alert('이미 있는 유형입니다.'); return; }
    try {
      await api.createNoteType(name, user.id);
      if (!stillCurrent() || !await refreshState() || !stillCurrent()) return;
      notesView();
    } catch (error) {
      if (!stillCurrent()) return;
      console.error('메모 유형 추가 실패', error);
      alert(error.code === '23505' ? '이미 있는 유형입니다.' : '유형을 추가하지 못했습니다. 다시 시도해주세요.');
    }
  });
  document.querySelectorAll('[data-note-type-edit]').forEach((button) => button.addEventListener('click', () => {
    const form = document.querySelector(`[data-note-type-rename="${button.dataset.noteTypeEdit}"]`);
    if (form) { form.hidden = false; form.querySelector('input')?.focus(); }
  }));
  document.querySelectorAll('[data-note-type-cancel]').forEach((button) => button.addEventListener('click', () => {
    const form = document.querySelector(`[data-note-type-rename="${button.dataset.noteTypeCancel}"]`);
    if (form) form.hidden = true;
  }));
  document.querySelectorAll('[data-note-type-rename]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const stillCurrent = currentViewGuard();
    const type = state.noteTypes.find((item) => item.id === form.dataset.noteTypeRename);
    if (!type) return;
    const name = String(new FormData(form).get('name') || '').trim();
    if (name === type.name) { form.hidden = true; return; }
    if (noteTypeNames('', true).includes(name)) { alert('이미 있는 유형입니다.'); return; }
    try {
      await api.renameNoteType(type.id, name);
      if (!stillCurrent()) return;
      if (selectedNoteTypeFilter === type.name) selectedNoteTypeFilter = name;
      if (!await refreshState() || !stillCurrent()) return;
      await notesView();
    } catch (error) {
      if (!stillCurrent()) return;
      console.error('메모 유형 이름 수정 실패', error);
      alert(error.code === '23505' ? '이미 있는 유형입니다.' : '유형 이름을 수정하지 못했습니다. 다시 시도해주세요.');
    }
  }));
  document.querySelectorAll('[data-delete-note-type]').forEach((button) => button.addEventListener('click', async () => {
    const type = state.noteTypes.find((item) => item.id === button.dataset.deleteNoteType);
    if (!type) return;
    const used = state.notes.filter((note) => note.note_type === type.name).length;
    if (used) { alert(`이 유형을 사용 중인 메모가 ${used}개 있습니다. 먼저 해당 메모의 유형을 변경하거나 제거해주세요.`); return; }
    if (!confirm(`유형 '${type.name}'을 삭제할까요?`)) return;
    const stillCurrent = currentViewGuard();
    try {
      await api.deleteNoteType(type.id);
      if (!stillCurrent() || !await refreshState() || !stillCurrent()) return;
      notesView();
    } catch (error) {
      if (!stillCurrent()) return;
      console.error('메모 유형 삭제 실패', error);
      alert(error.code === '23503' ? '이 유형을 사용 중인 메모가 있습니다. 먼저 해당 메모의 유형을 변경하거나 제거해주세요.' : '유형을 삭제하지 못했습니다. 다시 시도해주세요.');
    }
  }));
  document.querySelectorAll('[data-note-record-edit]').forEach((button) => button.addEventListener('click', () => {
    const record = button.closest('[data-note-record]');
    const form = record?.querySelector('[data-note-edit-form]');
    if (form) { form.hidden = false; form.querySelector('textarea')?.focus(); }
  }));
  document.querySelectorAll('[data-note-record-cancel]').forEach((button) => button.addEventListener('click', () => {
    const form = button.closest('[data-note-edit-form]');
    if (form) form.hidden = true;
  }));

  document.querySelector('#independent-note-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const stillCurrent = currentViewGuard();
    const status = document.querySelector('#ind-note-status');
    status.textContent = '저장 중…';
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      await api.createNote(form, user.id);
      if (!stillCurrent() || !await refreshState() || !stillCurrent()) return;
      selectedNoteTypeFilter = '';
      notesView();
    } catch (error) {
      if (!stillCurrent()) return;
      showNoteError(error, status);
    }
  });
}

function topicsView() {
  root.innerHTML = shell(`
    <section class="hero"><div class="eyebrow">주제</div><h1>생각을 횡단하는 주제</h1><p>단순 태그가 아니라 여러 읽기와 메모를 다시 만나는 축.</p></section>
    <div class="grid">
      <section class="card"><h2>주제</h2><div class="tagrow">${state.topics.map(topicLink).join('') || empty('아직 주제가 없음')}</div></section>
      <section class="card"><h2>새 주제</h2><form id="topic-form" class="form"><div class="field"><input name="name" required placeholder="예: 기술노동"></div><button class="btn">추가</button><div id="topic-status" class="status"></div></form></section>
    </div>
  `, 'topics');
  bindCommon();
  bindNoteActions();
  document.querySelector('#topic-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const stillCurrent = currentViewGuard();
    const status = document.querySelector('#topic-status');
    try {
      await api.createTopic(new FormData(event.currentTarget).get('name'), user.id);
      if (!stillCurrent() || !await refreshState() || !stillCurrent()) return;
      topicsView();
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    }
  });
}

function questionsView() {
  root.innerHTML = shell(`
    <section class="hero"><div class="eyebrow">질문</div><h1>계속 붙들고 있는 질문</h1><p>주제보다 더 구체적인 사고의 추진력. 답을 빨리 닫지 않고 관련 자료와 메모를 붙인다.</p></section>
    <div class="grid">
      <section class="card"><h2>질문</h2>${state.questions.map((question) => `<div class="item">${questionLink(question)}${question.current_thought ? `<div class="meta">현재 생각: ${esc(question.current_thought)}</div>` : ''}</div>`).join('') || empty('아직 질문이 없음')}</section>
      <section class="card"><h2>새 질문</h2><form id="question-form" class="form"><div class="field"><textarea name="body" required placeholder="예: 노동자는 자신이 생산한 것에 대해 어디까지 발언할 권리가 있는가?"></textarea></div><button class="btn">추가</button><div id="question-status" class="status"></div></form></section>
    </div>
  `, 'questions');
  bindCommon();
  bindNoteActions();
  document.querySelector('#question-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const stillCurrent = currentViewGuard();
    const status = document.querySelector('#question-status');
    try {
      await api.createQuestion(new FormData(event.currentTarget).get('body'), user.id);
      if (!stillCurrent() || !await refreshState() || !stillCurrent()) return;
      questionsView();
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    }
  });
}

function relatedSourceItems(relations) {
  const resourceIds = new Set(relations.filter((relation) => relation.source_type === 'resource').map((relation) => relation.source_id));
  const noteIds = new Set(relations.filter((relation) => relation.source_type === 'note').map((relation) => relation.source_id));
  const resources = state.resources.filter((resource) => resourceIds.has(resource.id));
  const notes = state.notes.filter((note) => noteIds.has(note.id));
  return { resources, notes };
}

async function topicDetailView(id) {
  const userId = user?.id;
  const epoch = authEpoch;
  const route = pathFromLocation();
  if (!userId || dataReadyUserId !== userId) return;
  const topic = state.topics.find((item) => item.id === id);
  if (!topic) return notFound();
  const relations = await api.listRelationsByTarget('topic', id);
  if (!isCurrentRequest(userId, epoch, route)) return;
  const related = relatedSourceItems(relations);
  root.innerHTML = shell(`
    <section class="hero"><div class="eyebrow">주제</div><h1>${esc(topic.name)}</h1><p>${esc(topic.summary || '이 주제와 연결한 글과 메모가 시간에 따라 쌓인다.')}</p></section>
    <div class="grid">
      <section class="card"><h2>관련 읽기</h2>${related.resources.map(resourceItem).join('') || empty('연결된 글이 아직 없음')}</section>
      <section class="card"><h2>관련 메모</h2>${related.notes.map(noteItem).join('') || empty('연결된 메모가 아직 없음')}</section>
    </div>
  `, 'topics');
  bindCommon();
  bindNoteActions();
}

async function questionDetailView(id) {
  const userId = user?.id;
  const epoch = authEpoch;
  const route = pathFromLocation();
  if (!userId || dataReadyUserId !== userId) return;
  const question = state.questions.find((item) => item.id === id);
  if (!question) return notFound();
  const relations = await api.listRelationsByTarget('question', id);
  if (!isCurrentRequest(userId, epoch, route)) return;
  const related = relatedSourceItems(relations);
  root.innerHTML = shell(`
    <section class="hero"><div class="eyebrow">질문</div><h1>${esc(question.body)}</h1><p>${question.current_thought ? esc(question.current_thought) : '이 질문과 관련된 읽기와 메모를 계속 연결한다.'}</p></section>
    <div class="grid">
      <section class="card"><h2>관련 읽기</h2>${related.resources.map(resourceItem).join('') || empty('연결된 글이 아직 없음')}</section>
      <section class="card"><h2>관련 메모</h2>${related.notes.map(noteItem).join('') || empty('연결된 메모가 아직 없음')}</section>
    </div>
  `, 'questions');
  bindCommon();
  bindNoteActions();
}

async function archiveView(year = '2026') {
  const grouped = groupResourcesByMonth(state.resources);
  const months = grouped[year] || {};
  const monthHtml = Object.keys(months).sort().reverse().map((month) => {
    const dayHtml = Object.keys(months[month]).sort().reverse().map((day) => {
      const articles = months[month][day].map((resource) => {
        const notes = state.notes.filter((note) => note.resource_id === resource.id);
        return `<details class="archive-article">
          <summary>${esc(resource.title)}</summary>
          <div class="meta">${esc(resource.author || '')}${resource.source_name ? ` · ${esc(resource.source_name)}` : ''}</div>
          <article class="archive-body">${renderMarkdown(resource.body_md || '') || '<p class="muted">본문이 아직 없음.</p>'}</article>
          <section class="archive-note-box">
            <h3>나의 메모</h3>
            <form class="form archive-note-form" data-resource-id="${resource.id}">
              <div class="field"><textarea name="body" required placeholder="이 글을 읽고 남은 생각…"></textarea></div>
              <div class="field"><label>유형 (선택)</label><select name="note_type">${noteTypeOptions()}</select></div>
              <button class="btn small">메모 저장</button><div class="status"></div>
            </form>
            <div class="stack archive-saved-notes">${notes.map(noteItem).join('') || empty('이 글에 남긴 메모가 아직 없음')}</div>
          </section>
          <div class="inline-actions"><a href="${href(`/read/${resource.id}/`)}" data-nav="/read/${resource.id}/" class="btn secondary small">글 상세·연결 보기</a></div>
        </details>`;
      }).join('');
      return `<details><summary>${Number(month)}월 ${Number(day)}일</summary>${articles}</details>`;
    }).join('');
    return `<details ${month === '09' ? 'open' : ''}><summary>${Number(month)}월</summary>${dayHtml}</details>`;
  }).join('');

  root.innerHTML = shell(`
    <section class="hero"><div class="eyebrow">아카이브</div><h1>${year}년</h1><p>월 → 날짜 → 제목을 열어 본문을 읽고, 그 자리에서 메모를 남긴다.</p></section>
    <section class="archive">${monthHtml || empty(`${year}년 기록이 아직 없음`)}</section>
  `, 'archive');
  bindCommon();
  bindNoteActions();

  document.querySelectorAll('.archive-note-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const stillCurrent = currentViewGuard();
      const status = form.querySelector('.status');
      status.textContent = '저장 중…';
      try {
        const values = Object.fromEntries(new FormData(form));
        await api.createNote({ ...values, resource_id: form.dataset.resourceId }, user.id);
        if (!stillCurrent() || !await refreshState() || !stillCurrent()) return;
        archiveView(year);
      } catch (error) {
        if (!stillCurrent()) return;
        showNoteError(error, status);
      }
    });
  });
}

function searchView() {
  root.innerHTML = shell(`
    <section class="hero"><div class="eyebrow">검색</div><h1>기록 전체에서 찾기</h1><p>1단계에서는 제목·메모·주제·질문을 빠르게 찾는다.</p></section>
    <input id="search-input" class="searchbox" placeholder="검색어 입력" autofocus>
    <div id="search-results"></div>
  `, 'search');
  bindCommon();
  bindNoteActions();

  const input = document.querySelector('#search-input');
  const output = document.querySelector('#search-results');
  const draw = () => {
    const query = input.value;
    if (!query.trim()) {
      output.innerHTML = empty('검색어를 입력하면 관련 기록이 여기에 나타남');
      return;
    }
    const resources = state.resources.filter((item) => matchesQuery(item, query, ['title', 'original_title', 'author', 'source_name']));
    const notes = state.notes.filter((item) => matchesQuery(item, query, ['body', 'note_type']));
    const topics = state.topics.filter((item) => matchesQuery(item, query, ['name', 'summary']));
    const questions = state.questions.filter((item) => matchesQuery(item, query, ['body', 'current_thought']));
    output.innerHTML = `
      <section class="result-section card"><h2>읽기 ${resources.length}</h2>${resources.map(resourceItem).join('') || empty('없음')}</section>
      <section class="result-section card"><h2>메모 ${notes.length}</h2>${notes.map(noteItem).join('') || empty('없음')}</section>
      <section class="result-section card"><h2>주제 ${topics.length}</h2><div class="tagrow">${topics.map(topicLink).join('') || empty('없음')}</div></section>
      <section class="result-section card"><h2>질문 ${questions.length}</h2>${questions.map((question) => `<div class="item">${questionLink(question)}</div>`).join('') || empty('없음')}</section>`;
    bindCommon();
  bindNoteActions();
  };
  input.addEventListener('input', draw);
  draw();
}

function betaDeniedView() {
  root.innerHTML = `<div class="shell login-wrap"><section class="login beta-denied">
    <div class="eyebrow">Free beta</div>
    <h1>초대가 필요한 계정</h1>
    <p class="muted">현재 읽생기 무료 베타는 초대된 Google 계정만 이용할 수 있습니다.</p>
    <p class="beta-denied-email">${esc(user?.email || '')}</p>
    <div class="inline-actions"><button class="btn secondary" type="button" data-logout>다른 계정으로 로그인</button></div>
  </section></div>`;
  document.querySelector('[data-logout]')?.addEventListener('click', () => api.signOut().catch(() => {}));
}

function aboutView() {
  root.innerHTML = shell(`
    <section class="hero"><div class="eyebrow">Free beta</div><h1>이용·개인정보 안내</h1><p>읽생기는 읽기와 생각, 메모와 글쓰기를 연결하는 개인 작업공간의 무료 베타 버전입니다.</p></section>
    <section class="card policy-page">
      <h2>베타 이용</h2>
      <p>현재 기능과 화면은 시험 운영 중이며 사용자 피드백에 따라 변경되거나 일부 기능이 중단될 수 있습니다. 중요한 원문이나 기록은 필요에 따라 별도로 보관하는 것을 권장합니다.</p>
      <h2>저장하는 정보</h2>
      <p>Google 계정 이메일과 이용자가 직접 저장한 글·메모·질문·책갈피·글쓰기 기록, AI 기능의 일일 사용량 등 서비스 제공에 필요한 정보를 저장합니다. 개인 기록은 계정별로 분리하여 다른 일반 사용자가 조회할 수 없도록 구성되어 있습니다.</p>
      <h2>AI 기능</h2>
      <p>AI 읽기와 생각 확장을 실행하면 해당 기능에 필요한 글과 일부 개인 기록이 AI 처리에 사용됩니다. 무료 베타에서는 비용과 안정성을 위해 일일 사용 횟수를 제한합니다.</p>
      <h2>계정과 삭제</h2>
      <p>로그아웃은 현재 기기의 로그인 세션을 종료합니다. 계정 삭제 기능을 사용하면 해당 계정의 읽생기 개인 데이터와 인증 계정을 삭제합니다.</p>
      <h2>피드백</h2>
      <p>보낸 피드백은 베타 운영자가 서비스 개선을 위해 확인합니다. 비밀번호, 주민등록번호, 건강정보 등 민감한 개인정보는 피드백에 포함하지 마세요.</p>
    </section>`, 'about');
  bindCommon();
}

async function feedbackView() {
  root.innerHTML = shell(`
    <section class="hero"><div class="eyebrow">Beta feedback</div><h1>피드백 보내기</h1><p>불편한 점, 필요한 기능, 계속 쓰고 싶은 이유를 자유롭게 남겨주세요.</p></section>
    <section class="card feedback-card">
      <form class="form" id="feedback-form">
        <div class="field"><label>피드백</label><textarea name="body" maxlength="5000" required placeholder="어떤 상황에서 무엇이 불편했는지 알려주면 개선에 도움이 됩니다."></textarea></div>
        <button class="btn" type="submit">보내기</button>
        <div class="status" id="feedback-status" aria-live="polite"></div>
      </form>
    </section>`, 'feedback');
  bindCommon();
  document.querySelector('#feedback-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#feedback-status');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    status.textContent = '보내는 중…';
    button.disabled = true;
    try {
      const body = new FormData(event.currentTarget).get('body');
      await api.submitFeedback(body, pathFromLocation(), user.id);
      event.currentTarget.reset();
      status.textContent = '피드백을 보냈습니다.';
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    } finally {
      button.disabled = false;
    }
  });
}

async function betaAdminView() {
  if (betaAccess?.role !== 'admin') return notFound();
  root.innerHTML = shell('<section class="hero"><div class="eyebrow">Free beta</div><h1>베타 관리</h1><p>초대 계정과 최근 피드백을 관리합니다.</p></section><div class="empty">불러오는 중…</div>', 'beta');
  bindCommon();
  try {
    const [accessRows, feedbackRows] = await Promise.all([api.listBetaAccess(), api.listFeedback()]);
    root.innerHTML = shell(`
      <section class="hero"><div class="eyebrow">Free beta</div><h1>베타 관리</h1><p>초대 계정과 최근 피드백을 관리합니다.</p></section>
      <section class="grid beta-admin-grid">
        <div class="card">
          <h2>계정 초대</h2>
          <form class="form" id="beta-invite-form">
            <div class="field"><label>Google 이메일</label><input name="email" type="email" required placeholder="example@gmail.com"></div>
            <div class="field"><label>메모 (선택)</label><input name="note" maxlength="200"></div>
            <button class="btn" type="submit">초대 추가</button>
            <div class="status" id="beta-invite-status"></div>
          </form>
          <div class="beta-access-list">
            ${accessRows.map((row) => `<div class="beta-access-row">
              <div><strong>${esc(row.email)}</strong><div class="meta">${esc(row.role)}${row.note ? ' · ' + esc(row.note) : ''}</div></div>
              ${row.role === 'admin' ? '<span class="tag">관리자</span>' : `<button class="btn secondary small" type="button" data-beta-remove="${esc(row.email)}">초대 해제</button>`}
            </div>`).join('')}
          </div>
        </div>
        <div class="card">
          <h2>최근 피드백</h2>
          <div class="stack">${feedbackRows.map((row) => `<div class="item feedback-item"><div>${esc(row.body)}</div><div class="meta">${new Date(row.created_at).toLocaleString('ko-KR')}${row.page_path ? ' · ' + esc(row.page_path) : ''}</div></div>`).join('') || '<div class="empty">아직 피드백이 없음</div>'}</div>
        </div>
      </section>`, 'beta');
    bindCommon();
    document.querySelector('#beta-invite-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      const status = document.querySelector('#beta-invite-status');
      status.textContent = '추가 중…';
      try {
        await api.inviteBetaEmail(values.get('email'), values.get('note'));
        await betaAdminView();
      } catch (error) {
        status.textContent = error.message;
        status.classList.add('error');
      }
    });
    document.querySelectorAll('[data-beta-remove]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm(`${button.dataset.betaRemove} 계정의 베타 이용 권한을 해제할까요?`)) return;
      await api.removeBetaEmail(button.dataset.betaRemove);
      await betaAdminView();
    }));
  } catch (error) {
    root.innerHTML = shell(`<section class="hero"><h1>베타 관리 정보를 불러오지 못함</h1><p>${esc(error.message)}</p></section>`, 'beta');
    bindCommon();
  }
}

async function loadAiUsageSummary() {
  const target = document.querySelector('#ai-usage-summary');
  if (!target || !user) return;
  const guard = currentViewGuard();
  try {
    const usage = await api.getAiUsageToday();
    if (!guard() || !document.querySelector('#ai-usage-summary')) return;
    if (betaAccess?.role === 'admin') {
      target.innerHTML = '<div class="ai-usage-item"><span>AI 읽기</span><strong>무제한</strong></div><div class="ai-usage-item"><span>생각 확장</span><strong>무제한</strong></div>';
      return;
    }
    const item = (label, key) => {
      const used = usage[key] || 0;
      const limit = api.AI_DAILY_LIMITS[key];
      return `<div class="ai-usage-item"><span>${label}</span><strong>${Math.max(0, limit - used)} / ${limit}</strong><small>남음</small></div>`;
    };
    target.innerHTML = item('AI 읽기','read') + item('생각 확장','expand');
  } catch {
    target.innerHTML = '<span class="muted">AI 사용량을 불러오지 못함</span>';
  }
}

function notFound() {
  root.innerHTML = shell(`<section class="hero"><h1>페이지를 찾을 수 없음</h1><button class="btn" id="go-home">홈으로</button></section>`);
  bindCommon();
  bindNoteActions();
  document.querySelector('#go-home').onclick = () => navigate('/');
}

async function render() {
  if (!user) {
    const epoch = authEpoch;
    root.innerHTML = '<div class="shell"><div class="empty">불러오는 중…</div></div>';
    const current = await api.currentUser();
    if (authEpoch !== epoch) return;
    if (!current) {
      loginView();
      return;
    }
    setAuthUser(current);
  }

  if (accessReadyUserId !== user.id) {
    const userId = user.id;
    const epoch = authEpoch;
    root.innerHTML = '<div class="shell"><div class="empty">이용 권한 확인 중…</div></div>';
    try {
      const access = await api.getBetaAccess(user.email);
      if (!isCurrentRequest(userId, epoch)) return;
      betaAccess = access;
      accessReadyUserId = userId;
    } catch (error) {
      if (!isCurrentRequest(userId, epoch)) return;
      root.innerHTML = '<div class="shell"><div class="empty">이용 권한을 확인하지 못했습니다.<br><button class="btn small" id="retry-beta-access" type="button">다시 시도</button><div class="status error">' + esc(error.message) + '</div><div class="meta">build ' + esc(APP_BUILD) + '</div></div></div>';
      document.querySelector('#retry-beta-access')?.addEventListener('click', () => {
        accessReadyUserId = null;
        betaAccess = null;
        render();
      });
      return;
    }
  }

  if (!betaAccess?.active) {
    betaDeniedView();
    return;
  }

  if (dataReadyUserId !== user.id) {
    const userId = user.id;
    const epoch = authEpoch;
    root.innerHTML = '<div class="shell"><div class="empty">불러오는 중…</div></div>';
    if (!isCurrentRequest(userId, epoch)) return;
    dataReadyUserId = userId;
    if (!await refreshState()) return;
  }

  const path = pathFromLocation();
  if (path === '/' || path === '') return homeView();
  if (path === '/read/' || path === '/read') return readListView();
  if (path === '/bookmarks/' || path === '/bookmarks') return bookmarkView();

  const resourceMatch = path.match(/^\/read\/([0-9a-f-]+)\/?$/);
  if (resourceMatch) return resourceDetailView(resourceMatch[1]);

  if (path === '/notes/' || path === '/notes') return notesView();
  if (path === '/topics/' || path === '/topics') return topicsView();

  const topicMatch = path.match(/^\/topics\/([0-9a-f-]+)\/?$/);
  if (topicMatch) return topicDetailView(topicMatch[1]);

  if (path === '/questions/' || path === '/questions') return questionsView();

  const questionMatch = path.match(/^\/questions\/([0-9a-f-]+)\/?$/);
  if (questionMatch) return questionDetailView(questionMatch[1]);

  const archiveMatch = path.match(/^\/archive\/(\d{4})\/?$/);
  if (archiveMatch) return archiveView(archiveMatch[1]);

  if (path === '/search/' || path === '/search') return searchView();
  if (path === '/about/' || path === '/about') return aboutView();
  if (path === '/feedback/' || path === '/feedback') return feedbackView();
  if (path === '/beta/' || path === '/beta') return betaAdminView();
  return notFound();
}

function primaryTabIndex() {
  const path = pathFromLocation();
  return SWIPE_TABS.findIndex((tab) => {
    if (tab.key === 'home') return path === '/' || path === '';
    if (tab.key === 'archive') return /^\/archive\/\d{4}\/?$/.test(path);
    return path === tab.path || path === tab.path.replace(/\/$/, '');
  });
}

function bindPrimaryTabSwipe() {
  let gesture = null;
  const threshold = 64;
  const intentDistance = 10;
  const edgeDistance = 24;
  const horizontalRatio = 1.5;

  const reset = (page, animate = true) => {
    if (!page) return;
    page.classList.toggle('swipe-snap', animate);
    page.style.transform = '';
    page.style.opacity = '';
    if (animate) setTimeout(() => page.classList.remove('swipe-snap'), 220);
  };

  const ignoredTarget = (target) =>
    target.closest('button, input, label, select, textarea, [contenteditable="true"], [data-swipe-ignore], .resource-passage-bookmarks-list');

  root.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1 || primaryTabIndex() < 0 || ignoredTarget(event.target)) return;
    const page = event.target.closest('.page');
    if (!page) return;
    const touch = event.touches[0];
    if (touch.clientX < edgeDistance || touch.clientX > window.innerWidth - edgeDistance || window.getSelection?.()?.toString()) return;
    gesture = { page, x: touch.clientX, y: touch.clientY, dx: 0, dy: 0, mode: null };
  }, { passive: true });

  root.addEventListener('touchmove', (event) => {
    if (!gesture || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (!gesture.mode && Math.max(Math.abs(dx), Math.abs(dy)) >= intentDistance) {
      gesture.mode = Math.abs(dx) > Math.abs(dy) * horizontalRatio ? 'horizontal' : 'vertical';
    }
    if (gesture.mode !== 'horizontal') return;
    if (Math.abs(dy) >= Math.abs(dx) / horizontalRatio) {
      gesture.mode = 'vertical';
      gesture.page.classList.remove('swipe-dragging');
      reset(gesture.page, false);
      return;
    }
    gesture.dx = dx;
    gesture.dy = dy;
    const index = primaryTabIndex();
    const blocked = (dx > 0 && index === 0) || (dx < 0 && index === SWIPE_TABS.length - 1);
    if (!blocked) {
      if (!event.cancelable) {
        gesture.mode = 'vertical';
        gesture.page.classList.remove('swipe-dragging');
        reset(gesture.page, false);
        return;
      }
      event.preventDefault();
    }
    const visualDx = blocked ? dx * 0.18 : dx * 0.55;
    gesture.page.classList.add('swipe-dragging');
    gesture.page.style.transform = `translateX(${visualDx}px)`;
    gesture.page.style.opacity = String(Math.max(0.82, 1 - Math.abs(visualDx) / 900));
  }, { passive: false });

  const finish = () => {
    if (!gesture) return;
    const current = gesture;
    gesture = null;
    current.page.classList.remove('swipe-dragging');
    if (current.mode !== 'horizontal' || Math.abs(current.dx) < threshold || Math.abs(current.dx) <= Math.abs(current.dy) * horizontalRatio) {
      reset(current.page);
      return;
    }
    const index = primaryTabIndex();
    const nextIndex = current.dx < 0 ? index + 1 : index - 1;
    if (nextIndex < 0 || nextIndex >= SWIPE_TABS.length) {
      reset(current.page);
      return;
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      navigate(SWIPE_TABS[nextIndex].path);
      return;
    }
    current.page.classList.add('swipe-commit');
    current.page.style.transform = `translateX(${current.dx < 0 ? '-18%' : '18%'})`;
    current.page.style.opacity = '0';
    setTimeout(() => navigate(SWIPE_TABS[nextIndex].path), 180);
  };

  root.addEventListener('touchend', finish, { passive: true });
  root.addEventListener('touchcancel', () => {
    if (!gesture) return;
    const current = gesture;
    gesture = null;
    current.page.classList.remove('swipe-dragging');
    reset(current.page);
  }, { passive: true });
}
bindPrimaryTabSwipe();
window.addEventListener('popstate', render);
supabase.auth.onAuthStateChange((_event, session) => {
  const next = session?.user ?? null;
  if ((_event === 'SIGNED_OUT' || _event === 'INITIAL_SESSION') && !next && !user) {
    authEpoch += 1;
    clearUserState();
    loginView();
    return;
  }

  if (!setAuthUser(next)) return;

  // Supabase warns against starting another Supabase request directly inside
  // onAuthStateChange. Native OAuth emits SIGNED_IN without a page reload, so
  // render() must run outside this callback to avoid auth/query deadlocks.
  setTimeout(() => {
    if (next) render();
    else loginView();
  }, 0);
});

render();
