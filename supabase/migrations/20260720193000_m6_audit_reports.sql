-- M6: audit insert policy for staff app writes + query indexes

create index if not exists idx_audit_log_at on audit_log (at desc);
create index if not exists idx_audit_log_action on audit_log (action);
create index if not exists idx_audit_log_entity on audit_log (entity, entity_id);

drop policy if exists "Allow staff insert on audit_log" on audit_log;
create policy "Allow staff insert on audit_log" on audit_log
  for insert to authenticated
  with check (
    exists (
      select 1 from profile
      where profile.id = auth.uid()
        and profile.role in ('duty_officer', 'dg')
    )
  );
