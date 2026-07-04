-- Diagnostic only — reads data, changes nothing.
-- Run in: https://xkgukvmrdvkiwvcyrdop.supabase.co/project/default/sql/new

-- Every day ever marked as "freeze": the date, habit name, and whether
-- that habit is still active. If this returns 0 rows, no real freeze was
-- ever used and the freeze_tokens flags are stale.
select c.date, h.name, h.is_active
from checkins c
join habits h on h.id = c.habit_id
where c.response = 'freeze'
order by c.date desc;
