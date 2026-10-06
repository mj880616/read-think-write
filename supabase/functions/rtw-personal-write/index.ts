import { createClient } from 'npm:@supabase/supabase-js@2';

const SB = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SB, SERVICE, { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': 'https://mj880616.github.io', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

// Adapted from mj880616/work, supabase/functions/drive-summary/core.mjs
// (origin/main 0d0ea584cfdcc92985ba11de29bd30d0a3666696, file commit 40ee5078).
// SHA-256 fixes both buffers at 32 bytes. Visit every byte without early exit.
async function secretMatches(given: string, expected: string) {
  if (!expected.trim() || !given || given.length > 4096) return false;
  const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

type FieldRule = {
  type: 'string' | readonly ['string', 'null'];
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  format?: 'date' | 'uri' | 'uuid';
  enum?: readonly string[];
};
type InputSchema = {
  type: 'object';
  additionalProperties: false;
  required: readonly string[];
  properties: Record<string, FieldRule>;
};
// These executable constraints are checked against the OpenAPI document by npm test.
const REQUEST_SCHEMAS = {
  resource: {
    type: 'object', additionalProperties: false, required: ['action', 'title'],
    properties: {
      action: { type: 'string', enum: ['resource'] },
      title: { type: 'string', minLength: 1, maxLength: 500, pattern: '\\S' },
      original_title: { type: ['string', 'null'], maxLength: 500 },
      author: { type: ['string', 'null'], maxLength: 300 },
      source_name: { type: ['string', 'null'], maxLength: 300 },
      published_on: { type: ['string', 'null'], minLength: 10, maxLength: 10, pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$', format: 'date' },
      original_url: { type: ['string', 'null'], minLength: 1, maxLength: 2048, pattern: '^[hH][tT][tT][pP][sS]?://', format: 'uri' },
      body_md: { type: ['string', 'null'], maxLength: 60000 }
    }
  },
  note: {
    type: 'object', additionalProperties: false, required: ['action', 'body'],
    properties: {
      action: { type: 'string', enum: ['note'] },
      body: { type: 'string', minLength: 1, maxLength: 60000, pattern: '\\S' },
      note_type: { type: ['string', 'null'], maxLength: 30 },
      resource_id: { type: ['string', 'null'], minLength: 36, maxLength: 36, format: 'uuid' }
    }
  },
  question: {
    type: 'object', additionalProperties: false, required: ['action', 'body'],
    properties: {
      action: { type: 'string', enum: ['question'] },
      body: { type: 'string', minLength: 1, maxLength: 60000, pattern: '\\S' },
      current_thought: { type: ['string', 'null'], maxLength: 60000 }
    }
  }
} satisfies Record<string, InputSchema>;

class InputError extends Error {
  readonly field?: string;
  readonly reason?: string;
  constructor(message: string, field?: string, reason?: string) {
    super(message); this.field = field; this.reason = reason;
  }
}
// Only schema-defined names may be returned; arbitrary caller keys are input data.
const INPUT_FIELDS = new Set(Object.values(REQUEST_SCHEMAS).flatMap(schema => Object.keys(schema.properties)));
function inputError(field: string, reason: string, message = 'invalid_input') {
  return new InputError(message, INPUT_FIELDS.has(field) ? field : '$request', reason);
}
function validDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number(value.slice(0, 4)) > 0 && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validUrl(value: string) {
  try {
    const url = new URL(value);
    return !/\s/.test(value) && (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch { return false; }
}
function validateInput(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw inputError('$request', 'type');
  const input = value as Record<string, unknown>;
  if (typeof input.action !== 'string' || !Object.hasOwn(REQUEST_SCHEMAS, input.action)) throw inputError('action', 'enum', 'unsupported_action');
  const schema: InputSchema = REQUEST_SCHEMAS[input.action as keyof typeof REQUEST_SCHEMAS];
  const unknownField = Object.keys(input).find(field => !Object.hasOwn(schema.properties, field));
  if (unknownField !== undefined) throw inputError(unknownField, 'unknown_field');
  const missingField = schema.required.find(field => !Object.hasOwn(input, field));
  if (missingField !== undefined) throw inputError(missingField, 'required');
  for (const [field, rule] of Object.entries(schema.properties)) {
    const fieldValue = input[field];
    if (fieldValue === undefined) continue;
    if (fieldValue === null && Array.isArray(rule.type)) continue;
    if (typeof fieldValue !== 'string') throw inputError(field, 'type');
    const length = Array.from(fieldValue).length;
    if (rule.maxLength !== undefined && length > rule.maxLength) throw inputError(field, 'max_length', `${field}_too_long`);
    if (rule.minLength !== undefined && length < rule.minLength) throw inputError(field, 'min_length');
    if (rule.enum && !rule.enum.includes(fieldValue)) throw inputError(field, 'enum');
    if (rule.pattern && !new RegExp(rule.pattern).test(fieldValue)) throw inputError(field, 'pattern');
    if (rule.format === 'date' && !validDate(fieldValue)) throw inputError(field, 'format');
    if (rule.format === 'uri' && !validUrl(fieldValue)) throw inputError(field, 'format');
    if (rule.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fieldValue)) throw inputError(field, 'format');
  }
  return input as Record<string, string | null>;
}
async function ownerId() {
  const { data, error } = await admin.from('rtw_personal_mode').select('owner_id').eq('id', 'owner').single();
  if (error || !data?.owner_id) throw new Error('owner_unavailable');
  return data.owner_id;
}
async function checkResourceOwner(resourceId: string, owner: string) {
  // Service role bypasses RLS: both filters are mandatory before any referenced insert.
  const { data, error } = await admin.from('rtw_resources').select('id').eq('id', resourceId).eq('owner_id', owner).single();
  if (error || !data) throw inputError('resource_id', 'invalid_reference', 'invalid_resource');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const key = Deno.env.get('RTW_PERSONAL_WRITE_KEY') || '';
    const supplied = req.headers.get('x-rtw-write-key') || '';
    if (!await secretMatches(supplied, key)) return json({ error: 'unauthorized' }, 401);
    let raw: unknown;
    try { raw = await req.json(); } catch { throw inputError('$request', 'invalid_json'); }
    const input = validateInput(raw);
    const owner = await ownerId();
    if (input.action === 'note' && input.resource_id) {
      await checkResourceOwner(input.resource_id, owner);
    }
    if (input.action === 'resource') {
      const row = {
        owner_id: owner, title: input.title!.trim(), original_title: input.original_title?.trim() || null,
        author: input.author?.trim() || null, source_name: input.source_name?.trim() || null,
        published_on: input.published_on || null, original_url: input.original_url?.trim() || null,
        body_md: input.body_md || '', visibility: 'private'
      };
      const { data, error } = await admin.from('rtw_resources').insert(row).select('id,title').single();
      if (error || !data) throw new Error('insert_failed');
      return json({ ok: true, resource: { id: data.id, title: data.title } });
    }
    if (input.action === 'note') {
      const { data, error } = await admin.from('rtw_notes').insert({
        owner_id: owner, body: input.body!.trim(), note_type: input.note_type || '생각', resource_id: input.resource_id || null
      }).select('id').single();
      if (error || !data) throw new Error('insert_failed');
      return json({ ok: true, note: { id: data.id } });
    }
    if (input.action === 'question') {
      const { data, error } = await admin.from('rtw_questions').insert({
        owner_id: owner, body: input.body!.trim(), current_thought: input.current_thought || '', status: 'open'
      }).select('id').single();
      if (error || !data) throw new Error('insert_failed');
      return json({ ok: true, question: { id: data.id } });
    }
    return json({ error: 'unsupported_action' }, 400);
  } catch (error) {
    return error instanceof InputError ? json({ error: error.message, field: error.field, reason: error.reason }, 400) : json({ error: 'write_failed' }, 500);
  }
});
