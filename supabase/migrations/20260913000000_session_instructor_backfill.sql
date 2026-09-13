-- ---------------------------------------------------------------------------
-- Give a lesson that has no instructor of its own the course's default.
-- ---------------------------------------------------------------------------
-- Setting a course's instructor did nothing visible: sync_course_sessions()
-- copied `course.instructor_id` onto the sessions it *inserted* and left every
-- existing session alone, so a course whose lessons had already been generated
-- kept showing "nessun istruttore" in Presenze forever. The calendar is
-- normally generated the moment a course is created, which made that the usual
-- case rather than the edge case.
--
-- The fix keeps what the old behaviour was protecting — a substitution
-- recorded on a single lesson must survive a course edit — by only filling in
-- sessions whose instructor is null. A deliberate override is a non-null value
-- and is still never touched.
--
-- The consequence to be aware of: null now means "not set" rather than
-- "explicitly nobody", so clearing a single lesson's instructor from the roll
-- call will be re-filled from the course the next time the course is saved.
-- Distinguishing the two would need a separate "overridden" column, which is
-- not worth a table change for a case that is almost always an oversight — a
-- lesson with no instructor on a course that has one.
--
-- Only future sessions are touched here, as everywhere else in this file's
-- lineage: a lesson that already happened is a record, not a plan.

create or replace function public.sync_course_sessions(
  p_course_id uuid,
  p_dates date[]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_course public.course;
  v_inserted integer;
begin
  select * into v_course from public.course where id = p_course_id;
  if not found then
    raise exception 'Corso non trovato.' using errcode = 'no_data_found';
  end if;

  -- Superseded future sessions: a different start time, or a day no longer in
  -- the schedule. Past sessions are never touched, and a future session with
  -- attendance stays exactly as it is — somebody already checked in.
  delete from public.class_session s
  where s.course_id = p_course_id
    and s.session_date >= current_date
    and (
      s.start_time is distinct from v_course.start_time
      or not (s.session_date = any(p_dates))
    )
    and not exists (
      select 1 from public.attendance a where a.session_id = s.id
    );

  insert into public.class_session (
    course_id, session_date, start_time, end_time, instructor_id
  )
  select p_course_id, d, v_course.start_time, v_course.end_time, v_course.instructor_id
  from unnest(p_dates) as d
  on conflict (course_id, session_date, start_time) do nothing;

  get diagnostics v_inserted = row_count;

  -- Keep the end time of surviving future sessions in step with the course.
  update public.class_session s
  set end_time = v_course.end_time
  where s.course_id = p_course_id
    and s.session_date >= current_date
    and s.start_time = v_course.start_time
    and s.end_time is distinct from v_course.end_time;

  -- Adopt the course's instructor where the lesson has none. An explicit
  -- per-lesson instructor is non-null and stays as it is.
  update public.class_session s
  set instructor_id = v_course.instructor_id
  where s.course_id = p_course_id
    and s.session_date >= current_date
    and s.instructor_id is null
    and v_course.instructor_id is not null;

  return v_inserted;
end;
$$;

grant execute on function public.sync_course_sessions(uuid, date[]) to authenticated;

-- One-time catch-up for the courses that already have an instructor and
-- lessons generated before this migration. Without it the fix would only take
-- effect the next time somebody happened to save each course.
update public.class_session s
set instructor_id = c.instructor_id
from public.course c
where c.id = s.course_id
  and s.session_date >= current_date
  and s.instructor_id is null
  and c.instructor_id is not null;
