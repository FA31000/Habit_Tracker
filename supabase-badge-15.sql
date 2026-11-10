-- Move the 14-day badge to 15 days. Run once in the Supabase SQL editor.
-- Safe to run before or after the code deploys, and safe to re-run.

begin;

-- 1. Earned badges. Habits whose longest streak reached 15 keep their badge
--    (same row, so earned_at, thumbs and comments survive), relabelled 15.
--    If the new code already inserted a 15 row for that habit, keep the older
--    14 row's history by dropping the fresh duplicate first.
delete from badges b15
using badges b14, streaks s
where b15.milestone_days = 15
  and b14.milestone_days = 14
  and b14.habit_id = b15.habit_id
  and s.habit_id = b14.habit_id
  and s.longest_streak >= 15;

update badges b
set milestone_days = 15
from streaks s
where b.milestone_days = 14
  and s.habit_id = b.habit_id
  and s.longest_streak >= 15;

--    Habits that stopped at exactly 14 have not earned 15 yet: remove the badge
--    (and its thumbs/comments). It is re-awarded when they reach 15.
delete from badges where milestone_days = 14;

-- 2. Shared multipliers: rename key "14" to "15".
update app_config
set config = jsonb_set(config, '{badgeMultipliers}',
  (config->'badgeMultipliers') - '14' || jsonb_build_object('15', config->'badgeMultipliers'->'14'))
where config->'badgeMultipliers' ? '14';

-- 3. Per-account overrides: same rename.
update user_bonus_config
set badge_multipliers = badge_multipliers - '14' || jsonb_build_object('15', badge_multipliers->'14')
where badge_multipliers ? '14';

commit;
