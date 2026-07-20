-- M7: Replay Mode — scenario + frame storage

create table if not exists replay_scenarios (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  hazard_type text not null,
  district text,
  duration_seconds int not null,
  default_speed_multiplier int not null default 120,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists replay_frames (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references replay_scenarios(id) on delete cascade,
  t_offset_seconds int not null,
  phase text not null,
  narration text,
  frame_data jsonb not null default '{}'::jsonb,
  unique (scenario_id, t_offset_seconds)
);

create index if not exists idx_replay_frames_scenario on replay_frames (scenario_id, t_offset_seconds);

alter table replay_scenarios enable row level security;
alter table replay_frames enable row level security;

drop policy if exists replay_scenarios_select on replay_scenarios;
create policy replay_scenarios_select on replay_scenarios
  for select to authenticated
  using (is_published = true);

drop policy if exists replay_frames_select on replay_frames;
create policy replay_frames_select on replay_frames
  for select to authenticated
  using (
    exists (
      select 1 from replay_scenarios s
      where s.id = replay_frames.scenario_id and s.is_published = true
    )
  );

grant select on replay_scenarios to authenticated;
grant select on replay_frames to authenticated;
