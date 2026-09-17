import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseHTML } from 'npm:linkedom@0.18.12';
import { isBlockedHostname, isBlockedIpLiteral, parsePublicHttpUrl } from '../_shared/rtw-url-policy.js';

const SB = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SB, SERVICE, { auth: { persistSession: false } });

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 8_000;
const RESTRICTED_STATUSES = new Set([401, 403, 407, 429, 451]);
const ARTICLE_TYPES = new Set(['Article', 'NewsArticle', 'BlogPosting', 'Report', 'ScholarlyArticle']);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function userOf(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('로그인이 필요합니다.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('로그인 세션을 확인할 수 없습니다.');
  return data.user;
}

async function assertRtwOwner(userId: string) {
  const { data, error } = await admin
    .from('rtw_setup_state')
    .select('owner_user_id')
    .eq('id', 'owner')
    .maybeSingle();
  if (error) throw error;
  if (!data?.owner_user_id || data.owner_user_id !== userId) {
    throw new Error('이 개인 저장소의 소유자만 사용할 수 있습니다.');
  }
}

function looksLikeIpLiteral(hostname: string) {
  const host = hostname.replace(/^\[/, '').replace(/\]$/, '');
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

async function validateTarget(url: URL) {
  const hostname = url.hostname.toLowerCase();
  if (isBlockedHostname(hostname) || isBlockedIpLiteral(hostname)) {
    throw new Error('내부 네트워크 또는 허용되지 않은 주소는 가져올 수 없습니다.');
  }

  if (looksLikeIpLiteral(hostname)) return;

  const answers: string[] = [];
  const results = await Promise.allSettled([
    Deno.resolveDns(hostname, 'A'),
    Deno.resolveDns(hostname, 'AAAA')
  ]);
  for (const result of results) {
    if (result.status === 'fulfilled') answers.push(...result.value);
  }
  if (!answers.length) throw new Error('주소의 DNS 정보를 확인할 수 없습니다.');
  if (answers.some((address) => isBlockedIpLiteral(address))) {
    throw new Error('내부 네트워크로 연결되는 주소는 가져올 수 없습니다.');
  }
}

async function readLimitedBody(response: Response) {
  const length = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > MAX_BYTES) {
    throw new Error('페이지가 너무 커서 자동으로 가져올 수 없습니다.');
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BYTES) throw new Error('페이지가 너무 커서 자동으로 가져올 수 없습니다.');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function fetchHtml(start: URL) {
  let current = start;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await validateTarget(current);

    const response = await fetch(current.href, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'Accept': 'text/html,application/xhtml+xml;q=0.9',
        'User-Agent': 'ReadThinkWrite/1.0 (personal reading archive)'
      }
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      if (!location) throw new Error('리다이렉트 주소를 확인할 수 없습니다.');
      if (redirects === MAX_REDIRECTS) throw new Error('리다이렉트가 너무 많습니다.');
      current = parsePublicHttpUrl(new URL(location, current).href);
      continue;
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      await response.body?.cancel().catch(() => {});
      throw new Error('HTML 문서만 자동으로 가져올 수 있습니다.');
    }

    const html = await readLimitedBody(response);
    return {
      html,
      finalUrl: current,
      statusCode: response.status,
      restricted: RESTRICTED_STATUSES.has(response.status)
    };
  }
  throw new Error('페이지를 가져오지 못했습니다.');
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return '';
}

function meta(document: Document, key: string) {
  const element = document.querySelector(`meta[property="${key}"]`) || document.querySelector(`meta[name="${key}"]`);
  return cleanText(element?.getAttribute('content'));
}

function flattenJsonLd(value: unknown, output: Record<string, unknown>[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLd(item, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  const row = value as Record<string, unknown>;
  output.push(row);
  if (row['@graph']) flattenJsonLd(row['@graph'], output);
  return output;
}

function articleJsonLd(document: Document) {
  const rows: Record<string, unknown>[] = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      flattenJsonLd(JSON.parse(script.textContent || ''), rows);
    } catch {
      // Invalid publisher JSON-LD is ignored; ordinary metadata fallbacks remain available.
    }
  }
  return rows.find((row) => {
    const type = row['@type'];
    const types = Array.isArray(type) ? type : [type];
    return types.some((item) => typeof item === 'string' && ARTICLE_TYPES.has(item));
  }) || null;
}

