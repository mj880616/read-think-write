import { APP_BASE } from './config.js';
export function restoreRedirect(){const p=new URLSearchParams(location.search).get('redirect');if(!p)return;const clean=p.startsWith('/')?p:'/'+p;history.replaceState({},'',APP_BASE.replace(/\/$/,'')+clean);}
