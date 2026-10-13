import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/+esm';

let library;
let sequence = 0;
const processed = new WeakSet();

function withTimeout(task, ms) {
  let timer;
  return Promise.race([
    Promise.resolve().then(task),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Mermaid timeout')), ms); })
  ]).finally(() => clearTimeout(timer));
}

function loadMermaid() {
  if (!library) {
    library = withTimeout(() => import('https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.esm.min.mjs'), 20_000)
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          htmlLabels: false,
          flowchart: { htmlLabels: false },
          theme: 'default',
          suppressErrorRendering: true,
          maxTextSize: 50_000,
          maxEdges: 200,
          // Article directives/frontmatter must not override the security or palette.
          secure: ['secure', 'securityLevel', 'startOnLoad', 'suppressErrorRendering',
            'maxTextSize', 'maxEdges', 'htmlLabels', 'flowchart', 'theme', 'themeVariables', 'themeCSS']
        });
        return mermaid;
      });
  }
  return library;
}

export async function renderMermaidBlocks(article) {
  const blocks = [...(article?.querySelectorAll('pre[data-mermaid-code] > code.language-mermaid') || [])]
    .filter(code => !processed.has(code));
  if (!blocks.length) return;
  blocks.forEach(code => processed.add(code));
  let mermaid;
  try { mermaid = await loadMermaid(); } catch { /* Each original block receives a notice below. */ }
  for (const code of blocks) {
    const pre = code.parentElement;
    if (!article.isConnected || !article.contains(pre)) continue;
    const host = document.createElement('div');
    host.className = 'mermaid-render-host';
    host.setAttribute('aria-hidden', 'true');
    // Mermaid measures text; detached/display:none containers have no layout.
    document.body.append(host);
    try {
      if (!mermaid) throw new Error('Mermaid unavailable');
      if (code.textContent.length > 50_000) throw new Error('Mermaid source too large');
      const { svg } = await withTimeout(() => mermaid.render(`rtw-mermaid-${++sequence}`, code.textContent, host), 20_000);
      const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true } });
      const parsed = new DOMParser().parseFromString(clean, 'image/svg+xml').documentElement;
      if (parsed.localName !== 'svg') throw new Error('Invalid SVG');
      // A fixed light surface stays legible in dark mode. Image embedding also
      // isolates SVG text from the article's existing bookmark offsets.
      const image = document.createElement('img');
      image.alt = [parsed.querySelector('title')?.textContent, parsed.querySelector('desc')?.textContent]
        .filter(Boolean).join(' — ') || 'Mermaid 도식';
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;
      const width = Number(parsed.getAttribute('viewBox')?.trim().split(/[\s,]+/)[2]);
      if (Number.isFinite(width) && width > 0) image.style.width = `${Math.ceil(width)}px`;
      const diagram = document.createElement('div');
      diagram.className = 'mermaid-diagram';
      diagram.tabIndex = 0;
      diagram.setAttribute('data-swipe-ignore', '');
      diagram.setAttribute('role', 'img');
      diagram.setAttribute('aria-label', `${image.alt} (가로 스크롤 가능)`);
      diagram.append(image);
      await withTimeout(() => image.decode(), 20_000);
      if (!article.isConnected || !article.contains(pre)) continue;
      pre.after(diagram);
      // Keep the exact source text for bookmark Range/textContent compatibility.
      pre.hidden = true;
    } catch {
      if (article.isConnected && article.contains(pre)) {
        // CSS-generated copy adds no text to bookmark offsets or contexts.
        pre.dataset.mermaidError = '도식을 표시하지 못해 원본 코드를 보여드립니다.';
        pre.setAttribute('aria-label', pre.dataset.mermaidError);
      }
    } finally { host.remove(); }
  }
}