function personNames(value: unknown): string {
  if (Array.isArray(value)) return value.map(personNames).filter(Boolean).join(', ');
  if (typeof value === 'string') return cleanText(value);
  if (value && typeof value === 'object') return cleanText((value as Record<string, unknown>).name);
  return '';
}

function publisherName(value: unknown) {
  if (typeof value === 'string') return cleanText(value);
  if (value && typeof value === 'object') return cleanText((value as Record<string, unknown>).name);
  return '';
}

function normalizeDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return '';
  const direct = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function canonicalUrl(document: Document, finalUrl: URL) {
  const href = cleanText(document.querySelector('link[rel="canonical"]')?.getAttribute('href'));
  if (!href) return finalUrl.href;
  try {
    const url = new URL(href, finalUrl);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : finalUrl.href;
  } catch {
    return finalUrl.href;
  }
}

function blockToMarkdown(element: Element) {
  const text = cleanText(element.textContent);
  if (!text) return '';
  const tag = element.tagName.toLowerCase();
  if (tag === 'h2') return `## ${text}`;
  if (tag === 'h3') return `### ${text}`;
  if (tag === 'li') return `- ${text}`;
  if (tag === 'blockquote') return `> ${text}`;
  return text;
}

function extractBody(document: Document, articleBody: unknown, restricted: boolean) {
  if (restricted) return '';
  const structuredBody = cleanText(articleBody);
  if (structuredBody.length >= 300) return structuredBody;

  const primary = document.querySelector('article, main, [role="main"]');
  if (!primary) return '';
  const clone = primary.cloneNode(true) as Element;
  for (const unwanted of clone.querySelectorAll('script,style,noscript,nav,footer,aside,form,button,svg')) {
    unwanted.remove();
  }

  const blocks = Array.from(clone.querySelectorAll('h2,h3,p,blockquote,li'))
    .map(blockToMarkdown)
    .filter(Boolean);
  const deduped = blocks.filter((block, index) => block !== blocks[index - 1]);
  const body = deduped.join('\n\n').trim();
  return body.length >= 300 ? body : '';
}

function extractResource(html: string, finalUrl: URL, restricted: boolean, statusCode: number) {
  const { document } = parseHTML(html);
  const ld = articleJsonLd(document);
  const ldRow = ld || {};

  const title = firstString(
    ldRow.headline,
    meta(document, 'og:title'),
    meta(document, 'twitter:title'),
    document.querySelector('title')?.textContent
  );
  const author = firstString(
    personNames(ldRow.author),
    meta(document, 'author'),
    meta(document, 'article:author')
  );
  const sourceName = firstString(
    publisherName(ldRow.publisher),
    meta(document, 'og:site_name'),
    meta(document, 'application-name'),
    finalUrl.hostname.replace(/^www\./, '')
  );
  const publishedOn = normalizeDate(firstString(
    ldRow.datePublished,
    meta(document, 'article:published_time'),
    meta(document, 'date'),
    meta(document, 'pubdate')
  ));
  const bodyMd = extractBody(document, ldRow.articleBody, restricted);
  const originalUrl = canonicalUrl(document, finalUrl);

  const warnings: string[] = [];
  if (restricted) warnings.push(`원문 서버가 접근 제한 상태(${statusCode})를 반환해 본문은 가져오지 않았습니다.`);
  if (!bodyMd) warnings.push('본문을 자동으로 읽지 못했습니다. 필요한 경우 직접 붙여넣으세요.');

  const metadataCount = [title, author, sourceName, publishedOn].filter(Boolean).length;
  if (!metadataCount) throw new Error('이 페이지에서 저장할 만한 글 정보를 찾지 못했습니다.');

  const status = bodyMd
    ? 'full'
    : title && metadataCount >= 2
      ? 'metadata_only'
      : 'partial';

  return {
    ok: true,
    status,
    resource: {
      title,
      original_title: '',
      author,
      source_name: sourceName,
      published_on: publishedOn,
      original_url: originalUrl,
      body_md: bodyMd
    },
    warnings
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const user = await userOf(req);
    await assertRtwOwner(user.id);
    const body = await req.json();
    const url = parsePublicHttpUrl(body?.url);
    const fetched = await fetchHtml(url);
    return json(extractResource(fetched.html, fetched.finalUrl, fetched.restricted, fetched.statusCode));
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
