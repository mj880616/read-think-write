create table if not exists public.rtw_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  record_type text not null default 'learning'
    check (record_type = any (array['writing_training'::text,'learning'::text,'thought_change'::text,'principle'::text,'question'::text])),
  title text not null check (length(btrim(title)) > 0),
  source_resource_id uuid null references public.rtw_resources(id) on delete set null,
  a_original text not null default '',
  b_feedback text not null default '',
  c_revision text not null default '',
  takeaway text not null default '',
  tags text[] not null default '{}',
  origin text not null default 'chatgpt'
    check (origin = any (array['chatgpt'::text,'manual'::text,'reading'::text])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rtw_records_owner_updated_idx
  on public.rtw_records (owner_id, updated_at desc);

alter table public.rtw_records enable row level security;

drop policy if exists rtw_records_personal_all on public.rtw_records;
create policy rtw_records_personal_all
  on public.rtw_records for all to authenticated
  using (
    owner_id = (select auth.uid()) and rtw_is_personal_owner()
    and (
      source_resource_id is null
      or exists (
        select 1 from public.rtw_resources r
        where r.id = rtw_records.source_resource_id
          and r.owner_id = (select auth.uid())
      )
    )
  )
  with check (
    owner_id = (select auth.uid()) and rtw_is_personal_owner()
    and (
      source_resource_id is null
      or exists (
        select 1 from public.rtw_resources r
        where r.id = rtw_records.source_resource_id
          and r.owner_id = (select auth.uid())
      )
    )
  );

revoke all on table public.rtw_records from anon;
grant select, insert, update, delete on table public.rtw_records to authenticated;
grant select, insert, update, delete on table public.rtw_records to service_role;

create table if not exists public.rtw_writing_context (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  profile_md text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.rtw_writing_context enable row level security;

drop policy if exists rtw_writing_context_personal_all on public.rtw_writing_context;
create policy rtw_writing_context_personal_all
  on public.rtw_writing_context for all to authenticated
  using (owner_id = (select auth.uid()) and rtw_is_personal_owner())
  with check (owner_id = (select auth.uid()) and rtw_is_personal_owner());

revoke all on table public.rtw_writing_context from anon;
grant select, insert, update, delete on table public.rtw_writing_context to authenticated;
grant select, insert, update, delete on table public.rtw_writing_context to service_role;
