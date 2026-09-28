-- Apply only AFTER the app that calls check_in() is deployed: the app before
-- it checks members in with a direct insert, which this policy allowed.
--
-- From here on a member marks themselves present only through check_in()
-- (20260926000000), which enforces the distance from the gym. Staff keep
-- "class managers can insert attendance" for the roll call, and members keep
-- "members can undo their own check-in".
drop policy if exists "members can check themselves in" on public.attendance;
