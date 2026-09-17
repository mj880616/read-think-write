import { supabase } from '../runtime/supabase.js';
import { slugifyTopic } from '../utils/slug.js';

export async function listTopics() {
  const { data, error } = await supabase.from('rtw_topics').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createTopic(name) {
  const payload = { name: name.trim(), slug: slugifyTopic(name) };
  const { data, error } = await supabase.from('rtw_topics').insert(payload).select().single();
  if (error) throw error;
  return data;
}
