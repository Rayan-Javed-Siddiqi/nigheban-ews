insert into storage.buckets (id, name, public)
values ('raw-snapshots', 'raw-snapshots', false)
on conflict (id) do nothing;

create policy "raw_snapshots_service_role_all"
  on storage.objects for all
  to service_role
  using (bucket_id = 'raw-snapshots')
  with check (bucket_id = 'raw-snapshots');