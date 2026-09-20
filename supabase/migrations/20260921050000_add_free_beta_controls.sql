-- Free beta access control, feedback, and AI usage support for Read Think Write.

create table if not exists public.rtw_beta_access (
  email text primary key,
  role text not null default 'user' check (role in ('admin','user')),
  active boolean not null default true,
  invited_at timestamptz not null default now(),
  note text null,
  check (email = lower(btrim(email)) and position('@' in email) > 1)
);

alter table public.rtw_beta_access enable row level security;

create or replace function private.rtw_beta_access_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.rtw_beta_access
  where active = true
    and email = lower(coalesce(auth.jwt()->>'email',''))
  limit 1
$$;

create or replace function private.rtw_has_beta_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.rtw_beta_access_role() is not null
$$;

create or replace function private.rtw_is_beta_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.rtw_beta_access_role() = 'admin'
$$;

revoke all on function private.rtw_beta_access_role() from public, anon;
revoke all on function private.rtw_has_beta_access() from public, anon;
revoke all on function private.rtw_is_beta_admin() from public, anon;
grant execute on function private.rtw_beta_access_role() to authenticated;
grant execute on function private.rtw_has_beta_access() to authenticated;
grant execute on function private.rtw_is_beta_admin() to authenticated;

drop policy if exists rtw_beta_access_read on public.rtw_beta_access;
drop policy if exists rtw_beta_access_admin_insert on public.rtw_beta_access;
drop policy if exists rtw_beta_access_admin_update on public.rtw_beta_access;
drop policy if exists rtw_beta_access_admin_delete on public.rtw_beta_access;

create policy rtw_beta_access_read
  on public.rtw_beta_access for select to authenticated
  using (
    email = lower(coalesce(auth.jwt()->>'email',''))
    or private.rtw_is_beta_admin()
  );

create policy rtw_beta_access_admin_insert
  on public.rtw_beta_access for insert to authenticated
  with check (private.rtw_is_beta_admin());

create policy rtw_beta_access_admin_update
  on public.rtw_beta_access for update to authenticated
  using (private.rtw_is_beta_admin())
  with check (private.rtw_is_beta_admin());

create policy rtw_beta_access_admin_delete
  on public.rtw_beta_access for delete to authenticated
  using (private.rtw_is_beta_admin());

revoke all on table public.rtw_beta_access from anon;
grant select, insert, update, delete on table public.rtw_beta_access to authenticated;
grant select, insert, update, delete on table public.rtw_beta_access to service_role;

insert into public.rtw_beta_access(email, role, active, note)
select lower(u.email), 'admin', true, 'personal owner / beta admin'
from public.rtw_personal_mode p
join auth.users u on u.id = p.owner_id
where p.id='owner' and u.email is not null
on conflict (email) do update
set role='admin', active=true;

create table if not exists public.rtw_feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  page_path text null check (page_path is null or char_length(page_path) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists rtw_feedback_owner_created_idx
  on public.rtw_feedback(owner_id, created_at desc);

alter table public.rtw_feedback enable row level security;

drop policy if exists rtw_feedback_select on public.rtw_feedback;
drop policy if exists rtw_feedback_insert on public.rtw_feedback;
drop policy if exists rtw_feedback_delete on public.rtw_feedback;

create policy rtw_feedback_select
  on public.rtw_feedback for select to authenticated
  using (owner_id = (select auth.uid()) or private.rtw_is_beta_admin());

create policy rtw_feedback_insert
  on public.rtw_feedback for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.rtw_has_beta_access()
  );

create policy rtw_feedback_delete
  on public.rtw_feedback for delete to authenticated
  using (private.rtw_is_beta_admin());

revoke all on table public.rtw_feedback from anon;
grant select, insert, delete on table public.rtw_feedback to authenticated;
grant select, insert, update, delete on table public.rtw_feedback to service_role;

-- Require beta membership in addition to the existing owner policies.
do $$
declare
  t text;
begin
  foreach t in array array[
    'rtw_resources','rtw_notes','rtw_note_types','rtw_topics','rtw_questions',
    'rtw_relations','rtw_bookmarks','rtw_records','rtw_writing_context'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_beta_access', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (private.rtw_has_beta_access()) with check (private.rtw_has_beta_access())',
      t || '_beta_access', t
    );
  end loop;
end $$;

drop policy if exists rtw_ai_usage_beta_access on public.rtw_ai_usage;
create policy rtw_ai_usage_beta_access
  on public.rtw_ai_usage as restrictive for select to authenticated
  using (private.rtw_has_beta_access());

-- Recommendation usage is already consumed by the recommendation function.
-- Extend the check constraint and use the same table for read/expand display.
alter table public.rtw_ai_usage
  drop constraint if exists rtw_ai_usage_action_check;

alter table public.rtw_ai_usage
  add constraint rtw_ai_usage_action_check
  check (action = any(array['recommend'::text,'read'::text,'expand'::text]));


-- Quota consumption is server-only. Reset on the Korea calendar day.
create or replace function public.rtw_consume_ai_quota(p_owner_id uuid, p_action text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_day date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_owner_id is null or p_action not in ('recommend','read','expand') or p_limit < 1 then
    raise exception 'invalid quota request';
  end if;

  insert into public.rtw_ai_usage(owner_id,usage_day,action,count)
  values(p_owner_id,v_day,p_action,1)
  on conflict(owner_id,usage_day,action) do update
    set count=public.rtw_ai_usage.count+1,updated_at=now()
    where public.rtw_ai_usage.count < p_limit
  returning count into v_count;

  if v_count is null then
    raise exception 'daily_ai_limit_reached';
  end if;
  return v_count;
end;
$$;

revoke all on function public.rtw_consume_ai_quota(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.rtw_consume_ai_quota(uuid,text,integer) to service_role;

create or replace function public.rtw_ai_usage_today()
returns table(action text, count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select u.action, u.count
  from public.rtw_ai_usage u
  where u.owner_id = auth.uid()
    and u.usage_day = (now() at time zone 'Asia/Seoul')::date
  order by u.action
$$;

revoke all on function public.rtw_ai_usage_today() from public, anon;
grant execute on function public.rtw_ai_usage_today() to authenticated;
