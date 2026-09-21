create or replace function public.rtw_delete_resource(p_resource_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.rtw_relations
  where owner_id = (select auth.uid())
    and (
      (source_type = 'resource' and source_id = p_resource_id)
      or (
        source_type = 'note'
        and source_id in (
          select id
          from public.rtw_notes
          where resource_id = p_resource_id
            and owner_id = (select auth.uid())
        )
      )
    );

  delete from public.rtw_resources
  where id = p_resource_id
    and owner_id = (select auth.uid());

  if not found then
    raise exception 'resource not found or not owned by current user'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.rtw_delete_resource(uuid) from public, anon;
grant execute on function public.rtw_delete_resource(uuid) to authenticated;
