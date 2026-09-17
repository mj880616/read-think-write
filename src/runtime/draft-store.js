const prefix = 'rtw:draft:';

export function draftKey(kind, id = 'new') {
  return `${prefix}${kind}:${id}`;
}

export function saveDraft(kind, id, value) {
  localStorage.setItem(draftKey(kind, id), String(value ?? ''));
}

export function loadDraft(kind, id) {
  return localStorage.getItem(draftKey(kind, id)) ?? '';
}

export function clearDraft(kind, id) {
  localStorage.removeItem(draftKey(kind, id));
}
