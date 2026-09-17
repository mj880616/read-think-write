import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { getResource } from '../data/resources.js';
import { listNotes } from '../data/notes.js';
import { safeExternalUrl } from '../utils/safe-url.js';
import { mountNoteEditor } from './note-editor.js';
import { mountRelationPanel } from './relation-panel.js';
import { mountResourceEditor } from './resource-editor.js';

export async function renderResource(root, id) {
  const [resource, notes] = await Promise.all([getResource(id), listNotes({ resourceId: id })]);
  const external = safeExternalUrl(resource.original_url);
  root.innerHTML = `
    <article class="reading-page">
      <header class="reading-header">
        <p class="eyebrow">${resource.published_on || '날짜 없음'}</p>
        <h1>${escapeHtml(resource.title)}</h1>
        ${resource.original_title ? `<p class="original-title">${escapeHtml(resource.original_title)}</p>` : ''}
        <p class="byline">${escapeHtml([resource.author, resource.source_name].filter(Boolean).join(' · '))}</p>
        <div class="reading-tools">${external ? `<a class="secondary-button" href="${external}" target="_blank" rel="noopener noreferrer">원문 보기</a>` : ''}<button class="quiet-button" id="editResource">자료 편집</button></div>
      </header>
      <div id="resourceEditor"></div>
      <div class="prose">${DOMPurify.sanitize(marked.parse(resource.body_md || ''))}</div>
      <section class="memo-section"><h2>나의 메모</h2><div id="noteEditor"></div><div id="noteList" class="memo-list">${notes.map(renderNote).join('') || '<p class="muted">아직 메모가 없습니다.</p>'}</div></section>
      <div id="relationPanel"></div>
    </article>`;
  mountNoteEditor(root.querySelector('#noteEditor'), { resourceId: id, onSaved: () => renderResource(root, id) });
  await mountRelationPanel(root.querySelector('#relationPanel'), { sourceType: 'resource', sourceId: id });
  root.querySelector('#editResource').addEventListener('click', () => mountResourceEditor(root.querySelector('#resourceEditor'), { resource, onSaved: () => renderResource(root, id) }));
  root.querySelectorAll('[data-note-rel]').forEach(async holder => {
    await mountRelationPanel(holder, { sourceType: 'note', sourceId: holder.dataset.noteRel });
  });
}
function renderNote(n) { return `<div class="memo-card"><div class="memo-meta">${escapeHtml(n.note_type || '메모')} · ${new Date(n.created_at).toLocaleDateString('ko-KR')}</div><p>${escapeHtml(n.body).replace(/\n/g,'<br>')}</p><div data-note-rel="${n.id}"></div></div>`; }
function escapeHtml(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
