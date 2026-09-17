const DUPLICATING_ANCESTORS = new Set(['li', 'blockquote']);

export function shouldKeepContentBlock(tagName, ancestorTagNames = []) {
  const tag = String(tagName || '').toLowerCase();
  if (tag === 'li' || tag === 'blockquote') return true;
  return !ancestorTagNames.some((ancestor) => DUPLICATING_ANCESTORS.has(String(ancestor || '').toLowerCase()));
}

export function semanticAncestorTags(element, stopAt) {
  const tags = [];
  let current = element?.parentElement || null;
  while (current && current !== stopAt) {
    tags.push(String(current.tagName || '').toLowerCase());
    current = current.parentElement;
  }
  return tags;
}
