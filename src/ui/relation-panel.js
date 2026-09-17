import { listTopics } from '../data/topics.js';
import { listQuestions } from '../data/questions.js';
import { connectRelation, disconnectRelation, listRelationsForSource } from '../data/relations.js';

export async function mountRelationPanel(root, { sourceType, sourceId }) {
  const [topics, questions, relations] = await Promise.all([listTopics(), listQuestions(), listRelationsForSource(sourceType, sourceId)]);
  const topicById = new Map(topics.map(x => [x.id, x]));
  const questionById = new Map(questions.map(x => [x.id, x]));
  root.innerHTML = `
    <section class="relation-panel">
      <h3>연결</h3>
      <div class="chips">${relations.map(r => {
        const label = r.target_type === 'topic' ? topicById.get(r.target_id)?.name : questionById.get(r.target_id)?.body;
        return label ? `<button type="button" class="chip" data-remove="${r.id}" title="연결 해제">${escapeHtml(label)} ×</button>` : '';
      }).join('') || '<span class="muted">아직 연결된 주제나 질문이 없습니다.</span>'}</div>
      <form class="inline-form" data-connect>
        <select name="target_type"><option value="topic">주제</option><option value="question">질문</option></select>
        <select name="target_id"></select>
        <button class="secondary-button" type="submit">연결</button>
        <span class="status-line" data-status></span>
      </form>
    </section>`;
  const form = root.querySelector('[data-connect]');
  const type = form.elements.target_type;
  const id = form.elements.target_id;
  const status = form.querySelector('[data-status]');
  const fill = () => {
    const rows = type.value === 'topic' ? topics : questions;
    id.innerHTML = rows.length ? rows.map(x => `<option value="${x.id}">${escapeHtml(type.value==='topic'?x.name:x.body)}</option>`).join('') : '<option value="">먼저 항목을 만들어 주세요</option>';
  };
  type.addEventListener('change', fill); fill();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!id.value) return;
    status.textContent = '연결 중…';
    try {
      await connectRelation({ source_type: sourceType, source_id: sourceId, target_type: type.value, target_id: id.value });
      status.textContent = '연결 완료';
      await mountRelationPanel(root, { sourceType, sourceId });
    } catch (err) { status.textContent = err.message; }
  });
  root.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', async () => {
    await disconnectRelation(btn.dataset.remove);
    await mountRelationPanel(root, { sourceType, sourceId });
  }));
}
function escapeHtml(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
