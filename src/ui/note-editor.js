import { saveNote } from '../data/notes.js';
import { clearDraft, loadDraft, saveDraft } from '../runtime/draft-store.js';

const types = ['', '생각', '질문', '좋은 문장', '반론', '글감', '업무 연결'];

export function mountNoteEditor(root, { resourceId = null, note = null, onSaved } = {}) {
  const draftId = note?.id || resourceId || 'standalone';
  const draft = loadDraft('note', draftId);
  root.innerHTML = `
    <form class="note-editor" data-note-form>
      <textarea name="body" rows="5" placeholder="여기에 생각을 남깁니다." required>${escapeHtml(draft || note?.body || '')}</textarea>
      <div class="inline-actions">
        <select name="note_type" aria-label="메모 유형">${types.map(t => `<option value="${t}" ${note?.note_type===t?'selected':''}>${t || '분류 없음'}</option>`).join('')}</select>
        <button class="primary-button" type="submit">메모 저장</button>
        <span class="status-line" data-status></span>
      </div>
    </form>`;
  const form = root.querySelector('[data-note-form]');
  const textarea = form.elements.body;
  const status = form.querySelector('[data-status]');
  textarea.addEventListener('input', () => saveDraft('note', draftId, textarea.value));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    status.textContent = '저장 중…';
    try {
      const saved = await saveNote({ id: note?.id, resource_id: resourceId, body: textarea.value, note_type: form.elements.note_type.value || null });
      clearDraft('note', draftId);
      textarea.value = '';
      status.textContent = '저장 완료';
      onSaved?.(saved);
    } catch (err) {
      saveDraft('note', draftId, textarea.value);
      status.textContent = `저장 실패: ${err.message}`;
    }
  });
}
function escapeHtml(v='') { return String(v).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
