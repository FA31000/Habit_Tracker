-- Feedback Setup
-- Run this in: https://xkgukvmrdvkiwvcyrdop.supabase.co/project/default/sql/new

create table if not exists feedback (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  user_email text,
  message text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table feedback enable row level security;

-- Recreate policies cleanly (safe to run more than once)
drop policy if exists "feedback: user insert" on feedback;
drop policy if exists "feedback: admin read" on feedback;
drop policy if exists "feedback: admin update" on feedback;
drop policy if exists "feedback: admin delete" on feedback;

-- Any logged-in user can submit their own feedback
create policy "feedback: user insert" on feedback
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Only the admin can read, update (mark done), and delete feedback
create policy "feedback: admin read" on feedback
  for select to authenticated
  using ((auth.jwt() ->> 'email') = 'fa.leonard@gmail.com');

create policy "feedback: admin update" on feedback
  for update to authenticated
  using ((auth.jwt() ->> 'email') = 'fa.leonard@gmail.com');

create policy "feedback: admin delete" on feedback
  for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'fa.leonard@gmail.com');
