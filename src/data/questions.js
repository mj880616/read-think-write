import { supabase } from '../runtime/supabase.js';

export async function listQuestions() {
  const { data, error } = await supabase.from('rtw_questions').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createQuestion(body) {
  const { data, error } = await supabase.from('rtw_questions').insert({ body: body.trim() }).select().single();
  if (error) throw error;
  return data;
}

export async function updateQuestion(id, patch) {
  const { data, error } = await supabase.from('rtw_questions').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
