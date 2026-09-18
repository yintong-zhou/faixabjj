-- FAIXABJJ — narrower check-in window
--
-- The original defaults (60 minutes before the start, 30 after the end) left
-- consecutive lessons open at the same time: with classes at 18:00–19:00,
-- 19:00–20:00 and 20:00–21:30, a member standing there at 19:30 could check
-- into all three, and one attendance is one hour. The window is the only thing
-- standing between "I trained" and "I tapped a button", so it should be barely
-- wider than the lesson itself.
--
-- 15 minutes before the start is enough to check in while changing; closing at
-- the end means a member who forgot has to ask the instructor, which is the
-- correct escalation — the instructor's roll call is the authoritative record.

alter table public.course
  alter column checkin_opens_minutes_before set default 15;

alter table public.course
  alter column checkin_closes_minutes_after set default 0;

-- Courses created before this migration still carry the old window, so the
-- overlap this fixes would survive on every existing course. Only rows that
-- still hold the previous defaults are moved: a gym that deliberately set its
-- own margins keeps them.
update public.course
set checkin_opens_minutes_before = 15,
    checkin_closes_minutes_after = 0
where checkin_opens_minutes_before = 60
  and checkin_closes_minutes_after = 30;
