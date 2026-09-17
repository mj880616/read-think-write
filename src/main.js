import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/+esm';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@16.2.1/lib/marked.esm.js';
import { supabase } from './supabase.js';
import * as api from './api.js';
import { APP_BASE } from './config.js';
import { formatDate, groupResourcesByMonth, matchesQuery } from './model.js';
import { restoreRedirect } from './redirect.js';

restoreRedirect();
const root = document.querySelector('#app');
let user = null;
let state = { resources: [], notes: [], topics: [], questions: [] };

function esc(value=''){ return String(value).replace(/[&<>'"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c])); }
function pathFromLocation(){ return location.pathname.replace(APP_BASE.replace(/\/$/,''),'') || '/'; }
function href(path){ return `${APP_BASE.replace(/\/$/,'')}${path}`; }
function navigate(path){ history.pushState({},'',href(path)); render(); }
function routeLink(label,path,active){ return `<a href="${href(path)}" data-nav="${path}" class="${active?'active':''}">${label}</a>`; }
function shell(content, active='home'){
  return `<div class="shell"><header class="topbar"><a class="brand" href="${href('/')}" data-nav="/">읽고 생각하고 쓰기</a><nav class="nav">${routeLink('홈','/',active==='home')}${routeLink('읽기','/read/',active==='read')}${routeLink('생각','/notes/',active==='notes')}${routeLink('주제','/topics/',active==='topics')}${routeLink('질문','/questions/',active==='questions')}${routeLink('아카이브','/archive/2026/',active==='archive')}${routeLink('검색','/search/',active==='search')}</nav><div class="userbar"><span>${esc(user?.email||'')}</span><button class="btn secondary small" id="logout">로그아웃</button></div></header><main class="page">${content}</main></div>`;
}
function bindCommon(){
  document.querySelectorAll('[data-nav]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();navigate(a.dataset.nav);}));
  document.querySelector('#logout')?.addEventListener('click',async()=>{await api.signOut();user=null;render();});
}
async function refreshState(){
  const [resources,notes,topics,questions]=await Promise.all([api.listResources(),api.listNotes(),api.listTopics(),api.listQuestions()]);
  state={resources,notes,topics,questions};
}
function loginView(){
  root.innerHTML=`<div class="shell login-wrap"><section class="login"><div class="eyebrow">Personal knowledge archive</div><h1>읽고 생각하고 쓰기</h1><p class="muted">읽은 것을 저장하는 데서 끝내지 않고, 생각과 질문을 다시 연결하는 개인 작업공간.</p><form id="login-form" class="form"><div class="field"><label>이메일</label><input name="email" type="email" autocomplete="email" required></div><div class="field"><label>비밀번호</label><input name="password" type="password" autocomplete="current-password" required></div><button class="btn">로그인</button><div class="status" id="login-status"></div></form></section></div>`;
  document.querySelector('#login-form').addEventListener('submit',async e=>{e.preventDefault();const s=document.querySelector('#login-status');s.textContent='로그인 중…';try{const fd=new FormData(e.currentTarget);user=await api.signIn(fd.get('email'),fd.get('password'));await refreshState();render();}catch(err){s.textContent=err.message;s.classList.add('error');}});
}
function homeView(){
  const resources=state.resources.slice(0,4), notes=state.notes.slice(0,4), questions=state.questions.filter(q=>q.status!=='closed').slice(0,4);
  root.innerHTML=shell(`<section class="hero"><div class="eyebrow">나의 생각 저장소</div><h1>읽은 것이 생각이 되고,<br>생각이 다시 글이 되는 곳.</h1><p>최근 기록에서 다시 시작한다. 날짜는 기억을 복원하고, 주제와 질문은 서로 떨어진 생각을 연결한다.</p></section><section class="grid"><div class="card"><h2>최근 읽기</h2><div class="stack">${resources.map(resourceItem).join('')||empty('아직 저장된 글이 없음')}</div></div><div class="card"><h2>최근 메모</h2><div class="stack">${notes.map(noteItem).join('')||empty('아직 메모가 없음')}</div></div><div class="card"><h2>이어가는 질문</h2><div class="stack">${questions.map(q=>`<div class="item"><strong>${esc(q.body)}</strong>${q.current_thought?`<div class="meta">${esc(q.current_thought).slice(0,120)}</div>`:''}</div>`).join('')||empty('아직 질문이 없음')}</div></div><div class="card"><h2>주제</h2><div class="tagrow">${state.topics.map(t=>`<span class="tag">${esc(t.name)}</span>`).join('')||'<span class="muted">주제가 쌓이면 여기에서 다시 만남.</span>'}</div></div></section>`,'home');bindCommon();
}
function resourceItem(r){return `<div class="item"><a href="${href(`/read/${r.id}/`)}" data-nav="/read/${r.id}/">${esc(r.title)}</a><div class="meta">${formatDate(r.published_on)} · ${esc(r.author||'')} ${r.source_name?'· '+esc(r.source_name):''}</div></div>`;}
function noteItem(n){const text=esc(n.body).replace(/\n/g,' ');return `<div class="item"><div>${text.slice(0,150)}${text.length>150?'…':''}</div><div class="meta">${n.note_type?esc(n.note_type)+' · ':''}${new Date(n.updated_at).toLocaleDateString('ko-KR')}</div></div>`;}
function empty(text){return `<div class="empty">${esc(text)}</div>`;}

function readListView(){
  root.innerHTML=shell(`<section class="hero"><div class="eyebrow">읽기</div><h1>읽은 글</h1><p>자료는 한 번 저장하고 날짜·주제·질문에서 다시 꺼내 본다.</p></section><div class="grid"><section class="card"><h2>자료</h2>${state.resources.map(resourceItem).join('')||empty('아직 자료가 없음')}</section><section class="card"><h2>새 자료</h2><form class="form" id="resource-form"><div class="field"><label>제목</label><input name="title" required></div><div class="field"><label>원제</label><input name="original_title"></div><div class="field"><label>저자</label><input name="author"></div><div class="field"><label>출처</label><input name="source_name"></div><div class="field"><label>발표일</label><input type="date" name="published_on"></div><div class="field"><label>원문 링크</label><input type="url" name="original_url"></div><div class="field"><label>본문/번역문</label><textarea name="body_md"></textarea></div><button class="btn">저장</button><div id="resource-status" class="status"></div></form></section></div>`,'read');bindCommon();
  document.querySelector('#resource-form').addEventListener('submit',async e=>{e.preventDefault();const s=document.querySelector('#resource-status');s.textContent='저장 중…';try{const fd=Object.fromEntries(new FormData(e.currentTarget));await api.createResource(fd,user.id);await refreshState();s.textContent='저장 완료';render();}catch(err){s.textContent=err.message;s.classList.add('error');}});
}

async function resourceDetailView(id){
  const r=state.resources.find(x=>x.id===id) || await api.getResource(id);
  const notes=await api.listNotes(id), relations=await api.listRelations('resource',id);
  const linkedTopicIds=new Set(relations.filter(x=>x.target_type==='topic').map(x=>x.target_id));
  const linkedQuestionIds=new Set(relations.filter(x=>x.target_type==='question').map(x=>x.target_id));
  const html=DOMPurify.sanitize(marked.parse(r.body_md||''));
  root.innerHTML=shell(`<section class="resource-head"><div class="eyebrow">${formatDate(r.published_on)}</div><h1>${esc(r.title)}</h1><div class="muted">${esc(r.author||'')}${r.source_name?' · '+esc(r.source_name):''}</div>${r.original_title?`<div class="meta">${esc(r.original_title)}</div>`:''}${r.original_url?`<div class="inline-actions"><a class="btn secondary small" target="_blank" rel="noopener" href="${esc(r.original_url)}">원문 열기</a></div>`:''}</section><article class="article">${html||'<p class="muted">본문이 아직 없음.</p>'}</article><section class="article-note card"><h2>나의 메모</h2><form id="resource-note-form" class="form"><div class="field"><textarea name="body" placeholder="읽고 남은 생각, 질문, 반론, 글감…" required></textarea></div><div class="field"><label>성격 (선택)</label><select name="note_type"><option value="">분류 안 함</option><option>생각</option><option>질문</option><option>좋은 문장</option><option>반론</option><option>글감</option><option>업무 연결</option></select></div><button class="btn">메모 저장</button><div class="status" id="note-status"></div></form><div class="stack" style="margin-top:20px">${notes.map(noteItem).join('')||empty('이 글에 남긴 메모가 아직 없음')}</div></section><section class="article-note card"><h2>연결</h2><div class="link-manager"><div><h3>주제</h3><div class="checklist">${state.topics.map(t=>linkCheckbox('topic',t.id,t.name,linkedTopicIds.has(t.id))).join('')||empty('먼저 주제를 만들어야 함')}</div></div><div><h3>질문</h3><div class="checklist">${state.questions.map(q=>linkCheckbox('question',q.id,q.body,linkedQuestionIds.has(q.id))).join('')||empty('먼저 질문을 만들어야 함')}</div></div></div></section>`,'read');bindCommon();
  document.querySelector('#resource-note-form').addEventListener('submit',async e=>{e.preventDefault();const s=document.querySelector('#note-status');s.textContent='저장 중…';try{const fd=Object.fromEntries(new FormData(e.currentTarget));await api.createNote({...fd,resource_id:id},user.id);await refreshState();await resourceDetailView(id);}catch(err){s.textContent=err.message;s.classList.add('error');}});
  document.querySelectorAll('[data-link]').forEach(el=>el.addEventListener('change',async()=>{const target_type=el.dataset.type,target_id=el.dataset.id;if(el.checked){await api.addRelation({source_type:'resource',source_id:id,target_type,target_id},user.id);}else{const rel=relations.find(x=>x.target_type===target_type&&x.target_id===target_id);if(rel)await api.removeRelation(rel.id);}}));
}
function linkCheckbox(type,id,label,checked){return `<label class="check"><input type="checkbox" data-link data-type="${type}" data-id="${id}" ${checked?'checked':''}><span>${esc(label)}</span></label>`;}

function notesView(){
  const independent=state.notes.filter(n=>!n.resource_id);
  root.innerHTML=shell(`<section class="hero"><div class="eyebrow">생각</div><h1>독립 메모</h1><p>어떤 글에 딸리지 않은 생각도 바로 기록한다. 분류는 선택사항이다.</p></section><div class="notes-layout"><section class="card"><h2>새 메모</h2><form id="independent-note-form" class="form"><div class="field"><textarea name="body" required placeholder="지금 떠오른 생각을 그대로…"></textarea></div><div class="field"><label>성격 (선택)</label><select name="note_type"><option value="">분류 안 함</option><option>생각</option><option>질문</option><option>좋은 문장</option><option>반론</option><option>글감</option><option>업무 연결</option></select></div><button class="btn">저장</button><div id="ind-note-status" class="status"></div></form></section><section class="card"><h2>메모</h2>${independent.map(n=>`<div class="item"><div>${esc(n.body).replace(/\n/g,'<br>')}</div><div class="meta">${n.note_type?esc(n.note_type)+' · ':''}${new Date(n.updated_at).toLocaleString('ko-KR')}</div></div>`).join('')||empty('독립 메모가 아직 없음')}</section></div>`,'notes');bindCommon();
  document.querySelector('#independent-note-form').addEventListener('submit',async e=>{e.preventDefault();const s=document.querySelector('#ind-note-status');s.textContent='저장 중…';try{const fd=Object.fromEntries(new FormData(e.currentTarget));await api.createNote(fd,user.id);await refreshState();render();}catch(err){s.textContent=err.message;s.classList.add('error');}});
}
function topicsView(){
  root.innerHTML=shell(`<section class="hero"><div class="eyebrow">주제</div><h1>생각을 횡단하는 주제</h1><p>단순 태그가 아니라 여러 읽기와 메모를 다시 만나는 축.</p></section><div class="grid"><section class="card"><h2>주제</h2><div class="tagrow">${state.topics.map(t=>`<span class="tag">${esc(t.name)}</span>`).join('')||empty('아직 주제가 없음')}</div></section><section class="card"><h2>새 주제</h2><form id="topic-form" class="form"><div class="field"><input name="name" required placeholder="예: 기술노동"></div><button class="btn">추가</button><div id="topic-status" class="status"></div></form></section></div>`,'topics');bindCommon();document.querySelector('#topic-form').addEventListener('submit',async e=>{e.preventDefault();const s=document.querySelector('#topic-status');try{await api.createTopic(new FormData(e.currentTarget).get('name'),user.id);await refreshState();render();}catch(err){s.textContent=err.message;s.classList.add('error');}});
}
function questionsView(){
  root.innerHTML=shell(`<section class="hero"><div class="eyebrow">질문</div><h1>계속 붙들고 있는 질문</h1><p>주제보다 더 구체적인 사고의 추진력. 답을 빨리 닫지 않고 관련 자료와 메모를 붙인다.</p></section><div class="grid"><section class="card"><h2>질문</h2>${state.questions.map(q=>`<div class="item"><strong>${esc(q.body)}</strong>${q.current_thought?`<div class="meta">현재 생각: ${esc(q.current_thought)}</div>`:''}</div>`).join('')||empty('아직 질문이 없음')}</section><section class="card"><h2>새 질문</h2><form id="question-form" class="form"><div class="field"><textarea name="body" required placeholder="예: 노동자는 자신이 생산한 것에 대해 어디까지 발언할 권리가 있는가?"></textarea></div><button class="btn">추가</button><div id="question-status" class="status"></div></form></section></div>`,'questions');bindCommon();document.querySelector('#question-form').addEventListener('submit',async e=>{e.preventDefault();const s=document.querySelector('#question-status');try{await api.createQuestion(new FormData(e.currentTarget).get('body'),user.id);await refreshState();render();}catch(err){s.textContent=err.message;s.classList.add('error');}});
}
function archiveView(year='2026'){
  const grouped=groupResourcesByMonth(state.resources), months=grouped[year]||{};
  const monthHtml=Object.keys(months).sort().reverse().map(month=>`<details ${month==='09'?'open':''}><summary>${Number(month)}월</summary>${Object.keys(months[month]).sort().reverse().map(day=>`<details><summary>${Number(month)}월 ${Number(day)}일</summary>${months[month][day].map(r=>`<div class="archive-resource"><a href="${href(`/read/${r.id}/`)}" data-nav="/read/${r.id}/">${esc(r.title)}</a><div class="meta">${esc(r.author||'')}${r.source_name?' · '+esc(r.source_name):''}</div></div>`).join('')}</details>`).join('')}</details>`).join('');
  root.innerHTML=shell(`<section class="hero"><div class="eyebrow">아카이브</div><h1>${year}년</h1><p>그때 무엇을 읽었고 무엇을 생각했는지 시간순으로 복원한다.</p></section><section class="archive">${monthHtml||empty(`${year}년 기록이 아직 없음`)}</section>`,'archive');bindCommon();
}
function searchView(){
  root.innerHTML=shell(`<section class="hero"><div class="eyebrow">검색</div><h1>기록 전체에서 찾기</h1><p>1단계에서는 제목·메모·주제·질문을 빠르게 찾는다.</p></section><input id="search-input" class="searchbox" placeholder="검색어 입력" autofocus><div id="search-results"></div>`,'search');bindCommon();
  const input=document.querySelector('#search-input'), out=document.querySelector('#search-results');
  const draw=()=>{const q=input.value; if(!q.trim()){out.innerHTML=empty('검색어를 입력하면 관련 기록이 여기에 나타남');return;}const rr=state.resources.filter(x=>matchesQuery(x,q,['title','original_title','author','source_name'])), nn=state.notes.filter(x=>matchesQuery(x,q,['body','note_type'])), tt=state.topics.filter(x=>matchesQuery(x,q,['name','summary'])), qq=state.questions.filter(x=>matchesQuery(x,q,['body','current_thought']));out.innerHTML=`<section class="result-section card"><h2>읽기 ${rr.length}</h2>${rr.map(resourceItem).join('')||empty('없음')}</section><section class="result-section card"><h2>메모 ${nn.length}</h2>${nn.map(noteItem).join('')||empty('없음')}</section><section class="result-section card"><h2>주제 ${tt.length}</h2><div class="tagrow">${tt.map(t=>`<span class="tag">${esc(t.name)}</span>`).join('')||empty('없음')}</div></section><section class="result-section card"><h2>질문 ${qq.length}</h2>${qq.map(x=>`<div class="item">${esc(x.body)}</div>`).join('')||empty('없음')}</section>`;document.querySelectorAll('[data-nav]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();navigate(a.dataset.nav);}));};input.addEventListener('input',draw);draw();
}
async function render(){
  if(!user){root.innerHTML='<div class="shell"><div class="empty">불러오는 중…</div></div>';user=await api.currentUser();if(!user){loginView();return;}await refreshState();}
  const path=pathFromLocation();
  if(path==='/'||path==='') return homeView();
  if(path==='/read/'||path==='/read') return readListView();
  const resourceMatch=path.match(/^\/read\/([0-9a-f-]+)\/?$/);if(resourceMatch) return resourceDetailView(resourceMatch[1]);
  if(path==='/notes/'||path==='/notes') return notesView();
  if(path==='/topics/'||path==='/topics') return topicsView();
  if(path==='/questions/'||path==='/questions') return questionsView();
  const archiveMatch=path.match(/^\/archive\/(\d{4})\/?/);if(archiveMatch) return archiveView(archiveMatch[1]);
  if(path==='/search/'||path==='/search') return searchView();
  root.innerHTML=shell(`<section class="hero"><h1>페이지를 찾을 수 없음</h1><button class="btn" id="go-home">홈으로</button></section>`);bindCommon();document.querySelector('#go-home').onclick=()=>navigate('/');
}

window.addEventListener('popstate',render);
supabase.auth.onAuthStateChange((_event,session)=>{const next=session?.user??null;if(Boolean(next)!==Boolean(user)){user=next;if(user)refreshState().then(render);else render();}});
render();
