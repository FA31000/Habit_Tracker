-- Per-account streak bonus override.
-- If an account has a row here, its badge multipliers replace the shared
-- defaults when that account's money is calculated. Accounts with NO row keep
-- the current default bonus, completely unchanged.

create table if not exists user_bonus_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  badge_multipliers jsonb not null,
  created_at timestamptz not null default now()
);

alter table user_bonus_config enable row level security;

-- Each user may read only their own bonus config (the money math runs in the
-- browser as that signed-in user). Rows are set by the admin via SQL, so there
-- is no insert/update policy for normal users.
drop policy if exists "read own bonus config" on user_bonus_config;
create policy "read own bonus config" on user_bonus_config
  for select using (auth.uid() = user_id);

-- Hadrien (hadrienchenleonard@gmail.com): gentle streak ladder capped at 1.45x.
-- This affects his account only.
insert into user_bonus_config (user_id, badge_multipliers)
values (
  'c68b4e8a-c94c-48f0-a9d9-ba660af3bd5a',
  '{"7":1.15,"14":1.25,"30":1.35,"90":1.45,"180":1.45,"365":1.45}'::jsonb
)
on conflict (user_id) do update set badge_multipliers = excluded.badge_multipliers;
