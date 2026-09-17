import { listNotes } from '../data/notes.js';
import { mountNoteEditor } from './note-editor.js';
import { mountRelationPanel } from './relation-panel.js';

export async function renderNotes(root) {
  const notes = await listNotes({ resourceId: null });
  root.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">생각</p><h1>독립 메모</h1><p class="muted">특정 글에 묶이지 않은 생각을 바로 남깁니다.</p></div></div>
    <div id="standaloneEditor"></div>
    <div class="memo-list">${notes.map(n => `<article class="memo-card"><div class="memo-meta">${escapeHtml(n.note_type || '메모')} · ${new Date(n.created_at).toLocaleDateString('ko-KR')}</div><p>${escapeHtml(n.body).replace(/\n/g,'<br>')}</p><div data-note-rel="${n.id}"></div></article>`).join('') || '<div class="empty-state">독립 메모가 없습니다.</div>'}</div>`;
  mountNoteEditor(root.querySelector('#standaloneEditor'), { onSaved: () => renderNotes(root) });
  for (const holder of root.querySelectorAll('[data-note-rel]')) await mountRelationPanel(holder, { sourceType: 'note', sourceId: holder.dataset.noteRel });
}
function escapeHtml(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
