-- Credits Setup
-- Run this in: https://xkgukvmrdvkiwvcyrdop.supabase.co/project/default/sql/new
--
-- Credits are real money from selling something second-hand, topping up the
-- reward budget. They are NOT earned by habits: they never affect the run rate.

create table if not exists credits (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  description text not null,
  amount numeric not null check (amount > 0),
  date date not null,
  created_at timestamptz not null default now()
);

-- Dropped after the first version: every credit is a sale, so the type tag
-- (Sold / Gift / Cashback / Other) only ever had one answer. Safe to re-run.
alter table credits drop column if exists kind;

create index if not exists credits_user_date_idx on credits (user_id, date);

alter table credits enable row level security;

-- Recreate policies cleanly (safe to run more than once)
drop policy if exists "credits: own read" on credits;
drop policy if exists "credits: own insert" on credits;
drop policy if exists "credits: own update" on credits;
drop policy if exists "credits: own delete" on credits;

-- Every user manages only their own credits
create policy "credits: own read" on credits
  for select to authenticated using (auth.uid() = user_id);

create policy "credits: own insert" on credits
  for insert to authenticated with check (auth.uid() = user_id);

create policy "credits: own update" on credits
  for update to authenticated using (auth.uid() = user_id);

create policy "credits: own delete" on credits
  for delete to authenticated using (auth.uid() = user_id);
