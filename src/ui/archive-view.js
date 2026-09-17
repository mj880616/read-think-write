import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { listResources } from '../data/resources.js';
import { listNotes } from '../data/notes.js';
import { groupResourcesByArchive } from '../domain/archive.js';
import { href } from '../router.js';

export async function renderArchive(root, year = null, month = null) {
  const resources = await listResources({ limit: 500 });
  const archive = groupResourcesByArchive(resources);
  const years = [...archive.keys()].sort((a,b)=>Number(b)-Number(a));
  const selectedYear = year || years[0] || String(new Date().getFullYear());
  const months = archive.get(selectedYear) || new Map();
  root.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">아카이브</p><h1>${selectedYear}년</h1><p class="muted">그때 무엇을 읽고 무엇을 생각했는지 시간순으로 봅니다.</p></div></div>
    <div class="year-nav">${years.map(y => `<a data-route class="chip ${y===selectedYear?'selected':''}" href="${href(`/archive/${y}`)}">${y}</a>`).join('')}</div>
    <div class="archive-stack">${[...months.entries()].sort(([a],[b])=>Number(b)-Number(a)).map(([m,days]) => `
      <details class="month-block" ${(!month || month===m)?'open':''}>
        <summary>${Number(m)}월</summary>
        <div class="month-content">${[...days.entries()].sort(([a],[b])=>Number(b)-Number(a)).map(([d,items]) => `
          <section class="day-block"><h3>${Number(m)}월 ${Number(d)}일</h3>${items.map(r => `<details class="archive-resource" data-resource="${r.id}"><summary>${escapeHtml(r.title)}</summary><div class="archive-body"><div class="prose">${DOMPurify.sanitize(marked.parse(r.body_md || ''))}</div><div data-archive-notes="${r.id}"><p class="muted">메모 불러오는 중…</p></div></div></details>`).join('')}</section>`).join('')}</div>
      </details>`).join('') || '<div class="empty-state">이 연도에 저장된 자료가 없습니다.</div>'}</div>`;
  root.querySelectorAll('[data-archive-notes]').forEach(async slot => {
    const notes = await listNotes({ resourceId: slot.dataset.archiveNotes });
    slot.innerHTML = `<h4>나의 메모</h4>${notes.map(n=>`<div class="compact-note"><strong>${escapeHtml(n.note_type||'메모')}</strong><p>${escapeHtml(n.body).replace(/\n/g,'<br>')}</p></div>`).join('') || '<p class="muted">아직 메모가 없습니다.</p>'}`;
  });
}
function escapeHtml(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
