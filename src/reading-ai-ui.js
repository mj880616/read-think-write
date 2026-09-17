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

async function owner() {
  const user = await api.currentUser();
  if (!user) throw new Error('로그인이 필요합니다.');
  return user;
}

function actionButton(label, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn secondary small';
  button.textContent = label;
  button.addEventListener('click', async () => {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '저장 중…';
    try {
      await action();
      button.textContent = label === '연결' ? '연결됨' : '저장됨';
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      alert(error.message);
    }
  });
  return button;
}

function suggestionItem(text, label, action) {
  const item = document.createElement('div');
  item.className = 'item';
  const body = document.createElement('div');
  body.textContent = text;
  item.append(body, actionButton(label, action));
  return item;
}

function section(title, items) {
  const wrap = document.createElement('section');
  const heading = document.createElement('h3');
  heading.textContent = title;
  wrap.append(heading, ...items);
  return wrap;
}

async function saveNote(resourceId, text, noteType = '생각') {
  const user = await owner();
  await api.createNote({ body: text, note_type: noteType, resource_id: resourceId }, user.id);
}

async function saveQuestion(resourceId, text) {
  const user = await owner();
  const question = await api.createQuestion(text, user.id);
  await api.addRelation({
    source_type: 'resource',
    source_id: resourceId,
    target_type: 'question',
    target_id: question.id
  }, user.id);
}

async function saveConnection(resourceId, connection) {
  const user = await owner();
  await api.addRelation({
    source_type: 'resource',
    source_id: resourceId,
    target_type: connection.type,
    target_id: connection.id
  }, user.id);
}

async function connectionLabels() {
  const [topics, questions] = await Promise.all([api.listTopics(), api.listQuestions()]);
  const labels = new Map();
  for (const topic of topics) labels.set(`topic:${topic.id}`, topic.name);
  for (const question of questions) labels.set(`question:${question.id}`, question.body);
  return labels;
}

async function renderBaseResult(panel, result, resourceId) {
  const root = panel.querySelector('#reading-ai-results');
  root.replaceChildren();

  const claimItems = result.claims.map((text) =>
    suggestionItem(text, '메모로 저장', () => saveNote(resourceId, text, '생각'))
  );
  root.append(section('핵심 주장·논리', claimItems));

  const questionItems = result.questions.map((text) =>
    suggestionItem(text, '질문으로 저장', () => saveQuestion(resourceId, text))
  );
  root.append(section('읽으며 남길 질문', questionItems));

  if (result.connections.length) {
    const labels = await connectionLabels();
    const connectionItems = result.connections.map((connection) => {
      const label = labels.get(`${connection.type}:${connection.id}`) || (connection.type === 'topic' ? '기존 주제' : '기존 질문');
      const text = connection.reason ? `${label} — ${connection.reason}` : label;
      return suggestionItem(text, '연결', () => saveConnection(resourceId, connection));
    });
    root.append(section('기존 기록과 연결 후보', connectionItems));
  }

  panel.querySelector('#reading-ai-expand').hidden = false;
}

function renderExpansion(panel, result, resourceId) {
  const root = panel.querySelector('#reading-ai-expansion');
  root.replaceChildren();
  const expansion = result.expansion;
  if (!expansion) return;

  const groups = [
    ['긴장 지점', expansion.tensions, '생각'],
    ['반론·대안 관점', expansion.counterpoints, '반론'],
    ['발전시킬 문제의식', expansion.framings, '글감']
  ];

  for (const [title, values, noteType] of groups) {
    if (!values.length) continue;
    const items = values.map((text) =>
      suggestionItem(text, '메모로 저장', () => saveNote(resourceId, text, noteType))
    );
    root.append(section(title, items));
  }
}

function createPanel(resourceId) {
  const panel = document.createElement('section');
  panel.className = 'article-note card';
  panel.dataset.readingAiPanel = 'true';
  panel.innerHTML = `
    <h2>GPT로 읽기</h2>
    <p class="muted">원문은 그대로 두고, 필요할 때만 핵심 논리·질문·기존 기록과의 연결 후보를 제안받습니다. 결과는 선택해서 저장하기 전까지 내 기록이 아닙니다.</p>
    <div class="inline-actions">
      <button type="button" class="btn" id="reading-ai-run">GPT로 읽기</button>
      <button type="button" class="btn secondary" id="reading-ai-expand" hidden>나의 생각 확장</button>
    </div>
    <div class="status" id="reading-ai-status" aria-live="polite"></div>
    <div class="stack" id="reading-ai-results"></div>
    <div class="stack" id="reading-ai-expansion"></div>
  `;

  const runButton = panel.querySelector('#reading-ai-run');
  const expandButton = panel.querySelector('#reading-ai-expand');

  runButton.addEventListener('click', async () => {
    runButton.disabled = true;
    setStatus(panel, '글을 읽고 논리와 질문을 정리하는 중…');
    try {
      const result = normalizeAiReadResult(await api.analyzeResource(resourceId, 'read'));
      await renderBaseResult(panel, result, resourceId);
      setStatus(panel, '제안이 준비되었습니다. 필요한 항목만 기록으로 저장하세요.');
    } catch (error) {
      setStatus(panel, error.message, true);
    } finally {
      runButton.disabled = false;
    }
  });

  expandButton.addEventListener('click', async () => {
    expandButton.disabled = true;
    setStatus(panel, '반론과 연결, 새로운 문제의식을 확장하는 중…');
    try {
      const result = normalizeAiReadResult(await api.analyzeResource(resourceId, 'expand'));
      renderExpansion(panel, result, resourceId);
      setStatus(panel, '생각 확장 제안이 준비되었습니다. 필요한 항목만 저장하세요.');
    } catch (error) {
      setStatus(panel, error.message, true);
    } finally {
      expandButton.disabled = false;
    }
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
