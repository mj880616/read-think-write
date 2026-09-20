-- Existing notes keep their text type values. These functions only modify
-- rows when the owner explicitly renames or deletes a custom type.
create function public.rtw_rename_note_type(p_type_id uuid, p_new_name text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_name text;
  new_name text := btrim(p_new_name);
  changed_notes integer;
begin
  if auth.uid() is null or not public.rtw_is_personal_owner() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if new_name is null or char_length(new_name) not between 1 and 30 then
    raise exception 'Invalid note type name' using errcode = '22023';
  end if;

  select name into old_name
  from public.rtw_note_types
  where id = p_type_id and owner_id = auth.uid()
  for update;
  if not found then
    raise exception 'Note type not found' using errcode = 'P0002';
  end if;
  if new_name = old_name then
    return 0;
  end if;
  if exists (
    select 1 from public.rtw_note_types
    where owner_id = auth.uid() and name = new_name
  ) or exists (
    select 1 from public.rtw_notes
    where owner_id = auth.uid() and note_type = new_name
  ) then
    raise exception 'Note type already exists' using errcode = '23505';
  end if;

  update public.rtw_note_types
  set name = new_name
  where id = p_type_id and owner_id = auth.uid();
  update public.rtw_notes
  set note_type = new_name
  where owner_id = auth.uid() and note_type = old_name;
  get diagnostics changed_notes = row_count;
  return changed_notes;
end;
$$;

create function public.rtw_delete_note_type_if_unused(p_type_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  type_name text;
begin
  if auth.uid() is null or not public.rtw_is_personal_owner() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select name into type_name
  from public.rtw_note_types
  where id = p_type_id and owner_id = auth.uid()
  for update;
  if not found then
    raise exception 'Note type not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.rtw_notes
    where owner_id = auth.uid() and note_type = type_name
  ) then
    raise exception 'Note type is in use' using errcode = '23503';
  end if;

  delete from public.rtw_note_types
  where id = p_type_id and owner_id = auth.uid();
  return true;
end;
$$;

revoke all on function public.rtw_rename_note_type(uuid, text) from public, anon;
revoke all on function public.rtw_delete_note_type_if_unused(uuid) from public, anon;
grant execute on function public.rtw_rename_note_type(uuid, text) to authenticated;
grant execute on function public.rtw_delete_note_type_if_unused(uuid) to authenticated;
