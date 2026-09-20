-- Convert Read/Think/Write from a single-owner workspace to per-user personal spaces.
-- The existing rtw_personal_mode row remains in place exclusively for the
-- external GPT write endpoint, which must continue writing only to the
-- designated personal owner.
--
-- Browser access is now authorized only by row ownership. Every signed-in
-- user can CRUD their own rows and cannot read or mutate another user's rows.

-- Resources
drop policy if exists rtw_resources_personal_all on public.rtw_resources;
drop policy if exists rtw_resources_owner_select on public.rtw_resources;
drop policy if exists rtw_resources_owner_insert on public.rtw_resources;
drop policy if exists rtw_resources_owner_update on public.rtw_resources;
drop policy if exists rtw_resources_owner_delete on public.rtw_resources;

create policy rtw_resources_owner_select
  on public.rtw_resources for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy rtw_resources_owner_insert
  on public.rtw_resources for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy rtw_resources_owner_update
  on public.rtw_resources for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy rtw_resources_owner_delete
  on public.rtw_resources for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Notes
drop policy if exists rtw_notes_personal_all on public.rtw_notes;
drop policy if exists rtw_notes_owner_select on public.rtw_notes;
drop policy if exists rtw_notes_owner_insert on public.rtw_notes;
drop policy if exists rtw_notes_owner_update on public.rtw_notes;
drop policy if exists rtw_notes_owner_delete on public.rtw_notes;

create policy rtw_notes_owner_select
  on public.rtw_notes for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy rtw_notes_owner_insert
  on public.rtw_notes for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and (
      resource_id is null
      or exists (
        select 1 from public.rtw_resources r
        where r.id = rtw_notes.resource_id
          and r.owner_id = (select auth.uid())
      )
    )
  );

create policy rtw_notes_owner_update
  on public.rtw_notes for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and (
      resource_id is null
      or exists (
        select 1 from public.rtw_resources r
        where r.id = rtw_notes.resource_id
          and r.owner_id = (select auth.uid())
      )
    )
  );

create policy rtw_notes_owner_delete
  on public.rtw_notes for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Note types
drop policy if exists rtw_note_types_personal_all on public.rtw_note_types;
drop policy if exists rtw_note_types_owner_select on public.rtw_note_types;
drop policy if exists rtw_note_types_owner_insert on public.rtw_note_types;
drop policy if exists rtw_note_types_owner_update on public.rtw_note_types;
drop policy if exists rtw_note_types_owner_delete on public.rtw_note_types;

create policy rtw_note_types_owner_select
  on public.rtw_note_types for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy rtw_note_types_owner_insert
  on public.rtw_note_types for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy rtw_note_types_owner_update
  on public.rtw_note_types for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy rtw_note_types_owner_delete
  on public.rtw_note_types for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Topics
drop policy if exists rtw_topics_personal_all on public.rtw_topics;
drop policy if exists rtw_topics_owner_select on public.rtw_topics;
drop policy if exists rtw_topics_owner_insert on public.rtw_topics;
drop policy if exists rtw_topics_owner_update on public.rtw_topics;
drop policy if exists rtw_topics_owner_delete on public.rtw_topics;

create policy rtw_topics_owner_select
  on public.rtw_topics for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy rtw_topics_owner_insert
  on public.rtw_topics for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy rtw_topics_owner_update
  on public.rtw_topics for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy rtw_topics_owner_delete
  on public.rtw_topics for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Questions
drop policy if exists rtw_questions_personal_all on public.rtw_questions;
drop policy if exists rtw_questions_owner_select on public.rtw_questions;
drop policy if exists rtw_questions_owner_insert on public.rtw_questions;
drop policy if exists rtw_questions_owner_update on public.rtw_questions;
drop policy if exists rtw_questions_owner_delete on public.rtw_questions;

create policy rtw_questions_owner_select
  on public.rtw_questions for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy rtw_questions_owner_insert
  on public.rtw_questions for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy rtw_questions_owner_update
  on public.rtw_questions for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy rtw_questions_owner_delete
  on public.rtw_questions for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Relations
