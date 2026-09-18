import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/+esm';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@16.2.1/lib/marked.esm.js';
import { supabase } from './supabase.js';
import * as api from './api.js';
import { APP_BASE } from './config.js';
import { formatDate, groupResourcesByMonth, matchesQuery, safeHttpUrl } from './model.js';
import { restoreRedirect } from './redirect.js';

restoreRedirect();

const root = document.querySelector('#app');
const PRIMARY_TABS = [
  { key: 'home', label: '홈', path: '/' },
  { key: 'read', label: '읽기', path: '/read/' },
  { key: 'bookmarks', label: '책갈피', path: '/bookmarks/' },
  { key: 'notes', label: '생각', path: '/notes/' },
  { key: 'topics', label: '주제', path: '/topics/' },
  { key: 'questions', label: '질문', path: '/questions/' },
  { key: 'archive', label: '아카이브', path: '/archive/2026/' },
  { key: 'search', label: '검색', path: '/search/' }
];
let user = null;
let state = { resources: [], notes: [], topics: [], questions: [], bookmarks: [] };

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
        <span>${esc(user?.email || '')}</span>
        <button class="btn secondary small" id="logout">로그아웃</button>
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
  document.querySelector('#logout')?.addEventListener('click', async () => {
    await api.signOut();
    user = null;
    render();
  });
}

async function refreshState() {
  const [resources, notes, topics, questions, bookmarks] = await Promise.all([
    api.listResources(), api.listNotes(), api.listTopics(), api.listQuestions(), api.listBookmarks()
  ]);
  state = { resources, notes, topics, questions, bookmarks };
}

