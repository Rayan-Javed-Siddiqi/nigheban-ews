-- Allow anon read of published replay scenarios (demo content; dashboard still requires login)
-- Fixes empty scenario list when client session is not yet attached.

drop policy if exists replay_scenarios_anon_select on replay_scenarios;
create policy replay_scenarios_anon_select on replay_scenarios
  for select to anon
  using (is_published = true);

drop policy if exists replay_frames_anon_select on replay_frames;
create policy replay_frames_anon_select on replay_frames
  for select to anon
  using (
    exists (
      select 1 from replay_scenarios s
      where s.id = replay_frames.scenario_id and s.is_published = true
    )
  );

grant select on replay_scenarios to anon;
grant select on replay_frames to anon;
