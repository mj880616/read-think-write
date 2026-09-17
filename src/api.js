import { supabase } from './supabase.js';
import { isRememberedLoginValid } from './model.js';

const REMEMBER_LOGIN_KEY = 'rtw_remember_until_v1';

function fail(error) { if (error) throw error; }

async function failFunction(error) {
  if (!error) return;
  let message = error.message || '서버 요청에 실패했습니다.';
  try {
    const payload = await error.context?.clone?.().json?.();
    if (payload?.error) message = payload.error;
  } catch {
    // Keep the SDK error message when the response has no JSON body.
  }
  throw new Error(message);
}

function clearRememberedLogin() {
  localStorage.removeItem(REMEMBER_LOGIN_KEY);
}

export async function currentUser() {
  const rememberedUntil = localStorage.getItem(REMEMBER_LOGIN_KEY);
  if (!isRememberedLoginValid(rememberedUntil)) {
    clearRememberedLogin();
    await supabase.auth.signOut().catch(() => {});
    return null;
  }

  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== 'AuthSessionMissingError') throw error;
  if (!data?.user) clearRememberedLogin();
  return data?.user ?? null;
}

export async function signOut() {
  clearRememberedLogin();
  const { error } = await supabase.auth.signOut();
  fail(error);
}

export async function listResources() {
  const { data, error } = await supabase
    .from('rtw_resources')
    .select('*')
    .order('published_on', { ascending: false })
    .order('created_at', { ascending: false });
  fail(error);
  return data ?? [];
}

export async function getResource(id) {
  const { data, error } = await supabase.from('rtw_resources').select('*').eq('id', id).single();
  fail(error);
  return data;
}

export async function importResourceUrl(url) {
  const clean = String(url ?? '').trim();
  if (!clean) throw new Error('가져올 URL을 입력하세요.');
  const { data, error } = await supabase.functions.invoke('rtw-url-import', {
    body: { url: clean }
  });
  await failFunction(error);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function analyzeResource(resourceId, mode = 'read') {
  const cleanId = String(resourceId ?? '').trim();
  if (!cleanId) throw new Error('읽을 자료를 선택하세요.');
  const cleanMode = mode === 'expand' ? 'expand' : 'read';
  const { data, error } = await supabase.functions.invoke('rtw-ai-read', {
    body: { resource_id: cleanId, mode: cleanMode }
  });
  await failFunction(error);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function createResource(input, userId) {
  const row = {
    owner_id: userId,
    title: input.title.trim(),
    original_title: input.original_title?.trim() || null,
    author: input.author?.trim() || null,
    source_name: input.source_name?.trim() || null,
    published_on: input.published_on || null,
    original_url: input.original_url?.trim() || null,
    body_md: input.body_md || '',
    visibility: 'private'
  };
  const { data, error } = await supabase.from('rtw_resources').insert(row).select().single();
  fail(error);
  return data;
}

export async function updateResource(id, input) {
  const row = {
    title: input.title.trim(),
    original_title: input.original_title?.trim() || null,
    author: input.author?.trim() || null,
    source_name: input.source_name?.trim() || null,
    published_on: input.published_on || null,
    original_url: input.original_url?.trim() || null,
    body_md: input.body_md || '',
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase.from('rtw_resources').update(row).eq('id', id).select().single();
  fail(error);
  return data;
}

export async function listNotes(resourceId = undefined) {
  let query = supabase.from('rtw_notes').select('*').order('updated_at', { ascending: false });
  query = resourceId === null
    ? query.is('resource_id', null)
    : resourceId
      ? query.eq('resource_id', resourceId)
      : query;
  const { data, error } = await query;
  fail(error);
  return data ?? [];
}

export async function createNote({ body, note_type = null, resource_id = null }, userId) {
  const { data, error } = await supabase
    .from('rtw_notes')
    .insert({ owner_id: userId, body: body.trim(), note_type: note_type || null, resource_id })
    .select()
    .single();
  fail(error);
  return data;
}

export async function updateNote(id, body) {
  const { data, error } = await supabase
    .from('rtw_notes')
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  fail(error);
  return data;
}

export async function deleteNote(id) {
  const { error } = await supabase.from('rtw_notes').delete().eq('id', id);
  fail(error);
}

export async function listTopics() {
  const { data, error } = await supabase.from('rtw_topics').select('*').order('name');
  fail(error);
  return data ?? [];
}

export async function createTopic(name, userId) {
  const clean = name.trim();
  const slug = clean.toLocaleLowerCase('ko-KR').replace(/\s+/g, '-').replace(/[^a-z0-9가-힣-]/g, '');
  const { data, error } = await supabase
    .from('rtw_topics')
    .insert({ owner_id: userId, name: clean, slug, summary: '' })
    .select()
    .single();
  fail(error);
  return data;
}

export async function listQuestions() {
  const { data, error } = await supabase.from('rtw_questions').select('*').order('updated_at', { ascending: false });
  fail(error);
  return data ?? [];
}

export async function createQuestion(body, userId) {
  const { data, error } = await supabase
    .from('rtw_questions')
    .insert({ owner_id: userId, body: body.trim(), current_thought: '', status: 'open' })
    .select()
    .single();
  fail(error);
  return data;
}

export async function listRelations(sourceType, sourceId) {
  const { data, error } = await supabase
    .from('rtw_relations')
    .select('*')
    .eq('source_type', sourceType)
    .eq('source_id', sourceId);
  fail(error);
  return data ?? [];
}

export async function listRelationsByTarget(targetType, targetId) {
  const { data, error } = await supabase
    .from('rtw_relations')
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: false });
  fail(error);
  return data ?? [];
}

export async function addRelation({ source_type, source_id, target_type, target_id }, userId) {
  const { data, error } = await supabase
    .from('rtw_relations')
    .upsert(
      { owner_id: userId, source_type, source_id, target_type, target_id, relation_type: 'related' },
      { onConflict: 'owner_id,source_type,source_id,target_type,target_id,relation_type' }
    )
    .select()
    .single();
  fail(error);
  return data;
}

export async function removeRelation(id) {
  const { error } = await supabase.from('rtw_relations').delete().eq('id', id);
  fail(error);
}

export async function loadSearchCorpus() {
  const [resources, notes, topics, questions] = await Promise.all([
    listResources(),
    listNotes(),
    listTopics(),
    listQuestions()
  ]);
  return { resources, notes, topics, questions };
}
