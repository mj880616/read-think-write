import { supabase } from '../runtime/supabase.js';

export async function listRelationsForSource(source_type, source_id) {
  const { data, error } = await supabase.from('rtw_relations')
    .select('*')
    .eq('source_type', source_type)
    .eq('source_id', source_id);
  if (error) throw error;
  return data ?? [];
}

export async function listRelationsForTarget(target_type, target_id) {
  const { data, error } = await supabase.from('rtw_relations')
    .select('*')
    .eq('target_type', target_type)
    .eq('target_id', target_id);
  if (error) throw error;
  return data ?? [];
}

export async function connectRelation({ source_type, source_id, target_type, target_id }) {
  const { data, error } = await supabase.from('rtw_relations')
    .upsert({ source_type, source_id, target_type, target_id }, { onConflict: 'owner_id,source_type,source_id,target_type,target_id,relation_type' })
    .select().single();
  if (error) throw error;
  return data;
}

export async function disconnectRelation(id) {
  const { error } = await supabase.from('rtw_relations').delete().eq('id', id);
  if (error) throw error;
}
