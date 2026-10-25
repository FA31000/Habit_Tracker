-- Habit ordering Setup
-- Run this in: https://xkgukvmrdvkiwvcyrdop.supabase.co/project/default/sql/new
--
-- The up/down arrows on the habits page used to save their order in the
-- browser (localStorage), so it never followed the user between devices.
-- sort_order stores it on the account instead. Null means "never ordered",
-- which sorts last, so brand new habits land at the bottom of the list.

alter table habits add column if not exists sort_order integer;

-- Expose the order to friends too, so they see habits in the owner's order.
-- New columns can only be appended at the end of an existing view.
create or replace view public_habits
with (security_invoker = off) as
  select id, user_id, name, is_active, created_at, question_config, allowed_no_days_per_week, sort_order
  from habits;

grant select on public_habits to authenticated;
