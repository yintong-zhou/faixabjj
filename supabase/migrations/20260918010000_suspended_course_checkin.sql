-- FAIXABJJ — suspending a course actually stops it
--
-- `is_active` only ever described the course. The lessons it had already
-- generated stayed `scheduled`, kept appearing in the calendar, and kept
-- accepting check-in: suspending a course changed nothing a member could see.
--
-- The fix makes the flag authoritative rather than deleting anything. Rows
-- survive, so reactivating a course brings its calendar straight back — and a
-- suspension is exactly the reversible act that must not destroy the schedule.
-- Past lessons of a suspended course are untouched in every sense: they
-- happened, their attendance is history, and the roll call still opens.

-- ---------------------------------------------------------------------------
-- 1. Check-in follows the course
-- ---------------------------------------------------------------------------
create or replace function public.session_checkin_open(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.status = 'scheduled'
    and c.is_active
    and now() >= ((s.session_date + s.start_time) at time zone public.gym_timezone())
                 - make_interval(mins => c.checkin_opens_minutes_before)
    and now() <= ((s.session_date + s.end_time) at time zone public.gym_timezone())
                 + make_interval(mins => c.checkin_closes_minutes_after)
  from public.class_session s
  join public.course c on c.id = s.course_id
  where s.id = p_session_id;
$$;

-- ---------------------------------------------------------------------------
-- 2. The calendar can tell a suspended course from a running one
-- ---------------------------------------------------------------------------
-- Exposed as a column rather than filtered inside the view: the app hides the
-- future lessons of a suspended course but still has to render the past ones,
-- and a view that decided that itself would leave no way to reach them.
drop view if exists public.session_overview;
create view public.session_overview with (security_invoker = on) as
select
  s.id,
  s.course_id,
  c.name as course_name,
  c.is_active as course_active,
  s.session_date,
  s.start_time,
  s.end_time,
  s.status,
  s.notes,
  s.instructor_id,
  p.full_name as instructor_name,
  ((s.session_date + s.start_time) at time zone public.gym_timezone()) as starts_at,
  ((s.session_date + s.end_time) at time zone public.gym_timezone()) as ends_at,
  ((s.session_date + s.start_time) at time zone public.gym_timezone())
    - make_interval(mins => c.checkin_opens_minutes_before) as checkin_opens_at,
  ((s.session_date + s.end_time) at time zone public.gym_timezone())
    + make_interval(mins => c.checkin_closes_minutes_after) as checkin_closes_at,
  (select count(*) from public.attendance a where a.session_id = s.id and a.present)
    as present_count
from public.class_session s
join public.course c on c.id = s.course_id
left join public.person p on p.id = s.instructor_id;

grant select on public.session_overview to authenticated;
