import { supabase } from '../runtime/supabase.js';

export async function listResources({ limit = 100 } = {}) {
  const { data, error } = await supabase.from('rtw_resources')
    .select('*')
    .order('published_on', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getResource(id) {
  const { data, error } = await supabase.from('rtw_resources').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function saveResource(input) {
  const payload = {
    title: input.title.trim(),
    original_title: input.original_title?.trim() || null,
    author: input.author?.trim() || null,
    source_name: input.source_name?.trim() || null,
    published_on: input.published_on || null,
    original_url: input.original_url?.trim() || null,
    body_md: input.body_md || '',
    visibility: input.visibility === 'public' ? 'public' : 'private',
  };
  if (input.id) {
    const { data, error } = await supabase.from('rtw_resources').update(payload).eq('id', input.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('rtw_resources').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteResource(id) {
  const { error } = await supabase.from('rtw_resources').delete().eq('id', id);
  if (error) throw error;
}
