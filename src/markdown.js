import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/+esm';
import { Marked, Tokenizer, Renderer } from 'https://cdn.jsdelivr.net/npm/marked@16.2.1/lib/marked.esm.js';

// Keep marked's delimiter balancing and masking of code, links and escapes.
// Only its delimiter-search mask changes; the source and token text do not.
const cjkAfterPunctuationStrong = /(?<=[\p{P}\p{S}])(?<!\*)\*\*(?!\*)([\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu;
const markdown = new Marked({
  tokenizer: {
    del(src) {
      // undefined means no token; false would fall back to single-tilde GFM.
      if (src.startsWith('~~')) return Tokenizer.prototype.del.call(this, src);
    },
    emStrong(src, maskedSrc, prevChar) {
      if (!src.startsWith('**')) return false;
      // Preserve already valid CommonMark nesting; relax only failed strongs.
      const original = Tokenizer.prototype.emStrong.call(this, src, maskedSrc, prevChar);
      if (original) return original;
      const sourceStart = maskedSrc.length - src.length;
      const openingEnd = sourceStart + src.match(/^\*+/)[0].length;
      const mask = maskedSrc.replace(cjkAfterPunctuationStrong, (match, cjk, index) => {
        if (index < openingEnd) return match;
        // An opening bracket/quote starts a nested span, including one whose
        // own closing delimiter needs this extension: (**한!**임).
        if (/[\p{Ps}\p{Pi}]/u.test(maskedSrc[index - 1])) return match;
        // A valid inner strong is an opening delimiter, e.g. (**한**).
        // Leave it alone even when the outer strong needs the CJK extension.
        const offset = index - sourceStart;
        const inner = Tokenizer.prototype.emStrong.call(this, src.slice(offset), maskedSrc, src[offset - 1]);
        if (inner?.type === 'strong') return match;
        return '**' + ' '.repeat(cjk.length);
      });
      return Tokenizer.prototype.emStrong.call(this, src, mask, prevChar);
    }
  }
});

export function renderMarkdown(value = '', { mermaid = false } = {}) {
  const marker = mermaid ? globalThis.crypto.randomUUID() : '';
  const renderer = new Renderer();
  if (mermaid) renderer.code = function(token) {
    const html = Renderer.prototype.code.call(this, token);
    return /^ {0,3}`{3,}[ \t]*mermaid(?:\s|$)/.test(token.raw)
      ? html.replace('<pre>', `<pre data-mermaid-code="${marker}">`) : html;
  };
  // Sanitize first, then wrap tables using DOM operations, including raw HTML tables.
  const template = document.createElement('template');
  template.innerHTML = DOMPurify.sanitize(markdown.parse(value || '', mermaid ? { renderer } : undefined));
  // Raw HTML cannot opt itself into diagram rendering. Only marked's fenced tokens can.
  for (const pre of template.content.querySelectorAll('pre[data-mermaid-code]')) {
    if (mermaid && pre.dataset.mermaidCode === marker) pre.dataset.mermaidCode = '';
    else pre.removeAttribute('data-mermaid-code');
  }
  for (const table of template.content.querySelectorAll('table')) {
    if (table.parentElement?.classList.contains('markdown-table-scroll')) continue;
    const wrapper = document.createElement('div');
    wrapper.className = 'markdown-table-scroll';
    table.replaceWith(wrapper);
    wrapper.append(table);
  }
  return template.innerHTML;
}
