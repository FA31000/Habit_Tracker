-- Thumbs-up and Comments on Perfect Days
-- Run this in: https://xkgukvmrdvkiwvcyrdop.supabase.co/project/default/sql/new

-- Same rules as badge thumbs/comments: everyone can read, you can react
-- to a friend's perfect day but not your own, and delete your own reactions.
-- A perfect day is identified by (owner_id, date) since perfect_days has no id.

-- =========================================================
-- 1. THUMBS-UP on a perfect day
-- =========================================================
create table if not exists perfect_day_thumbs (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null,
  date date not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  foreign key (owner_id, date) references perfect_days(user_id, date) on delete cascade,
  unique (owner_id, date, user_id)
);

alter table perfect_day_thumbs enable row level security;

create policy "perfect_day_thumbs: read all" on perfect_day_thumbs
  for select to authenticated using (true);

-- You can add your own thumb, but NOT on your own perfect day.
create policy "perfect_day_thumbs: insert own" on perfect_day_thumbs
  for insert to authenticated with check (
    auth.uid() = user_id
    and owner_id <> auth.uid()
  );
create policy "perfect_day_thumbs: delete own" on perfect_day_thumbs
  for delete to authenticated using (auth.uid() = user_id);

-- =========================================================
-- 2. COMMENTS on a perfect day
-- =========================================================
create table if not exists perfect_day_comments (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null,
  date date not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  body text not null,
  created_at timestamptz not null default now(),
  foreign key (owner_id, date) references perfect_days(user_id, date) on delete cascade
);

alter table perfect_day_comments enable row level security;

create policy "perfect_day_comments: read all" on perfect_day_comments
  for select to authenticated using (true);

-- You can add your own comment, but NOT on your own perfect day.
create policy "perfect_day_comments: insert own" on perfect_day_comments
  for insert to authenticated with check (
    auth.uid() = user_id
    and owner_id <> auth.uid()
  );
create policy "perfect_day_comments: delete own" on perfect_day_comments
  for delete to authenticated using (auth.uid() = user_id);
