const IMPORT_STATUSES = new Set(['full', 'metadata_only', 'partial']);
const RESOURCE_FIELDS = [
  'title',
  'original_title',
  'author',
  'source_name',
  'published_on',
  'original_url',
  'body_md'
];

function stringArray(value, name) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${name} 형식이 올바르지 않습니다.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

export function normalizeImportResponse(payload) {
  if (!payload || typeof payload !== 'object' || !IMPORT_STATUSES.has(payload.status)) {
    throw new Error('가져오기 응답 형식이 올바르지 않습니다.');
  }
  if (!payload.resource || typeof payload.resource !== 'object') {
    throw new Error('가져온 자료 정보가 없습니다.');
  }

  const resource = {};
  for (const field of RESOURCE_FIELDS) {
    const value = payload.resource[field];
    resource[field] = typeof value === 'string' ? value : '';
  }

  const warnings = Array.isArray(payload.warnings)
    ? payload.warnings.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];

  return { status: payload.status, resource, warnings };
}

export function importStatusMessage(status) {
  if (status === 'full') return '본문까지 가져왔습니다. 저장 전에 내용을 확인하세요.';
  if (status === 'metadata_only') return '메타정보는 가져왔지만 본문은 자동으로 읽지 못했습니다. 필요한 경우 본문을 직접 붙여넣으세요.';
  if (status === 'partial') return '일부 정보만 가져왔습니다. 빈 항목을 확인한 뒤 저장하세요.';
  return '가져오기 결과를 확인하세요.';
}

export function normalizeAiReadResult(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('AI 응답 형식이 올바르지 않습니다.');
  }

  const claims = stringArray(payload.claims, 'claims');
  const questions = stringArray(payload.questions, 'questions');

  if (!Array.isArray(payload.connections)) {
    throw new Error('connections 형식이 올바르지 않습니다.');
  }
  const connections = payload.connections.map((connection) => {
    if (!connection || typeof connection !== 'object') {
      throw new Error('connection 형식이 올바르지 않습니다.');
    }
    const type = connection.type;
    const id = typeof connection.id === 'string' ? connection.id.trim() : '';
    const reason = typeof connection.reason === 'string' ? connection.reason.trim() : '';
    if (!['topic', 'question'].includes(type) || !id) {
      throw new Error('connection 값이 올바르지 않습니다.');
    }
    return { type, id, reason };
  });

  let expansion = null;
  if (payload.expansion !== null && payload.expansion !== undefined) {
    if (!payload.expansion || typeof payload.expansion !== 'object') {
      throw new Error('expansion 형식이 올바르지 않습니다.');
    }
    expansion = {
      tensions: stringArray(payload.expansion.tensions ?? [], 'expansion.tensions'),
      counterpoints: stringArray(payload.expansion.counterpoints ?? [], 'expansion.counterpoints'),
      framings: stringArray(payload.expansion.framings ?? [], 'expansion.framings')
    };
  }

  return { claims, questions, connections, expansion };
}
