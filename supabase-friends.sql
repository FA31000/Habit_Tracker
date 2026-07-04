-- Friends Feature Setup
-- Run this in: https://xkgukvmrdvkiwvcyrdop.supabase.co/project/default/sql/new

-- =========================================================
-- 1. PROFILES — one display name per user
-- =========================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Anyone signed in can read display names; you can only write your own.
create policy "profiles: read all" on profiles
  for select to authenticated using (true);
create policy "profiles: insert own" on profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "profiles: update own" on profiles
  for update to authenticated using (auth.uid() = id);

-- When a new user signs up, automatically create their profile row
-- using the display name they typed on the sign-up form.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill the two existing accounts.
insert into profiles (id, display_name)
select id, 'FA' from auth.users
where email in ('fa.leonard@gmail.com', 'fa.leonard@abilitie.com')
on conflict (id) do update set display_name = excluded.display_name;

insert into profiles (id, display_name)
select id, 'Hadrien' from auth.users
where email = 'hadrienchenleonard@gmail.com'
on conflict (id) do update set display_name = excluded.display_name;

insert into profiles (id, display_name)
select id, 'Si' from auth.users
where email = 'arianne.chen@gmail.com'
on conflict (id) do update set display_name = excluded.display_name;

-- =========================================================
-- 2. OPEN READ ACCESS — friends can see streaks & badges
-- =========================================================
-- These ADD read access on top of the existing "own data" rules.
create policy "streaks: read all" on streaks
  for select to authenticated using (true);
create policy "badges: read all" on badges
  for select to authenticated using (true);

-- Habit NAMES only — never the dollar value or private description.
-- A view that exposes just the safe columns of every user's habits.
create or replace view public_habits
with (security_invoker = off) as
  select id, user_id, name, is_active, created_at
  from habits;

grant select on public_habits to authenticated;

-- =========================================================
-- 3. THUMBS-UP on a badge
-- =========================================================
create table if not exists badge_thumbs (
  id uuid primary key default uuid_generate_v4(),
  badge_id uuid references badges(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  unique (badge_id, user_id)
);

alter table badge_thumbs enable row level security;

create policy "badge_thumbs: read all" on badge_thumbs
  for select to authenticated using (true);

-- You can add your own thumb, but NOT on your own badge.
create policy "badge_thumbs: insert own" on badge_thumbs
  for insert to authenticated with check (
    auth.uid() = user_id
    and not exists (select 1 from badges b where b.id = badge_id and b.user_id = auth.uid())
  );
create policy "badge_thumbs: delete own" on badge_thumbs
  for delete to authenticated using (auth.uid() = user_id);

-- =========================================================
-- 4. COMMENTS on a badge
-- =========================================================
create table if not exists badge_comments (
  id uuid primary key default uuid_generate_v4(),
  badge_id uuid references badges(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table badge_comments enable row level security;

create policy "badge_comments: read all" on badge_comments
  for select to authenticated using (true);

-- You can add your own comment, but NOT on your own badge.
create policy "badge_comments: insert own" on badge_comments
  for insert to authenticated with check (
    auth.uid() = user_id
    and not exists (select 1 from badges b where b.id = badge_id and b.user_id = auth.uid())
  );
create policy "badge_comments: delete own" on badge_comments
  for delete to authenticated using (auth.uid() = user_id);

-- =========================================================
-- 5. REMOVE the old Accountability Partner share-link feature
-- =========================================================
drop table if exists reactions;
drop table if exists share_links cascade;

-- =========================================================
-- 6. FULL STATS FOR FRIENDS — expose check-ins + habit config
-- =========================================================
-- Extend the public habits view with the question setup and the weekly
-- "no" allowance, so a friend's stats page can render the same charts and
-- streak logic as your own. Dollar value is still NOT exposed.
create or replace view public_habits
with (security_invoker = off) as
  select id, user_id, name, is_active, created_at, question_config, allowed_no_days_per_week
  from habits;

grant select on public_habits to authenticated;

-- Safe check-in columns for every user, so friends can see the same
-- success rate and activity charts as on your own stats page.
create or replace view public_checkins
with (security_invoker = off) as
  select id, habit_id, user_id, date, response, answers
  from checkins;

grant select on public_checkins to authenticated;
