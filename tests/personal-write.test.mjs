import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

// Exercise the checked-in handler offline; only the external Supabase boundary is fake.
const source = readFileSync(new URL('../supabase/functions/rtw-personal-write/index.ts', import.meta.url), 'utf8');
assert.match(source, /crypto\.subtle\.digest\('SHA-256'/, 'keys must be compared as fixed-size digests');
assert.match(source, /diff \|= .*\^/, 'all digest bytes must contribute, without early exit');
assert.doesNotMatch(source, /supplied\s*!==?\s*key|console\.(?:log|error)/, 'neither direct key comparison nor internal error logging is allowed');
assert.doesNotMatch(source, /\.(?:update|delete|upsert|rpc)\s*\(/, 'no new mutation except insert');
assert.doesNotMatch(source, /created_at\s*:/, 'publication date must never replace save time');
assert.match(source, /mj880616\/work.*drive-summary\/core\.mjs/, 'copied comparison needs its source');

const OWNER = '00000000-0000-4000-8000-000000000001';
const RESOURCE = '00000000-0000-4000-8000-000000000002';
const OTHER = '00000000-0000-4000-8000-000000000003';
const MISSING = '00000000-0000-4000-8000-000000000004';
const CREATED = '00000000-0000-4000-8000-000000000005';
const TEST_KEY = 'offline-fixture-only';
const scripts = stripTypeScriptTypes(source.replace(/^import .*createClient.*;\r?\n/m, ''));
function fixture({ key = TEST_KEY, ownerError = false, lookupError = false, insertError = false } = {}) {
  const calls = [];
  const admin = {
    from(table) {
      return {
        select(columns) {
          const filters = [];
          const query = {
            eq(name, value) { filters.push([name, value]); return query; },
            async single() {
              calls.push({ operation: 'select', table, columns, filters });
              if (table === 'rtw_personal_mode') {
                assert.deepEqual(filters, [['id', 'owner']]);
                return ownerError ? { data: null, error: new Error('private-owner-failure') } : { data: { owner_id: OWNER }, error: null };
              }
              assert.equal(table, 'rtw_resources');
              assert.equal(columns, 'id');
              const id = filters.find(([name]) => name === 'id')?.[1];
              const owner = filters.find(([name]) => name === 'owner_id')?.[1];
              // A foreign resource exists, but becomes invisible only if BOTH filters are present.
              const actualOwner = id === RESOURCE ? OWNER : id === OTHER ? OTHER : null;
              return { data: !lookupError && actualOwner && actualOwner === owner ? { id } : null, error: lookupError ? new Error('private-lookup-failure') : null };
            }
          };
          return query;
        },
        insert(row) {
          calls.push({ operation: 'insert', table, row: structuredClone(row) });
          return { select(columns) { return { async single() {
            return insertError ? { data: null, error: new Error('private-db-details') } : {
              data: columns === 'id,title' ? { id: CREATED, title: row.title } : { id: CREATED }, error: null
            };
          } }; } };
        }
      };
    }
  };
  let handler;
  const context = vm.createContext({
    createClient: () => admin, crypto, TextEncoder, Uint8Array, Request, Response, URL,
    Deno: { env: { get(name) { return name === 'RTW_PERSONAL_WRITE_KEY' ? key : 'offline-unused'; } }, serve(fn) { handler = fn; } }
  });
  vm.runInContext(`${scripts}\nglobalThis.rules = REQUEST_SCHEMAS;`, context);
  return {
    calls, rules: JSON.parse(JSON.stringify(context.rules)),
    async send(body, { method = 'POST', supplied = TEST_KEY, raw = false } = {}) {
      const response = await handler(new Request('https://offline.invalid/functions/v1/rtw-personal-write', {
        method, headers: supplied === null ? {} : { 'x-rtw-write-key': supplied },
        ...(['GET', 'OPTIONS'].includes(method) ? {} : { body: raw ? body : JSON.stringify(body) })
      }));
      return { status: response.status, body: method === 'OPTIONS' ? await response.text() : await response.json(), headers: response.headers };
    }
  };
}
const inserts = test => test.calls.filter(call => call.operation === 'insert');
const denied = async (body, options) => {
  const test = fixture(options);
  const result = await test.send(body);
  assert.equal(result.status, 400);
  assert.equal(inserts(test).length, 0, 'invalid input must never insert');
  assert.doesNotMatch(JSON.stringify(result.body), /private-|offline-fixture|SUPABASE_SERVICE/);
  return result;
};

for (const key of [undefined, '', '   ']) {
  const test = fixture({ key: key === undefined ? null : key });
  const result = await test.send({ action: 'resource', title: 'Fixture' }, { supplied: '' });
  assert.equal(result.status, 401, 'missing or blank configured key must fail closed');
  assert.equal(test.calls.length, 0);
}
for (const supplied of [null, '', 'wrong', `${TEST_KEY}x`, 'x'.repeat(4097)]) {
  const test = fixture();
  assert.equal((await test.send({ action: 'resource', title: 'Fixture' }, { supplied })).status, 401);
  assert.equal(test.calls.length, 0, 'authentication must precede database access');
}
const cases = {
  resource: { action: 'resource', title: '  Fixture  ', original_title: 'Original', author: 'Author', source_name: 'Source', published_on: '2024-02-29', original_url: 'https://example.com/article', body_md: '# Fixture' },
  note: { action: 'note', body: '  Fixture  ', note_type: '생각', resource_id: RESOURCE },
  question: { action: 'question', body: '  Fixture  ', current_thought: 'Fixture' }
};
const expectedColumns = {
  resource: ['author', 'body_md', 'original_title', 'original_url', 'owner_id', 'published_on', 'source_name', 'title', 'visibility'],
  note: ['body', 'note_type', 'owner_id', 'resource_id'],
  question: ['body', 'current_thought', 'owner_id', 'status']
};
for (const [action, input] of Object.entries(cases)) {
  const test = fixture();
  const result = await test.send(input);
  assert.equal(result.status, 200);
  const [write] = inserts(test);
  assert.equal(write.table, { resource: 'rtw_resources', note: 'rtw_notes', question: 'rtw_questions' }[action]);
  assert.deepEqual(Object.keys(write.row).sort(), expectedColumns[action]);
  assert.equal(write.row.owner_id, OWNER);
  assert.deepEqual(result.body, { ok: true, [action]: action === 'resource' ? { id: CREATED, title: 'Fixture' } : { id: CREATED } });
  if (action === 'question') assert.equal(test.calls.filter(call => call.table === 'rtw_resources').length, 0);
  if (action === 'note') assert.ok(test.calls.findIndex(call => call.table === 'rtw_resources') < test.calls.findIndex(call => call.operation === 'insert'));
}
// Reproduce the GPT request offline with thousands of Korean characters and line breaks.
const gptBody = '코모 감독은 “우리만의 정체성”을 이야기했다.\n\n마음이 이끄는 선택이었다.\n'.repeat(120);
assert.ok(Array.from(gptBody).length > 3000);
const gptRequest = {
  action: 'resource', title: '파브레가스: “코모는 마음이 이끄는 선택이었다. 이후 우리만의 정체성을 만들었다”',
  author: '알레산드로 라 가투타', published_on: '2026-10-04', body: gptBody
};
const gptRejected = fixture();
const gptFailure = await gptRejected.send(gptRequest);
assert.equal(gptFailure.status, 400);
assert.equal(gptRejected.calls.length, 0, 'wrong field must fail before any database access');
console.log('GPT request reproduction:', JSON.stringify(gptFailure.body));
assert.deepEqual(gptFailure.body, { error: 'invalid_input', field: 'body', reason: 'unknown_field' });
const { body: correctedBody, ...gptMetadata } = gptRequest;
const gptAccepted = fixture();
assert.equal((await gptAccepted.send({ ...gptMetadata, body_md: correctedBody })).status, 200);
assert.equal(inserts(gptAccepted).length, 1);
assert.equal(inserts(gptAccepted)[0].row.body_md, gptBody, 'quotes and newlines must survive unchanged');
for (const [input, expected] of [
  [{ action: 'resource' }, { error: 'invalid_input', field: 'title', reason: 'required' }],
  [{ ...gptMetadata, title: 123 }, { error: 'invalid_input', field: 'title', reason: 'type' }],
  [{ ...gptMetadata, title: ' ' }, { error: 'invalid_input', field: 'title', reason: 'pattern' }],
  [{ ...gptMetadata, published_on: '2026-02-30' }, { error: 'invalid_input', field: 'published_on', reason: 'format' }],
  [{ ...gptMetadata, body_md: '가'.repeat(60001) }, { error: 'body_md_too_long', field: 'body_md', reason: 'max_length' }],
  [{ ...gptMetadata, ['private-input-key']: 'private-input-value' }, { error: 'invalid_input', field: '$request', reason: 'unknown_field' }],
  [null, { error: 'invalid_input', field: '$request', reason: 'type' }],
  [{ action: 'private-action-value' }, { error: 'unsupported_action', field: 'action', reason: 'enum' }]
]) assert.deepEqual((await denied(input)).body, expected);
assert.deepEqual((await fixture().send('{', { raw: true })).body, { error: 'invalid_input', field: '$request', reason: 'invalid_json' });
assert.deepEqual((await fixture().send(gptRequest, { supplied: 'wrong' })).body, { error: 'unauthorized' });

for (const action of ['note']) {
  const foreign = await denied({ ...cases[action], resource_id: OTHER });
  const missing = await denied({ ...cases[action], resource_id: MISSING });
  const unavailable = await denied(cases[action], { lookupError: true });
  assert.deepEqual(foreign.body, missing.body, 'foreign and absent resource must be indistinguishable');
  assert.deepEqual(foreign.body, unavailable.body, 'lookup errors must not expose resource details');
  await denied({ ...cases[action], resource_id: 'invalid-id' });
  for (const resource_id of [null, undefined]) {
    const test = fixture();
    assert.equal((await test.send({ action, body: 'Fixture', resource_id })).status, 200);
    assert.equal(test.calls.filter(call => call.table === 'rtw_resources').length, 0);
  }
}
// Questions have no stored resource link: reject even a valid owner resource or null.
for (const resource_id of [RESOURCE, OTHER, MISSING, 'invalid-id', '', null]) {
  const test = fixture();
  const result = await test.send({ ...cases.question, resource_id });
  assert.equal(result.status, 400, 'question resource_id must be rejected, never silently discarded');
  assert.equal(test.calls.length, 0, 'rejected question fields must not reach the database');
}
for (const action of ['update', 'delete', 'get', 'list', '', 'RESOURCE']) await denied({ action });
for (const input of [null, [], 'bad', {}, { action: 'resource' }, { action: 'resource', title: '   ' }, { action: 'note', body: '' }, { action: 'question', body: ' ' }, { action: 'resource', title: 'Fixture', owner_id: OTHER }]) await denied(input);
const malformed = fixture();
assert.equal((await malformed.send('{', { raw: true })).status, 400);
assert.equal(inserts(malformed).length, 0);

const limits = { title: 500, original_title: 500, author: 300, source_name: 300, original_url: 2048, body_md: 60000, body: 60000, current_thought: 60000, published_on: 10, note_type: 30, resource_id: 36 };
for (const [action, fields] of Object.entries({ resource: ['title', 'original_title', 'author', 'source_name', 'original_url', 'body_md'], note: ['body', 'note_type'], question: ['body', 'current_thought'] })) {
  for (const field of fields) {
    const value = field === 'original_url' ? 'https://example.com/' + 'a'.repeat(limits[field] - 20) : 'a'.repeat(limits[field]);
    // URI prefix has 20 characters; all approved bounds must be inclusive.
    const atLimit = field === 'original_url' ? 'https://example.com/' + 'a'.repeat(limits[field] - 'https://example.com/'.length) : value;
    const test = fixture();
    assert.equal((await test.send({ ...cases[action], [field]: atLimit })).status, 200, `${action}.${field}: limit is inclusive`);
    await denied({ ...cases[action], [field]: atLimit + 'a' });
    await denied({ ...cases[action], [field]: { nested: 'not-a-string' } });
  }
}
const unicode = fixture();
assert.equal((await unicode.send({ action: 'resource', title: '😀'.repeat(500) })).status, 200, 'OpenAPI maxLength counts Unicode code points');
await denied({ action: 'resource', title: '😀'.repeat(501) });
for (const published_on of ['2023-02-29', '2024-02-30', '2024-04-31', '2024-13-01', '2024-00-01', '2024-01-00', '0000-01-01', '2024-1-01', '2024-01-01T00:00:00Z', 20240101]) await denied({ ...cases.resource, published_on });
for (const published_on of ['2024-02-29', '2000-02-29', '2026-10-03', null]) assert.equal((await fixture().send({ ...cases.resource, published_on })).status, 200);
for (const original_url of ['javascript:alert(1)', 'file:///tmp/example', 'ftp://example.com', 'data:text/plain,x', '//example.com', 'https://', 'https://example.com/a b']) await denied({ ...cases.resource, original_url });
for (const original_url of ['http://example.com/', 'https://example.com/a?q=x', null]) assert.equal((await fixture().send({ ...cases.resource, original_url })).status, 200);
for (const failure of [{ ownerError: true }, { insertError: true }]) {
  const test = fixture(failure);
  const result = await test.send(cases.resource);
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: 'write_failed' });
  assert.equal(inserts(test).length, failure.ownerError ? 0 : 1);
}
const preflight = await fixture({ key: '' }).send(null, { method: 'OPTIONS' });
assert.equal(preflight.status, 200);
assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://mj880616.github.io');
assert.equal(preflight.headers.get('Access-Control-Allow-Headers'), 'authorization, x-client-info, apikey, content-type');
assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'POST,OPTIONS');
for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
  const test = fixture();
  assert.equal((await test.send({}, { method })).status, 405);
  assert.equal(test.calls.length, 0);
}

