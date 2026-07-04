-- Perfect Days Feature Setup
-- Run this in: https://xkgukvmrdvkiwvcyrdop.supabase.co/project/default/sql/new

-- A "perfect day" is a date where a user answered Yes to every active habit.
-- We record it as an event so friends can see it in their feed. Friends can
-- read everyone's perfect days, but each user only writes their own.
create table if not exists perfect_days (
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table perfect_days enable row level security;

create policy "perfect_days: read all" on perfect_days
  for select to authenticated using (true);
create policy "perfect_days: insert own" on perfect_days
  for insert to authenticated with check (auth.uid() = user_id);
create policy "perfect_days: delete own" on perfect_days
  for delete to authenticated using (auth.uid() = user_id);
