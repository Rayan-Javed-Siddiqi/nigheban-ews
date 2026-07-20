create index if not exists alert_candidate_status_created_idx
  on public.alert_candidate (status, created_at desc);
