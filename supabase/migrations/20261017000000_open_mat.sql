-- Open mat: a one-off lesson on a day picked by the instructor.
--
-- Held as a course of one day (starts_on = ends_on, one session) rather than a
-- class_session without a course: check-in window, roll call, hours, the
-- delete guard and gym scoping all already hang off course, and none of them
-- has to learn a second shape. The flag only keeps these one-day courses off
-- /courses, where editing one would re-sync it as a recurring rule.
--
-- One attendance is still one hour: an open mat adds no new way of counting.

alter table public.course
  add column if not exists is_open_mat boolean not null default false;

-- Same columns as 20260912010000, is_open_mat appended (replace may add a
-- column at the end, never reorder). security_invoker kept, grants survive.
create or replace view public.course_overview with (security_invoker = on) as
select
  c.id,
  c.name,
  c.description,
  c.weekdays,
  c.start_time,
  c.end_time,
  c.starts_on,
  c.ends_on,
  c.instructor_id,
  c.is_active,
  c.checkin_opens_minutes_before,
  c.checkin_closes_minutes_after,
  p.full_name as instructor_name,
  (
    select count(*)
    from public.class_session s
    where s.course_id = c.id
      and s.session_date >= current_date
      and s.status = 'scheduled'
  ) as upcoming_sessions,
  c.is_open_mat
from public.course c
left join public.person p on p.id = c.instructor_id;

grant select on public.course_overview to authenticated;
