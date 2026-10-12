-- Allow "na" (not applicable) as a check-in answer.
-- Run in: https://xkgukvmrdvkiwvcyrdop.supabase.co/project/default/sql/new

alter table checkins drop constraint if exists checkins_response_check;
alter table checkins add constraint checkins_response_check check (response in ('yes', 'no', 'freeze', 'na'));
