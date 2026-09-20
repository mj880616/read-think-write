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

export async function isPersonalOwner() {
  const { data, error } = await supabase.rpc('rtw_is_personal_owner');
  fail(error);
  return data === true;
}

export async function claimPersonalOwner() {
  const { data, error } = await supabase.functions.invoke('rtw-claim-personal-owner', { body: {} });
  await failFunction(error);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function deleteAccount() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  fail(sessionError);
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('로그인 세션을 확인할 수 없습니다.');
  const response = await fetch(`${supabase.supabaseUrl}/functions/v1/rtw-delete-account`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) throw new Error(payload?.error || '계정을 삭제하지 못했습니다.');
  clearRememberedLogin();
  await supabase.auth.signOut().catch(() => {});
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
  const { data, error } = await supabase.from('rtw_resources').select('*').eq('id', id).maybeSingle();
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

export async function listNoteTypes() {
  const { data, error } = await supabase.from('rtw_note_types').select('*').order('created_at');
  fail(error);
  return data ?? [];
}

export async function createNoteType(name, userId) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('유형 이름을 입력하세요.');
  if (clean.length > 30) throw new Error('유형 이름은 30자 이내로 입력하세요.');
  const { data, error } = await supabase.from('rtw_note_types').insert({ owner_id: userId, name: clean }).select().single();
  fail(error);
  return data;
}

export async function renameNoteType(id, name) {
  const clean = String(name || '').trim();
  if (!clean || clean.length > 30) throw new Error('유형 이름은 1~30자로 입력하세요.');
  const { data, error } = await supabase.rpc('rtw_rename_note_type', { p_type_id: id, p_new_name: clean });
  fail(error);
  return data;
}

export async function deleteNoteType(id) {
  const { error } = await supabase.rpc('rtw_delete_note_type_if_unused', { p_type_id: id });
  fail(error);
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

export async function updateNote(id, body, noteType) {
  const { data, error } = await supabase
    .from('rtw_notes')
    .update({ body: body.trim(), note_type: noteType || null, updated_at: new Date().toISOString() })
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


export async function listBookmarks(resourceId = undefined) {
  let query = supabase.from('rtw_bookmarks').select('*').order('created_at', { ascending: false });
  if (resourceId) query = query.eq('resource_id', resourceId);
  const { data, error } = await query;
  fail(error);
  return data ?? [];
}

export async function createBookmark(input, userId) {
  const row = { owner_id: userId, resource_id: input.resource_id, bookmark_type: input.bookmark_type, selected_text: input.selected_text || null, context_before: input.context_before || null, context_after: input.context_after || null, start_offset: input.start_offset ?? null, end_offset: input.end_offset ?? null, note: input.note?.trim() || null };
  const { data, error } = await supabase.from('rtw_bookmarks').insert(row).select().single();
  fail(error);
  return data;
}

export async function deleteBookmark(id) {
  const { error } = await supabase.from('rtw_bookmarks').delete().eq('id', id);
  fail(error);
}

export async function updateBookmarkNote(id, note) {
  const { data, error } = await supabase.from('rtw_bookmarks').update({ note: note?.trim() || null, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  fail(error);
  return data;
}
