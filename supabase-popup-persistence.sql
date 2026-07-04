-- Popup persistence: move question config and popup answers into Supabase
-- Run this in: https://xkgukvmrdvkiwvcyrdop.supabase.co/project/default/sql/new

-- Per-habit popup question config (which questions to ask on yes/no)
alter table habits add column if not exists question_config jsonb;

-- Per-checkin popup answers (1:1 with the checkin row)
alter table checkins add column if not exists answers jsonb;
