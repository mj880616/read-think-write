const TOP_TEXT_LIMIT = 500;

export function extractPublishedDateFromText(value) {
  if (typeof value !== 'string') return '';
  const top = value.slice(0, TOP_TEXT_LIMIT);
  const match = top.match(/(?:^|\n)\s*((?:19|20)\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?(?:\s+(?:[01]?\d|2[0-3]):[0-5]\d)?\s*(?=\n|$)/m);
  if (!match) return '';
  const year = match[1];
  const month = match[2].padStart(2, '0');
  const day = match[3].padStart(2, '0');
  const candidate = `${year}-${month}-${day}`;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate) return '';
  return candidate;
}
