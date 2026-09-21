create or replace function public.rtw_beta_access_status()
returns table(email text, role text, active boolean, invited_at timestamptz, note text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.email, b.role, b.active, b.invited_at, b.note
  from public.rtw_beta_access b
  where b.email = lower(coalesce(auth.jwt()->>'email',''))
  limit 1
$$;

revoke all on function public.rtw_beta_access_status() from public, anon;
grant execute on function public.rtw_beta_access_status() to authenticated;
