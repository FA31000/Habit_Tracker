-- Push Notifications Setup
-- Run this in: https://xkgukvmrdvkiwvcyrdop.supabase.co/project/default/sql/new

-- Push subscriptions table
create table if not exists push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null check (role in ('user', 'partner')),
  subscription text not null,
  created_at timestamptz default now(),
  unique (user_id, role)
);

-- RLS
alter table push_subscriptions enable row level security;

create policy "push_subscriptions: own data" on push_subscriptions
  for all using (auth.uid() = user_id);

-- Allow anonymous inserts (partner page has no session)
create policy "push_subscriptions: partner insert" on push_subscriptions
  for insert with check (true);

-- Reminder time setting (stored on the user's habits row or separately)
-- We'll add a reminder_time column to a settings table
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reminder_time text default '21:00'
);

alter table user_settings enable row level security;

create policy "user_settings: own data" on user_settings
  for all using (auth.uid() = user_id);
