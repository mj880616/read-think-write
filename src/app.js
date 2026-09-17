import './styles.css';
import { getSession, onAuthChange } from './runtime/auth.js';
import { currentRoute, navigate, startRouter } from './router.js';
import { mountShell } from './ui/shell.js';
import { renderLogin } from './ui/login-view.js';
import { renderHome } from './ui/home-view.js';
import { renderReading } from './ui/reading-view.js';
import { renderResource } from './ui/resource-view.js';
import { renderNotes } from './ui/notes-view.js';
import { renderArchive } from './ui/archive-view.js';
import { renderTopics } from './ui/topics-view.js';
import { renderQuestions } from './ui/questions-view.js';
import { renderSearch } from './ui/search-view.js';

const root=document.querySelector('#app');
let session=await getSession().catch(()=>null);
let shell=null;
let renderToken=0;

async function render(route=currentRoute()){
  const token=++renderToken;
  if(!session){shell=null;renderLogin(root);return;}
  if(route.name==='login'){navigate('/',{replace:true});return;}
  if(!shell)shell=mountShell(root);
  const {main,setActive}=shell;
  setActive(route.name==='home'?'/':route.name==='archive'?'/archive/2026':`/${route.name}`);
  main.innerHTML='<div class="loading">불러오는 중…</div>';
  try{
    if(route.name==='home')await renderHome(main);
    else if(route.name==='reading')await renderReading(main);
    else if(route.name==='resource')await renderResource(main,route.id);
    else if(route.name==='notes')await renderNotes(main);
    else if(route.name==='archive')await renderArchive(main,route.year,route.month);
    else if(route.name==='topics')await renderTopics(main,route.params);
    else if(route.name==='questions')await renderQuestions(main,route.params);
    else if(route.name==='search')await renderSearch(main,route.params);
    if(token!==renderToken)return;
  }catch(err){main.innerHTML=`<div class="error-card"><h2>불러오지 못했습니다.</h2><p>${escapeHtml(err.message||String(err))}</p></div>`;}
}

onAuthChange(next=>{session=next;if(!session)navigate('/login',{replace:true});render();});
startRouter(render);

function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
