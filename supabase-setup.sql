-- Habit Tracker Database Setup
-- Run this in: https://xkgukvmrdvkiwvcyrdop.supabase.co/project/default/sql/new

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Habits
create table if not exists habits (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  dollar_value numeric(10,2) not null default 1.00,
  is_active boolean not null default true,
  allowed_no_days_per_week int not null default 0,
  created_at timestamptz not null default now()
);

-- Check-ins (one row per habit per day)
create table if not exists checkins (
  id uuid primary key default uuid_generate_v4(),
  habit_id uuid references habits(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  response text not null check (response in ('yes', 'no', 'freeze')),
  unique(habit_id, date)
);

-- Streaks (one row per habit)
create table if not exists streaks (
  id uuid primary key default uuid_generate_v4(),
  habit_id uuid references habits(id) on delete cascade not null unique,
  user_id uuid references auth.users(id) on delete cascade not null,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  updated_at timestamptz not null default now()
);

-- Freeze tokens (one row per week per user)
create table if not exists freeze_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  week_start date not null,
  used boolean not null default false,
  unique(user_id, week_start)
);

-- Badges
create table if not exists badges (
  id uuid primary key default uuid_generate_v4(),
  habit_id uuid references habits(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  milestone_days int not null,
  earned_at timestamptz not null default now(),
  unique(habit_id, milestone_days)
);

-- Wishlist items
create table if not exists wishlist_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  price numeric(10,2) not null,
  redeemed boolean not null default false,
  redeemed_at timestamptz
);

-- Share links (accountability partner)
create table if not exists share_links (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now()
);

-- Reactions from accountability partner
create table if not exists reactions (
  id uuid primary key default uuid_generate_v4(),
  share_link_id uuid references share_links(id) on delete cascade not null,
  emoji text not null,
  reacted_at timestamptz not null default now()
);

-- Row Level Security
alter table habits enable row level security;
alter table checkins enable row level security;
alter table streaks enable row level security;
alter table freeze_tokens enable row level security;
alter table badges enable row level security;
alter table wishlist_items enable row level security;
alter table share_links enable row level security;
alter table reactions enable row level security;

-- RLS Policies: users can only see/edit their own data
create policy "habits: own data" on habits for all using (auth.uid() = user_id);
create policy "checkins: own data" on checkins for all using (auth.uid() = user_id);
create policy "streaks: own data" on streaks for all using (auth.uid() = user_id);
create policy "freeze_tokens: own data" on freeze_tokens for all using (auth.uid() = user_id);
create policy "badges: own data" on badges for all using (auth.uid() = user_id);
create policy "wishlist_items: own data" on wishlist_items for all using (auth.uid() = user_id);
create policy "share_links: own data" on share_links for all using (auth.uid() = user_id);

-- Share links are also publicly readable by token (for accountability partner)
create policy "share_links: public read by token" on share_links for select using (true);

-- Reactions are publicly insertable (partner doesn't have account)
create policy "reactions: public insert" on reactions for insert with check (true);
create policy "reactions: read by link owner" on reactions for select using (
  exists (
    select 1 from share_links sl
    join habits h on h.user_id = sl.user_id
    where sl.id = reactions.share_link_id and sl.user_id = auth.uid()
  )
);

-- Pre-load wishlist item for the user (will be attached to user after first login via app)
-- This is handled in the app on first login instead.