drop policy if exists rtw_relations_personal_all on public.rtw_relations;
drop policy if exists rtw_relations_owner_select on public.rtw_relations;
drop policy if exists rtw_relations_owner_insert on public.rtw_relations;
drop policy if exists rtw_relations_owner_update on public.rtw_relations;
drop policy if exists rtw_relations_owner_delete on public.rtw_relations;

create policy rtw_relations_owner_select
  on public.rtw_relations for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy rtw_relations_owner_insert
  on public.rtw_relations for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy rtw_relations_owner_update
  on public.rtw_relations for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy rtw_relations_owner_delete
  on public.rtw_relations for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Bookmarks
drop policy if exists rtw_bookmarks_personal_all on public.rtw_bookmarks;
drop policy if exists rtw_bookmarks_owner_select on public.rtw_bookmarks;
drop policy if exists rtw_bookmarks_owner_insert on public.rtw_bookmarks;
drop policy if exists rtw_bookmarks_owner_update on public.rtw_bookmarks;
drop policy if exists rtw_bookmarks_owner_delete on public.rtw_bookmarks;

create policy rtw_bookmarks_owner_select
  on public.rtw_bookmarks for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy rtw_bookmarks_owner_insert
  on public.rtw_bookmarks for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.rtw_resources r
      where r.id = rtw_bookmarks.resource_id
        and r.owner_id = (select auth.uid())
    )
  );

create policy rtw_bookmarks_owner_update
  on public.rtw_bookmarks for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.rtw_resources r
      where r.id = rtw_bookmarks.resource_id
        and r.owner_id = (select auth.uid())
    )
  );

create policy rtw_bookmarks_owner_delete
  on public.rtw_bookmarks for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Writing records
drop policy if exists rtw_records_personal_all on public.rtw_records;
drop policy if exists rtw_records_owner_select on public.rtw_records;
drop policy if exists rtw_records_owner_insert on public.rtw_records;
drop policy if exists rtw_records_owner_update on public.rtw_records;
drop policy if exists rtw_records_owner_delete on public.rtw_records;

create policy rtw_records_owner_select
  on public.rtw_records for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy rtw_records_owner_insert
  on public.rtw_records for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and (
      source_resource_id is null
      or exists (
        select 1 from public.rtw_resources r
        where r.id = rtw_records.source_resource_id
          and r.owner_id = (select auth.uid())
      )
    )
  );

create policy rtw_records_owner_update
  on public.rtw_records for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and (
      source_resource_id is null
      or exists (
        select 1 from public.rtw_resources r
        where r.id = rtw_records.source_resource_id
          and r.owner_id = (select auth.uid())
      )
    )
  );

create policy rtw_records_owner_delete
  on public.rtw_records for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Writing context
drop policy if exists rtw_writing_context_personal_all on public.rtw_writing_context;
drop policy if exists rtw_writing_context_owner_select on public.rtw_writing_context;
drop policy if exists rtw_writing_context_owner_insert on public.rtw_writing_context;
drop policy if exists rtw_writing_context_owner_update on public.rtw_writing_context;
drop policy if exists rtw_writing_context_owner_delete on public.rtw_writing_context;

create policy rtw_writing_context_owner_select
  on public.rtw_writing_context for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy rtw_writing_context_owner_insert
  on public.rtw_writing_context for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy rtw_writing_context_owner_update
  on public.rtw_writing_context for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy rtw_writing_context_owner_delete
  on public.rtw_writing_context for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Custom note-type operations are available to every signed-in user, but only
-- for rows belonging to that same user.
create or replace function public.rtw_rename_note_type(p_type_id uuid, p_new_name text)
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
  if auth.uid() is null then
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

create or replace function public.rtw_delete_note_type_if_unused(p_type_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  type_name text;
begin
  if auth.uid() is null then
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
