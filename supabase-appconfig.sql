-- Shared App Config (admin-only settings)
-- Run this in: https://xkgukvmrdvkiwvcyrdop.supabase.co/project/default/sql/new

-- One single row (id = 1) holding the app-wide settings as JSON.
create table if not exists app_config (
  id int primary key default 1 check (id = 1),
  config jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table app_config enable row level security;

-- Everyone signed in can read the config; only the admin can change it.
create policy "app_config: read all" on app_config
  for select to authenticated using (true);
create policy "app_config: admin insert" on app_config
  for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'fa.leonard@gmail.com');
create policy "app_config: admin update" on app_config
  for update to authenticated
  using ((auth.jwt() ->> 'email') = 'fa.leonard@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'fa.leonard@gmail.com');

-- Starting values: one points multiplier per badge milestone.
insert into app_config (id, config) values (
  1,
  '{"currencySymbol": "S$", "badgeMultipliers": {"7": 1.5, "14": 1.75, "30": 2, "90": 2.5, "180": 3, "365": 4}}'
) on conflict (id) do nothing;
