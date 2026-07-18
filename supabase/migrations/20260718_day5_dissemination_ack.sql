-- Day 5: Dissemination Board + Acknowledgement Simulation
-- Run in order. Mirrors changes already applied via Supabase SQL Editor on 2026-07-18.

-- 1. Fix alert_delivery.alert_id FK — was pointing at the unused `alert` table,
--    should point at `alert_candidate` where real issued alerts live.
alter table alert_delivery drop constraint alert_delivery_alert_id_fkey;

alter table alert_delivery
  add constraint alert_delivery_alert_id_fkey
  foreign key (alert_id) references alert_candidate(id) on delete cascade;

-- 2. RLS policies for alert_delivery (table had RLS enabled but zero policies = fully locked)
create policy "alert_delivery_select" on alert_delivery
for select
using (
  exists (
    select 1 from profile
    where profile.id = auth.uid()
    and (profile.role in ('duty_officer', 'dg') or profile.district_id = alert_delivery.district_id)
  )
);

create policy "alert_delivery_insert" on alert_delivery
for insert
with check (
  exists (
    select 1 from profile
    where profile.id = auth.uid()
    and profile.role in ('duty_officer', 'dg')
  )
);

create policy "alert_delivery_update" on alert_delivery
for update
using (
  exists (
    select 1 from profile
    where profile.id = auth.uid()
    and profile.role in ('duty_officer', 'dg')
  )
);

-- 3. New table: demo recipient counts per district/channel, used to drive the
--    Dissemination Board's channel breakdown. Clearly marked as demo data
--    (no real subscriber/opt-in list exists yet).
create table channel_recipient_count (
  id uuid primary key default gen_random_uuid(),
  district_id uuid not null references district(id) on delete cascade,
  channel text not null check (channel in ('sms','whatsapp','email','app_push','siren','loudspeaker')),
  recipient_count integer not null,
  is_demo_data boolean not null default true,
  unique (district_id, channel)
);

alter table channel_recipient_count enable row level security;

create policy "channel_recipient_count_select" on channel_recipient_count
for select
using (auth.uid() is not null);

-- 4. Enable Realtime on alert_delivery so the Acknowledgement Simulation
--    updates live without polling. (No-op if already enabled.)
alter publication supabase_realtime add table alert_delivery;