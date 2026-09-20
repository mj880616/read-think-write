function normalize(value, compact = false) {
  let text = '';
  const starts = [];
  const ends = [];
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (/\s/u.test(char)) {
      if (compact) continue;
      if (text.endsWith(' ')) {
        ends[ends.length - 1] = index + 1;
        continue;
      }
      text += ' ';
    } else {
      text += /[“”]/u.test(char) ? '"' : /[‘’]/u.test(char) ? "'" : char;
    }
    starts.push(index);
    ends.push(index + 1);
  }
  return { text, starts, ends };
}

function occurrences(haystack, needle, starts, ends) {
  const matches = [];
  if (!needle) return matches;
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
    matches.push({ start: starts ? starts[at] : at, end: ends ? ends[at + needle.length - 1] : at + needle.length });
  }
  return matches;
}

function chooseMatch(matches, text, bookmark) {
  const before = normalize(bookmark.context_before || '', true).text.slice(-60);
  const after = normalize(bookmark.context_after || '', true).text.slice(0, 60);
  const saved = bookmark.start_offset == null ? null : Number(bookmark.start_offset);
  const rank = (match) => {
    const preceding = normalize(text.slice(Math.max(0, match.start - 400), match.start), true).text;
    const following = normalize(text.slice(match.end, match.end + 400), true).text;
    return {
      context: Number(Boolean(before) && preceding.endsWith(before)) + Number(Boolean(after) && following.startsWith(after)),
      distance: Number.isFinite(saved) ? Math.abs(match.start - saved) : match.start
    };
  };
  return matches.reduce((best, candidate) => {
    if (!best) return candidate;
    const a = rank(candidate);
    const b = rank(best);
    return a.context > b.context || (a.context === b.context && a.distance < b.distance) ? candidate : best;
  }, null);
}

export function locateBookmarkRange(textNodes, bookmark) {
  const quote = bookmark?.selected_text;
  if (!quote || !textNodes?.length) return null;
  const text = textNodes.map((node) => node.nodeValue || '').join('');
  let matches = occurrences(text, quote);
  if (!matches.length) {
    const source = normalize(text);
    matches = occurrences(source.text, normalize(quote).text, source.starts, source.ends);
  }
  if (!matches.length) {
    const source = normalize(text, true);
    matches = occurrences(source.text, normalize(quote, true).text, source.starts, source.ends);
  }
  const match = chooseMatch(matches, text, bookmark);
  if (!match) return null;

  let seen = 0;
  let startNode = null;
  let endNode = null;
  let startOffset = 0;
  let endOffset = 0;
  for (const node of textNodes) {
    const next = seen + (node.nodeValue?.length || 0);
    if (!startNode && match.start < next) {
      startNode = node;
      startOffset = match.start - seen;
    }
    if (startNode && match.end <= next) {
      endNode = node;
      endOffset = match.end - seen;
      break;
    }
    seen = next;
  }
  return startNode && endNode ? { startNode, startOffset, endNode, endOffset } : null;
}

export function bookmarkSelectionData(full, quote, before, through, selected) {
  const start = before.length + selected.length - selected.trimStart().length;
  const end = through.length - (selected.length - selected.trimEnd().length);
  if (!quote || start < 0 || end < start || end > full.length) return null;
  return {
    text: quote,
    start,
    end,
    contextBefore: full.slice(Math.max(0, start - 160), start),
    contextAfter: full.slice(end, end + 160)
  };
}
