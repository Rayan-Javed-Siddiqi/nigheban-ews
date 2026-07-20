-- Extend station_health with valley/district/source for M2 roll-ups
create or replace view public.station_health as
select
  s.id as station_id,
  s.name,
  s.kind,
  s.valley,
  s.district_id,
  d.name_en as district_name,
  s.source,
  s.is_simulated,
  lr.recorded_at as last_transmission_at,
  lr.battery_voltage,
  lr.rssi,
  lr.water_level,
  lr.rainfall,
  lr.temperature,
  lr.flow_rate,
  case
    when lr.recorded_at is null then 'offline'
    when (now() - lr.recorded_at) > interval '30 minutes' then 'offline'
    when (now() - lr.recorded_at) > interval '15 minutes' then 'degraded'
    when lr.battery_voltage is not null and lr.battery_voltage < 11.0 then 'degraded'
    else 'online'
  end as status,
  public.st_x(s.geom) as lon,
  public.st_y(s.geom) as lat
from public.station s
left join public.district d on d.id = s.district_id
left join lateral (
  select
    sr.recorded_at,
    sr.battery_voltage,
    sr.rssi,
    sr.water_level,
    sr.rainfall,
    sr.temperature,
    sr.flow_rate
  from public.station_reading sr
  where sr.station_id = s.id
  order by sr.recorded_at desc
  limit 1
) lr on true;

-- Allow authenticated users to read maintenance tickets (M2 panel)
create policy "maintenance_ticket_select_authenticated"
  on public.maintenance_ticket for select
  to authenticated
  using (true);