function loginView() {
  root.innerHTML = `<div class="shell login-wrap">
    <section class="login">
      <div class="eyebrow">Personal knowledge archive</div>
      <h1>읽고 생각하고 기록하기</h1>
      <p class="muted">읽은 것을 저장하는 데서 끝내지 않고, 생각과 질문을 다시 연결하는 개인 작업공간.</p>
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
      user = await api.signIn(form.get('email'), form.get('password'));
      await refreshState();
      render();
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

function bindResourceBookmarkButtons(){document.querySelectorAll('[data-resource-bookmark]').forEach(button=>button.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();const rid=button.dataset.resourceBookmark;const old=state.bookmarks.find(b=>b.resource_id===rid&&b.bookmark_type==='resource');if(old)await api.deleteBookmark(old.id);else await api.createBookmark({resource_id:rid,bookmark_type:'resource'},user.id);await refreshState();render();}));}
function bookmarkView(){const rm=new Map(state.resources.map(r=>[r.id,r]));const items=state.bookmarks.map(b=>({b,r:rm.get(b.resource_id)})).filter(x=>x.r);root.innerHTML=shell(`<section class="hero bookmark-hero"><div class="eyebrow">책갈피</div><h1>다시 볼 곳</h1><p>다시 보고 싶은 글과 문장을 한곳에서 찾는다.</p></section><section class="card bookmark-section bookmark-unified"><div class="bookmark-index">${items.map(({b,r})=>b.bookmark_type==='resource'?`<div class="bookmark-index-row"><a class="bookmark-index-main" href="${href('/read/'+r.id+'/')}" data-nav="/read/${r.id}/"><span class="bookmark-kind">글</span><span class="bookmark-index-title">${esc(r.author||r.source_name||'')}${(r.author||r.source_name)?' · ':''}${esc(r.title)}</span></a><button class="bookmark-index-delete" data-delete-bookmark="${b.id}" type="button" aria-label="책갈피 삭제" title="삭제">×</button></div>`:`<div class="bookmark-index-row"><a class="bookmark-index-main bookmark-index-passage" href="${href('/read/'+b.resource_id+'/?bookmark='+encodeURIComponent(b.id))}" data-passage-bookmark="${b.id}"><span class="bookmark-kind">문장</span><span class="bookmark-index-copy"><strong class="bookmark-index-context">${esc(r.title)}</strong><span class="bookmark-index-text">“${esc(b.selected_text||'')}”</span></span></a><button class="bookmark-index-delete" data-delete-bookmark="${b.id}" type="button" aria-label="책갈피 삭제" title="삭제">×</button></div>`).join('')||empty('아직 책갈피가 없음')}</div></section>`,'bookmarks');bindCommon();document.querySelectorAll('[data-passage-bookmark]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const url=new URL(a.href,location.href);history.pushState({},'',url.pathname+url.search);render();}));document.querySelectorAll('[data-delete-bookmark]').forEach(x=>x.addEventListener('click',async()=>{await api.deleteBookmark(x.dataset.deleteBookmark);await refreshState();bookmarkView();}));}

function noteItem(note) {
  const text = esc(note.body).replace(/\n/g, ' ');
  return `<div class="item">
    <div>${text.slice(0, 150)}${text.length > 150 ? '…' : ''}</div>
    <div class="meta">${note.note_type ? `${esc(note.note_type)} · ` : ''}${new Date(note.updated_at).toLocaleDateString('ko-KR')}</div>
  </div>`;
}

function topicLink(topic) {
  return `<a class="tag" href="${href(`/topics/${topic.id}/`)}" data-nav="/topics/${topic.id}/">${esc(topic.name)}</a>`;
}

function questionLink(question) {
  return `<a href="${href(`/questions/${question.id}/`)}" data-nav="/questions/${question.id}/">${esc(question.body)}</a>`;
}

const RECOMMEND_HISTORY_KEY = 'rtw_web_recommend_history_v1';

function recommendationHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(RECOMMEND_HISTORY_KEY) || '[]');
    return Array.isArray(value) ? value.map(String).slice(0, 9) : [];
  } catch {
    return [];
  }
}

function recommendationRows(items) {
  return items.map((item) => `
    <a class="home-recommend-row" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
      <strong class="home-recommend-title">${esc(item.title)}</strong>
      <span class="home-recommend-meta">${esc(item.author || '저자 미상')}${item.published_on ? ` · ${formatDate(item.published_on)}` : ''}</span>
      <span class="home-recommend-reason">${esc(item.reason)}</span>
    </a>`).join('');
}

function homeView() {
  const resources = state.resources.slice(0, 4);
  const notes = state.notes.slice(0, 4);
  const questions = state.questions.filter((question) => question.status === 'open').slice(0, 4);
  const years = [...new Set(state.resources.map((resource) => resource.published_on?.slice(0, 4)).filter(Boolean))].sort().reverse();
  if (!years.length) years.push('2026');

  root.innerHTML = shell(`
    <section class="hero">
      <div class="eyebrow">나의 생각 저장소</div>
      <h1>읽은 것이 생각이 되고,<br>생각이 다시 글이 되는 곳.</h1>
      <p>최근 기록에서 다시 시작한다. 날짜는 기억을 복원하고, 주제와 질문은 서로 떨어진 생각을 연결한다.</p>
      <div class="home-recommend">
        <button type="button" class="btn secondary small" id="home-recommend-button">랜덤 글 3개</button>
        <span class="home-recommend-status" id="home-recommend-status"></span>
        <div class="home-recommend-list" id="home-recommend-list"></div>
      </div>
    </section>
    <section class="grid">
      <div class="card"><h2>최근 읽기</h2><div class="stack">${resources.map(resourceItem).join('') || empty('아직 저장된 글이 없음')}</div></div>
      <div class="card"><h2>최근 메모</h2><div class="stack">${notes.map(noteItem).join('') || empty('아직 메모가 없음')}</div></div>
      <div class="card"><h2>이어가는 질문</h2><div class="stack">${questions.map((question) => `<div class="item">${questionLink(question)}${question.current_thought ? `<div class="meta">${esc(question.current_thought).slice(0, 120)}</div>` : ''}</div>`).join('') || empty('아직 질문이 없음')}</div></div>
      <div class="card"><h2>주제</h2><div class="tagrow">${state.topics.map(topicLink).join('') || '<span class="muted">주제가 쌓이면 여기에서 다시 만남.</span>'}</div></div>
      <div class="card"><h2>연도별 아카이브</h2><div class="stack">${years.map((year) => `<div class="item"><a href="${href(`/archive/${year}/`)}" data-nav="/archive/${year}/">${year}년 기록 보기</a></div>`).join('')}</div></div>
    </section>
  `, 'home');
  bindCommon();

  const button = document.querySelector('#home-recommend-button');
  const status = document.querySelector('#home-recommend-status');
  const list = document.querySelector('#home-recommend-list');
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = '최근 기록을 연결하는 중…';
    try {
      const history = recommendationHistory();
      const items = await api.recommendResources(history);
      list.innerHTML = recommendationRows(items);
      const nextHistory = [...items.map((item) => String(item.url)), ...history]
        .filter((id, index, all) => all.indexOf(id) === index)
        .slice(0, 9);
      localStorage.setItem(RECOMMEND_HISTORY_KEY, JSON.stringify(nextHistory));
      status.textContent = '';
      list.querySelectorAll('[data-nav]').forEach((anchor) => {
        anchor.addEventListener('click', (event) => {
          event.preventDefault();
          navigate(anchor.dataset.nav);
        });
      });
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
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
  bindResourceBookmarkButtons();

  document.querySelector('#resource-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#resource-status');
    status.textContent = '저장 중…';
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      await api.createResource(form, user.id);
      await refreshState();
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
      const sourceType = input.dataset.sourceType;
      const sourceId = input.dataset.sourceId;
      const targetType = input.dataset.targetType;
      const targetId = input.dataset.targetId;
      const key = `${sourceType}:${sourceId}`;
      const relations = relationMap.get(key) ?? [];
      try {
        if (input.checked) {
          const created = await api.addRelation({ source_type: sourceType, source_id: sourceId, target_type: targetType, target_id: targetId }, user.id);
          relations.push(created);
          relationMap.set(key, relations);
        } else {
          const existing = relations.find((relation) => relation.target_type === targetType && relation.target_id === targetId);
          if (existing) {
            await api.removeRelation(existing.id);
            relationMap.set(key, relations.filter((relation) => relation.id !== existing.id));
          }
        }
      } catch (error) {
        input.checked = !input.checked;
        alert(`연결 저장에 실패했습니다: ${error.message}`);
      }
    });
  });
}

async function resourceDetailView(id) {
  const resource = state.resources.find((item) => item.id === id) || await api.getResource(id);
  const [notes, relations, bookmarks] = await Promise.all([api.listNotes(id), api.listRelations('resource', id), api.listBookmarks(id)]);
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
        <div class="field"><label>성격 (선택)</label><select name="note_type"><option value="">분류 안 함</option><option>생각</option><option>질문</option><option>좋은 문장</option><option>반론</option><option>글감</option><option>업무 연결</option></select></div>
        <button class="btn">메모 저장</button><div class="status" id="note-status"></div>
      </form>
      <div class="stack" style="margin-top:20px">${notes.map(noteItem).join('') || empty('이 글에 남긴 메모가 아직 없음')}</div>
    </section>
    <section class="article-note card"><h2>연결</h2>${relationManager('resource', id, relations)}</section>
  `, 'read');
  bindCommon();
  bindRelationToggles(relationMap);
  const topButton=document.querySelector('#back-to-top');
  const syncTopButton=()=>{if(topButton)topButton.classList.toggle('visible',window.scrollY>500);};
  topButton?.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
  window.addEventListener('scroll',syncTopButton,{passive:true});syncTopButton();
  document.querySelectorAll('[data-local-passage-bookmark]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const url=new URL(a.href,location.href);history.pushState({},'',url.pathname+url.search);resourceDetailView(id);}));

  document.querySelector('#resource-bookmark-toggle')?.addEventListener('click',async()=>{const old=bookmarks.find(b=>b.bookmark_type==='resource');if(old)await api.deleteBookmark(old.id);else await api.createBookmark({resource_id:id,bookmark_type:'resource'},user.id);await refreshState();resourceDetailView(id);});
  const article=document.querySelector('#resource-article'); const pop=document.querySelector('#selection-bookmark-pop'); let pending=null; let selectionTimer=null;
  const captureArticleSelection=()=>{const s=window.getSelection();const t=s?.toString().trim()||'';if(!t||t.length>2000||!s?.rangeCount||!article)return false;const range=s.getRangeAt(0);const common=range.commonAncestorContainer;const node=common.nodeType===Node.TEXT_NODE?common.parentNode:common;if(!article.contains(node))return false;const full=article.innerText;const start=full.indexOf(t);pending={text:t,start};pop.hidden=false;return true;};
  const scheduleSelectionCapture=(delay=250)=>{clearTimeout(selectionTimer);selectionTimer=setTimeout(()=>captureArticleSelection(),delay);};
  article?.addEventListener('mouseup',()=>scheduleSelectionCapture(30));
  article?.addEventListener('touchend',()=>{scheduleSelectionCapture(250);scheduleSelectionCapture(650);},{passive:true});
  document.addEventListener('selectionchange',()=>scheduleSelectionCapture(350));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleSelectionCapture(200);});
  document.querySelector('#save-selection-bookmark')?.addEventListener('click',async()=>{if(!pending)return;const full=article.innerText;const start=Math.max(0,pending.start);const note=prompt('메모를 남길까요? (선택 사항)')||'';await api.createBookmark({resource_id:id,bookmark_type:'passage',selected_text:pending.text,start_offset:start,end_offset:start+pending.text.length,context_before:full.slice(Math.max(0,start-160),start),context_after:full.slice(start+pending.text.length,start+pending.text.length+160),note},user.id);pop.hidden=true;window.getSelection()?.removeAllRanges();await refreshState();resourceDetailView(id);});
  const bookmarkId=new URLSearchParams(location.search).get('bookmark');
  if(bookmarkId){
    const target=state.bookmarks.find(b=>String(b.id)===bookmarkId&&b.bookmark_type==='passage'&&String(b.resource_id)===String(id));
    if(target){
      const articleText=article?.innerText||'';
      let pos=Number.isFinite(Number(target.start_offset))?Number(target.start_offset):-1;
      if(pos<0||articleText.slice(pos,pos+(target.selected_text||'').length)!==(target.selected_text||'')) pos=articleText.indexOf(target.selected_text||'');
      if(pos>=0&&article){
        const walker=document.createTreeWalker(article,NodeFilter.SHOW_TEXT); let seen=0,startNode=null,startOffset=0,endNode=null,endOffset=0;
        while(walker.nextNode()){const n=walker.currentNode,len=n.nodeValue.length;if(!startNode&&seen+len>=pos){startNode=n;startOffset=Math.max(0,pos-seen);}if(startNode&&seen+len>=pos+(target.selected_text||'').length){endNode=n;endOffset=Math.max(0,pos+(target.selected_text||'').length-seen);break;}seen+=len;}
        if(startNode&&endNode){const r=document.createRange();r.setStart(startNode,Math.min(startOffset,startNode.nodeValue.length));r.setEnd(endNode,Math.min(endOffset,endNode.nodeValue.length));const mark=document.createElement('mark');mark.className='bookmark-target';try{r.surroundContents(mark);mark.scrollIntoView({behavior:'smooth',block:'center'});}catch{startNode.parentElement?.scrollIntoView({behavior:'smooth',block:'center'});}}
      }
    }
  }

  document.querySelector('#save-selection-note')?.addEventListener('click',async()=>{if(!pending)return;const memo=prompt('선택한 문장에 남길 메모를 입력하세요.');if(memo===null)return;const clean=memo.trim();if(!clean)return;await api.createNote({body:`> ${pending.text.replace(/\n/g,'\n> ')}\n\n${clean}`,note_type:'생각',resource_id:id},user.id);pop.hidden=true;window.getSelection()?.removeAllRanges();await refreshState();resourceDetailView(id);});

  const editCard = document.querySelector('#resource-edit-card');
  document.querySelector('#resource-edit-toggle')?.addEventListener('click', () => {
    editCard.hidden = !editCard.hidden;
    if (!editCard.hidden) editCard.querySelector('input[name="title"]')?.focus();
  });
  document.querySelector('#resource-edit-cancel')?.addEventListener('click', () => { editCard.hidden = true; });
  document.querySelector('#resource-edit-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#resource-edit-status');
    status.textContent = '저장 중…';
    status.classList.remove('error');
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      await api.updateResource(id, form);
      await refreshState();
      resourceDetailView(id);
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    }
  });

  document.querySelector('#resource-note-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#note-status');
    status.textContent = '저장 중…';
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      await api.createNote({ ...form, resource_id: id }, user.id);
      await refreshState();
      resourceDetailView(id);
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    }
  });
}

