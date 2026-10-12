-- Habit start date Setup
-- Run this in: https://xkgukvmrdvkiwvcyrdop.supabase.co/project/default/sql/new
--
-- start_date is the first day a habit shows on the check-in page. Days before
-- it hide the habit and don't count it for perfect days.
-- Existing habits get the day they were created (Singapore time), or their
-- first check-in if that is earlier, so no past answers get hidden.

alter table habits add column if not exists start_date date;

update habits h
set start_date = least(
  (h.created_at at time zone 'Asia/Singapore')::date,
  coalesce((select min(c.date) from checkins c where c.habit_id = h.id), (h.created_at at time zone 'Asia/Singapore')::date)
)
where h.start_date is null;

alter table habits alter column start_date set default ((now() at time zone 'Asia/Singapore')::date);
