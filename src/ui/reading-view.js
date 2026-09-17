import { listResources } from '../data/resources.js';
import { href, navigate } from '../router.js';
import { mountResourceEditor } from './resource-editor.js';

export async function renderReading(root) {
  const resources = await listResources();
  root.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">읽기</p><h1>읽은 자료</h1></div><button class="primary-button" id="newResource">새 자료</button></div>
    <div id="editorSlot"></div>
    <div class="list-stack">${resources.map(r => `
      <a data-route class="list-card" href="${href(`/resource/${r.id}`)}">
        <div><strong>${escapeHtml(r.title)}</strong><p>${escapeHtml([r.author,r.source_name].filter(Boolean).join(' · '))}</p></div>
        <time>${r.published_on || ''}</time>
      </a>`).join('') || '<div class="empty-state">아직 저장한 자료가 없습니다.</div>'}</div>`;
  root.querySelector('#newResource').addEventListener('click', () => {
    const slot = root.querySelector('#editorSlot');
    mountResourceEditor(slot, { onSaved: saved => navigate(`/resource/${saved.id}`) });
    slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
function escapeHtml(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
