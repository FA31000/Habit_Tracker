-- Some streak rows have a different user_id than the habit they belong to
-- (left over from an old login). The app can't update them, so they go stale.
-- This sets each streak's user_id to its habit's owner.
update streaks s
set user_id = h.user_id
from habits h
where s.habit_id = h.id
  and s.user_id <> h.user_id;