async function notesView() {
  const independent = state.notes.filter((note) => !note.resource_id);
  const relationPairs = await Promise.all(independent.map(async (note) => [note.id, await api.listRelations('note', note.id)]));
  const relationMap = new Map(relationPairs.map(([noteId, relations]) => [`note:${noteId}`, relations]));

  root.innerHTML = shell(`
    <section class="hero"><div class="eyebrow">생각</div><h1>독립 메모</h1><p>어떤 글에 딸리지 않은 생각도 바로 기록하고, 이후 주제와 질문에 연결한다.</p></section>
    <div class="notes-layout">
      <section class="card">
        <h2>새 메모</h2>
        <form id="independent-note-form" class="form">
          <div class="field"><textarea name="body" required placeholder="지금 떠오른 생각을 그대로…"></textarea></div>
          <div class="field"><label>성격 (선택)</label><select name="note_type"><option value="">분류 안 함</option><option>생각</option><option>질문</option><option>좋은 문장</option><option>반론</option><option>글감</option><option>업무 연결</option></select></div>
          <button class="btn">저장</button><div id="ind-note-status" class="status"></div>
        </form>
      </section>
      <section class="card">
        <h2>메모</h2>
        ${independent.map((note) => {
          const relations = relationMap.get(`note:${note.id}`) ?? [];
          return `<details class="note-record"><summary>${esc(note.body).slice(0, 90)}${note.body.length > 90 ? '…' : ''}</summary>
            <div class="note-body">${esc(note.body).replace(/\n/g, '<br>')}</div>
            <div class="meta">${note.note_type ? `${esc(note.note_type)} · ` : ''}${new Date(note.updated_at).toLocaleString('ko-KR')}</div>
            <div class="note-links"><h3>이 메모 연결하기</h3>${relationManager('note', note.id, relations)}</div>
          </details>`;
        }).join('') || empty('독립 메모가 아직 없음')}
      </section>
    </div>
  `, 'notes');
  bindCommon();
  bindRelationToggles(relationMap);

  document.querySelector('#independent-note-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#ind-note-status');
    status.textContent = '저장 중…';
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      await api.createNote(form, user.id);
      await refreshState();
      notesView();
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
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
  document.querySelector('#topic-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#topic-status');
    try {
      await api.createTopic(new FormData(event.currentTarget).get('name'), user.id);
      await refreshState();
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
  document.querySelector('#question-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#question-status');
    try {
      await api.createQuestion(new FormData(event.currentTarget).get('body'), user.id);
      await refreshState();
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
  const topic = state.topics.find((item) => item.id === id);
  if (!topic) return notFound();
  const relations = await api.listRelationsByTarget('topic', id);
  const related = relatedSourceItems(relations);
  root.innerHTML = shell(`
    <section class="hero"><div class="eyebrow">주제</div><h1>${esc(topic.name)}</h1><p>${esc(topic.summary || '이 주제와 연결한 글과 메모가 시간에 따라 쌓인다.')}</p></section>
    <div class="grid">
      <section class="card"><h2>관련 읽기</h2>${related.resources.map(resourceItem).join('') || empty('연결된 글이 아직 없음')}</section>
      <section class="card"><h2>관련 메모</h2>${related.notes.map(noteItem).join('') || empty('연결된 메모가 아직 없음')}</section>
    </div>
  `, 'topics');
  bindCommon();
}

async function questionDetailView(id) {
  const question = state.questions.find((item) => item.id === id);
  if (!question) return notFound();
  const relations = await api.listRelationsByTarget('question', id);
  const related = relatedSourceItems(relations);
  root.innerHTML = shell(`
    <section class="hero"><div class="eyebrow">질문</div><h1>${esc(question.body)}</h1><p>${question.current_thought ? esc(question.current_thought) : '이 질문과 관련된 읽기와 메모를 계속 연결한다.'}</p></section>
    <div class="grid">
      <section class="card"><h2>관련 읽기</h2>${related.resources.map(resourceItem).join('') || empty('연결된 글이 아직 없음')}</section>
      <section class="card"><h2>관련 메모</h2>${related.notes.map(noteItem).join('') || empty('연결된 메모가 아직 없음')}</section>
    </div>
  `, 'questions');
  bindCommon();
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
              <div class="field"><label>성격 (선택)</label><select name="note_type"><option value="">분류 안 함</option><option>생각</option><option>질문</option><option>좋은 문장</option><option>반론</option><option>글감</option><option>업무 연결</option></select></div>
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

  document.querySelectorAll('.archive-note-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = form.querySelector('.status');
      status.textContent = '저장 중…';
      try {
        const values = Object.fromEntries(new FormData(form));
        await api.createNote({ ...values, resource_id: form.dataset.resourceId }, user.id);
        await refreshState();
        archiveView(year);
      } catch (error) {
        status.textContent = error.message;
        status.classList.add('error');
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
  };
  input.addEventListener('input', draw);
  draw();
}

function notFound() {
  root.innerHTML = shell(`<section class="hero"><h1>페이지를 찾을 수 없음</h1><button class="btn" id="go-home">홈으로</button></section>`);
  bindCommon();
  document.querySelector('#go-home').onclick = () => navigate('/');
}

async function render() {
  if (!user) {
    root.innerHTML = '<div class="shell"><div class="empty">불러오는 중…</div></div>';
    user = await api.currentUser();
    if (!user) {
      loginView();
      return;
    }
    await refreshState();
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
  return notFound();
}

function primaryTabIndex() {
  const path = pathFromLocation();
  return PRIMARY_TABS.findIndex((tab) => {
    if (tab.key === 'home') return path === '/' || path === '';
    if (tab.key === 'archive') return /^\/archive\/\d{4}\/?$/.test(path);
    return path === tab.path || path === tab.path.replace(/\/$/, '');
  });
}

function bindPrimaryTabSwipe() {
  let gesture = null;
  const threshold = 64;
  const intentDistance = 10;

  const reset = (page, animate = true) => {
    if (!page) return;
    page.classList.toggle('swipe-snap', animate);
    page.style.transform = '';
    page.style.opacity = '';
    if (animate) setTimeout(() => page.classList.remove('swipe-snap'), 220);
  };

  const ignoredTarget = (target) =>
    target.closest('input, textarea, select, button, [contenteditable="true"], [data-swipe-ignore], .resource-passage-bookmarks-list');

  root.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1 || primaryTabIndex() < 0 || ignoredTarget(event.target)) return;
    const page = event.target.closest('.page');
    if (!page) return;
    const touch = event.touches[0];
    gesture = { page, x: touch.clientX, y: touch.clientY, dx: 0, mode: null };
  }, { passive: true });

  root.addEventListener('touchmove', (event) => {
    if (!gesture || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (!gesture.mode && Math.max(Math.abs(dx), Math.abs(dy)) >= intentDistance) {
      gesture.mode = Math.abs(dx) > Math.abs(dy) * 1.25 ? 'horizontal' : 'vertical';
    }
    if (gesture.mode !== 'horizontal') return;
    gesture.dx = dx;
    event.preventDefault();
    const index = primaryTabIndex();
    const blocked = (dx > 0 && index === 0) || (dx < 0 && index === PRIMARY_TABS.length - 1);
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
    if (current.mode !== 'horizontal' || Math.abs(current.dx) < threshold) {
      reset(current.page);
      return;
    }
    const index = primaryTabIndex();
    const nextIndex = current.dx < 0 ? index + 1 : index - 1;
    if (nextIndex < 0 || nextIndex >= PRIMARY_TABS.length) {
      reset(current.page);
      return;
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      navigate(PRIMARY_TABS[nextIndex].path);
      return;
    }
    current.page.classList.add('swipe-commit');
    current.page.style.transform = `translateX(${current.dx < 0 ? '-18%' : '18%'})`;
    current.page.style.opacity = '0';
    setTimeout(() => navigate(PRIMARY_TABS[nextIndex].path), 180);
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
  if (Boolean(next) !== Boolean(user)) {
    user = next;
    if (user) refreshState().then(render);
    else render();
  }
});

render();
