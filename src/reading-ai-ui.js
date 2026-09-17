import * as api from './api.js';
import { normalizeAiReadResult } from './reading-tools.js';

function resourceIdFromLocation() {
  const match = location.pathname.match(/\/read\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function setStatus(panel, message, isError = false) {
  const status = panel.querySelector('#reading-ai-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function textSection(title, values) {
  const wrap = document.createElement('section');
  wrap.className = 'reading-ai-text';
  const heading = document.createElement('h3');
  heading.textContent = title;
  wrap.append(heading);
  for (const value of values) {
    const paragraph = document.createElement('p');
    paragraph.textContent = value;
    wrap.append(paragraph);
  }
  return wrap;
}

async function connectionTexts(connections) {
  const [topics, questions] = await Promise.all([api.listTopics(), api.listQuestions()]);
  const labels = new Map();
  for (const topic of topics) labels.set(`topic:${topic.id}`, topic.name);
  for (const question of questions) labels.set(`question:${question.id}`, question.body);
  return connections.map((connection) => {
    const label = labels.get(`${connection.type}:${connection.id}`) || (connection.type === 'topic' ? '기존 주제' : '기존 질문');
    return connection.reason ? `${label} — ${connection.reason}` : label;
  });
}

async function renderBaseResult(panel, result) {
  const root = panel.querySelector('#reading-ai-results');
  root.replaceChildren();
  root.append(textSection('핵심 주장·논리', result.claims));
  root.append(textSection('읽으며 남길 질문', result.questions));
  if (result.connections.length) {
    root.append(textSection('기존 기록과 연결 후보', await connectionTexts(result.connections)));
  }
  panel.querySelector('#reading-ai-expand').hidden = false;
}

function renderExpansion(panel, result) {
  const root = panel.querySelector('#reading-ai-expansion');
  root.replaceChildren();
  const expansion = result.expansion;
  if (!expansion) return;
  for (const [title, values] of [['긴장 지점', expansion.tensions], ['반론·대안 관점', expansion.counterpoints], ['발전시킬 문제의식', expansion.framings]]) {
    if (values.length) root.append(textSection(title, values));
  }
}

function createPanel(resourceId) {
  const panel = document.createElement('section');
  panel.className = 'article-note card';
  panel.dataset.readingAiPanel = 'true';
  panel.innerHTML = `
    <h2>GPT로 읽기</h2>
    <p class="muted">원문은 그대로 두고 핵심 논리·질문·기존 기록과의 연결 후보를 제안합니다. 필요한 부분은 텍스트를 선택해 복사해서 사용하세요.</p>
    <div class="inline-actions"><button type="button" class="btn" id="reading-ai-run">GPT로 읽기</button><button type="button" class="btn secondary" id="reading-ai-expand" hidden>나의 생각 확장</button></div>
    <div class="status" id="reading-ai-status" aria-live="polite"></div>
    <div class="stack" id="reading-ai-results"></div><div class="stack" id="reading-ai-expansion"></div>`;
  const runButton = panel.querySelector('#reading-ai-run');
  const expandButton = panel.querySelector('#reading-ai-expand');
  runButton.addEventListener('click', async () => {
    runButton.disabled = true; setStatus(panel, '글을 읽고 논리와 질문을 정리하는 중…');
    try { await renderBaseResult(panel, normalizeAiReadResult(await api.analyzeResource(resourceId, 'read'))); setStatus(panel, '제안이 준비되었습니다. 필요한 부분을 선택해 복사할 수 있습니다.'); }
    catch (error) { setStatus(panel, error.message, true); } finally { runButton.disabled = false; }
  });
  expandButton.addEventListener('click', async () => {
    expandButton.disabled = true; setStatus(panel, '반론과 연결, 새로운 문제의식을 확장하는 중…');
    try { renderExpansion(panel, normalizeAiReadResult(await api.analyzeResource(resourceId, 'expand'))); setStatus(panel, '생각 확장 제안이 준비되었습니다. 필요한 부분을 선택해 복사할 수 있습니다.'); }
    catch (error) { setStatus(panel, error.message, true); } finally { expandButton.disabled = false; }
  });
  return panel;
}

export function enhanceReadingAi() {
  const resourceId = resourceIdFromLocation();
  const article = document.querySelector('article.article');
  if (!resourceId || !article || document.querySelector('[data-reading-ai-panel]')) return;
  article.insertAdjacentElement('afterend', createPanel(resourceId));
}
const observer = new MutationObserver(() => enhanceReadingAi());
observer.observe(document.documentElement, { childList: true, subtree: true });
enhanceReadingAi();
