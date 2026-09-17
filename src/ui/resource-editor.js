import { saveResource } from '../data/resources.js';
import { clearDraft, loadDraft, saveDraft } from '../runtime/draft-store.js';
import { safeExternalUrl } from '../utils/safe-url.js';

export function mountResourceEditor(root, { resource = null, onSaved }) {
  const draftId = resource?.id || 'new';
  const savedDraft = loadDraft('resource-body', draftId);
  root.innerHTML = `
    <form class="editor-card" id="resourceForm">
      <div class="form-grid">
        <label class="wide">제목<input name="title" required value="${escapeAttr(resource?.title || '')}"></label>
        <label>원제<input name="original_title" value="${escapeAttr(resource?.original_title || '')}"></label>
        <label>저자<input name="author" value="${escapeAttr(resource?.author || '')}"></label>
        <label>출처<input name="source_name" value="${escapeAttr(resource?.source_name || '')}"></label>
        <label>발표일<input name="published_on" type="date" value="${escapeAttr(resource?.published_on || '')}"></label>
        <label class="wide">원문 링크<input name="original_url" type="url" value="${escapeAttr(resource?.original_url || '')}"></label>
        <label class="wide">본문 / 번역문<textarea name="body_md" rows="18">${escapeHtml(savedDraft || resource?.body_md || '')}</textarea></label>
        <label>공개 설정<select name="visibility"><option value="private" ${resource?.visibility !== 'public' ? 'selected' : ''}>비공개</option><option value="public" ${resource?.visibility === 'public' ? 'selected' : ''}>공개</option></select></label>
      </div>
      <div class="editor-actions"><button class="primary-button" type="submit">저장</button><span class="status-line" data-status></span></div>
    </form>`;
  const form = root.querySelector('#resourceForm');
  const body = form.elements.body_md;
  const status = form.querySelector('[data-status]');
  body.addEventListener('input', () => saveDraft('resource-body', draftId, body.value));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    status.textContent = '저장 중…';
    const fd = new FormData(form);
    const original = fd.get('original_url');
    if (original && !safeExternalUrl(original)) { status.textContent = '원문 링크는 http/https 주소만 사용할 수 있습니다.'; return; }
    try {
      const saved = await saveResource({ id: resource?.id, ...Object.fromEntries(fd.entries()) });
      clearDraft('resource-body', draftId);
      status.textContent = '저장 완료';
      onSaved?.(saved);
    } catch (err) {
      saveDraft('resource-body', draftId, body.value);
      status.textContent = `저장 실패: ${err.message}`;
    }
  });
}

function escapeHtml(v='') { return String(v).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function escapeAttr(v='') { return escapeHtml(v).replace(/"/g, '&quot;'); }
