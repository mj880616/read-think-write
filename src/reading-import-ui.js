import * as api from './api.js';
import { importStatusMessage, normalizeImportResponse } from './reading-tools.js';

function setImportStatus(status, message, isError = false) {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function fillResourceForm(form, resource) {
  for (const [name, value] of Object.entries(resource)) {
    if (!value) continue;
    const field = form.elements.namedItem(name);
    if (field && 'value' in field) field.value = value;
  }
}

function createImporter(resourceForm) {
  const wrap = document.createElement('div');
  wrap.className = 'item';
  wrap.dataset.readingImporter = 'true';
  wrap.innerHTML = `
    <h3>URL로 가져오기</h3>
    <p class="muted">공개된 글 주소를 붙여넣으면 제목·저자·날짜·본문을 가능한 범위에서 채웁니다. 저장 전 직접 확인하고 수정할 수 있습니다.</p>
    <form class="form" id="resource-import-form">
      <div class="field">
        <label>글 URL</label>
        <input name="url" type="url" inputmode="url" placeholder="https://…" required>
      </div>
      <button type="submit" class="btn secondary">가져오기</button>
      <div class="status" id="resource-import-status" aria-live="polite"></div>
    </form>
  `;

  const importForm = wrap.querySelector('#resource-import-form');
  importForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = importForm.querySelector('button[type="submit"]');
    const status = importForm.querySelector('#resource-import-status');
    const url = new FormData(importForm).get('url');
    button.disabled = true;
    button.textContent = '가져오는 중…';
    setImportStatus(status, '원문을 확인하는 중…');
    try {
      const payload = await api.importResourceUrl(url);
      const result = normalizeImportResponse(payload);
      fillResourceForm(resourceForm, result.resource);
      const warningText = result.warnings.length ? ` ${result.warnings.join(' ')}` : '';
      setImportStatus(status, `${importStatusMessage(result.status)}${warningText}`);
    } catch (error) {
      setImportStatus(status, `자동으로 가져오지 못했습니다. 수동 입력은 그대로 사용할 수 있습니다. ${error.message}`, true);
    } finally {
      button.disabled = false;
      button.textContent = '가져오기';
    }
  });

  return wrap;
}

function importPendingUrl(importer) {
  const params = new URLSearchParams(location.search);
  const pendingUrl = String(params.get('url') || '').trim();
  if (!pendingUrl || importer.dataset.pendingUrlHandled === 'true') return;

  importer.dataset.pendingUrlHandled = 'true';
  const input = importer.querySelector('input[name="url"]');
  const form = importer.querySelector('#resource-import-form');
  if (!input || !form) return;

  input.value = pendingUrl;
  params.delete('url');
  const query = params.toString();
  history.replaceState({}, '', `${location.pathname}${query ? `?${query}` : ''}`);
  queueMicrotask(() => form.requestSubmit());
}

export function enhanceReadingImport() {
  const resourceForm = document.querySelector('#resource-form');
  if (!resourceForm || document.querySelector('[data-reading-importer]')) return;
  const importer = createImporter(resourceForm);
  resourceForm.insertAdjacentElement('beforebegin', importer);
  importPendingUrl(importer);
}

const observer = new MutationObserver(() => enhanceReadingImport());
observer.observe(document.documentElement, { childList: true, subtree: true });
enhanceReadingImport();
