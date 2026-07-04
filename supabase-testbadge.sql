-- TEMPORARY: insert one test badge on Hadrien's first habit so we can
-- verify thumbs-up and comments. Delete it after testing (see cleanup below).
insert into badges (habit_id, user_id, milestone_days)
select id, user_id, 5
from habits
where user_id = 'c68b4e8a-c94c-48f0-a9d9-ba660af3bd5a'
order by created_at
limit 1
on conflict (habit_id, milestone_days) do nothing;
