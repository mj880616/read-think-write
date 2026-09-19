create index if not exists rtw_records_source_resource_idx on public.rtw_records (source_resource_id) where source_resource_id is not null;