// JSON notation is also YAML 1.2: use the standard parser without a new dependency.
const spec = JSON.parse(readFileSync(new URL('../docs/chatgpt/rtw-personal-write.openapi.yaml', import.meta.url), 'utf8'));
assert.equal(spec.openapi, '3.1.0');
assert.deepEqual(spec.servers, [{ url: 'https://xmlkxfjeagycwttklxjw.supabase.co/functions/v1' }]);
assert.deepEqual(Object.keys(spec.paths), ['/rtw-personal-write']);
assert.deepEqual(Object.keys(spec.paths['/rtw-personal-write']), ['post']);
assert.deepEqual(spec.components.securitySchemes.PersonalWriteKey, { type: 'apiKey', in: 'header', name: 'x-rtw-write-key' });
const operation = spec.paths['/rtw-personal-write'].post;
assert.deepEqual(operation.security, [{ PersonalWriteKey: [] }]);
assert.equal(operation['x-openai-isConsequential'], true);
assert.equal(operation.requestBody.required, true);
assert.equal(operation.requestBody.content['application/json'].schema.type, 'object', 'Action request must expose a top-level object');
assert.deepEqual(Object.keys(operation.requestBody.content['application/json'].schema.properties).sort(), ['action', 'author', 'body', 'body_md', 'current_thought', 'note_type', 'original_title', 'original_url', 'published_on', 'resource_id', 'source_name', 'title']);
assert.deepEqual(operation.requestBody.content['application/json'].schema.required, ['action']);
assert.deepEqual(operation.requestBody.content['application/json'].schema.oneOf, ['resource', 'note', 'question'].map(action => ({ $ref: `#/components/schemas/${action}` })));
const rules = fixture().rules;
const mergedProperties = Object.assign({}, ...Object.values(rules).map(schema => schema.properties));
mergedProperties.action = { type: 'string', enum: ['resource', 'note', 'question'] };
assert.deepEqual(contract(operation.requestBody.content['application/json'].schema).properties, mergedProperties, 'top-level Action fields must also agree with executable constraints');
function contract(schema) {
  // Compare executable validation constraints, independently of documentation prose.
  const { description, example, ...rule } = schema;
  if (rule.properties) rule.properties = Object.fromEntries(Object.entries(rule.properties).map(([name, value]) => [name, contract(value)]));
  return rule;
}
assert.equal(Object.hasOwn(spec.components.schemas.resource.properties, 'body'), false, 'GPT body request violates the resource schema');
assert.deepEqual(spec.components.schemas.resource.required, ['action', 'title'], 'resource body_md remains optional');
assert.equal((await fixture().send(operation.requestBody.content['application/json'].example)).status, 200, 'top-level GPT example must work');
const diagnosticSchema = operation.responses['400'].content['application/json'].schema;
for (const body of [gptFailure.body, (await denied({ action: 'resource' })).body, (await denied({ ...gptMetadata, ['private-key']: 'private-value' })).body]) {
  assert.ok(Object.keys(body).every(field => Object.hasOwn(diagnosticSchema.properties, field)));
  assert.ok(diagnosticSchema.properties.field.enum.includes(body.field));
  assert.ok(diagnosticSchema.properties.reason.enum.includes(body.reason));
}
assert.deepEqual(Object.keys(operation.responses['401'].content['application/json'].schema.properties), ['error']);
assert.equal(Object.hasOwn(rules.question.properties, 'resource_id'), false);
assert.equal(Object.hasOwn(spec.components.schemas.question.properties, 'resource_id'), false);
assert.equal(Object.hasOwn(spec.components.schemas.note.properties.note_type, 'enum'), false, 'DB permits user-defined labels, not a fixed enum');
for (const action of ['resource', 'note', 'question']) {
  const schema = spec.components.schemas[action];
  assert.deepEqual(contract(schema), rules[action], `${action}: names, required fields and bounds must match handler`);
  for (const [field, rule] of Object.entries(schema.properties)) if (field !== 'action') assert.equal(rule.maxLength, limits[field]);
  assert.equal((await fixture().send(schema.example)).status, 200, `${action}: example must be accepted by real handler`);
}
console.log('personal-write: offline handler security, input bounds, formats, owner checks and OpenAPI contract passed');
