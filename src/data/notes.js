import { supabase } from '../runtime/supabase.js';

export async function listNotes({ resourceId = undefined, limit = 100 } = {}) {
  let query = supabase.from('rtw_notes').select('*').order('created_at', { ascending: false }).limit(limit);
  if (resourceId === null) query = query.is('resource_id', null);
  else if (resourceId) query = query.eq('resource_id', resourceId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function saveNote({ id, resource_id = null, body, note_type = null }) {
  const payload = { resource_id, body: body.trim(), note_type: note_type || null };
  if (id) {
    const { data, error } = await supabase.from('rtw_notes').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('rtw_notes').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteNote(id) {
  const { error } = await supabase.from('rtw_notes').delete().eq('id', id);
  if (error) throw error;
}
