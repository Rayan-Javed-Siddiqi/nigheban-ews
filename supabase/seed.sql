-- Day 5 demo seed: channel recipient counts for the 3 focus districts + Kohistan Lower
-- (added because our first test alert happened to target Kohistan Lower)
insert into channel_recipient_count (district_id, channel, recipient_count)
select d.id, c.channel, c.cnt
from district d
cross join (values
  ('sms', 4200),
  ('whatsapp', 2100),
  ('email', 350),
  ('app_push', 180),
  ('siren', 6),
  ('loudspeaker', 6)
) as c(channel, cnt)
where d.name_en in ('Chitral Lower', 'Swat', 'Hunza', 'Kohistan Lower')
on conflict (district_id, channel) do nothing;