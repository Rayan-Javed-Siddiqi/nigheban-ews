create table if not exists public.pmd_forecasts (
  id uuid primary key default gen_random_uuid(),
  bulletin_id integer not null,
  matched_by_date boolean not null default false,
  warning_level text,
  forecast_text text,
  rivers jsonb,
  snapshot_path text,
  source_url text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists pmd_forecasts_fetched_at_idx
  on public.pmd_forecasts (fetched_at desc);

alter table public.pmd_forecasts enable row level security;

-- Adjust these to match your actual role setup (DG / Duty Officer / District Focal / Viewer)
create policy "pmd_forecasts_select_authenticated"
  on public.pmd_forecasts for select
  to authenticated
  using (true);

create policy "pmd_forecasts_insert_service_role"
  on public.pmd_forecasts for insert
  to service_role
  with check (true);