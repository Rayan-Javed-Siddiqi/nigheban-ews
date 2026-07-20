-- IRSA daily reservoir readings (Tarbela, Mangla, Chashma)
create table if not exists public.reservoir_reading (
  id uuid primary key default gen_random_uuid(),
  reservoir_name text not null,
  reading_date date not null,
  level_ft double precision,
  inflow_cusecs double precision,
  outflow_cusecs double precision,
  mean_inflow_cusecs double precision,
  raw jsonb,
  fetched_at timestamptz not null default now(),
  unique (reservoir_name, reading_date)
);

create index if not exists reservoir_reading_date_idx
  on public.reservoir_reading (reading_date desc);

alter table public.reservoir_reading enable row level security;

create policy "reservoir_reading_select_authenticated"
  on public.reservoir_reading for select
  to authenticated
  using (true);

create policy "reservoir_reading_select_anon"
  on public.reservoir_reading for select
  to anon
  using (true);

create policy "reservoir_reading_insert_service_role"
  on public.reservoir_reading for insert
  to service_role
  with check (true);

create policy "reservoir_reading_update_service_role"
  on public.reservoir_reading for update
  to service_role
  using (true);
