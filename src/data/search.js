import { supabase } from '../runtime/supabase.js';

export async function searchAll(term) {
  const q = String(term ?? '').trim();
  if (!q) return { resources: [], notes: [], topics: [], questions: [] };
  const pattern = `%${q.replace(/[%_]/g, '\\$&')}%`;
  const [resources, notes, topics, questions] = await Promise.all([
    supabase.from('rtw_resources').select('id,title,author,source_name,published_on').ilike('title', pattern).limit(30),
    supabase.from('rtw_notes').select('id,resource_id,body,note_type,created_at').ilike('body', pattern).limit(30),
    supabase.from('rtw_topics').select('*').or(`name.ilike.${pattern},summary.ilike.${pattern}`).limit(30),
    supabase.from('rtw_questions').select('*').or(`body.ilike.${pattern},current_thought.ilike.${pattern}`).limit(30),
  ]);
  for (const result of [resources, notes, topics, questions]) if (result.error) throw result.error;
  return {
    resources: resources.data ?? [], notes: notes.data ?? [], topics: topics.data ?? [], questions: questions.data ?? [],
  };
}
