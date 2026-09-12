-- FAIXABJJ — access and behaviour for the class schedule
--
-- Instructors get full write on courses, sessions and attendance — they teach
-- the classes, they record them. That is deliberately NOT can_edit_registry():
-- an instructor still must not change anybody's belt. Two privileges, two
-- predicates.

-- ---------------------------------------------------------------------------
-- 1. Predicates
-- ---------------------------------------------------------------------------
-- security definer with an empty search_path, like the existing predicates:
-- they read the very tables whose policies call them, so a plain function
-- would recurse into its own RLS check.
create or replace function public.can_manage_classes()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_active_role(array['instructor', 'head_coach', 'admin']);
$$;

create or replace function public.current_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'canViewRegistry', public.can_view_registry(),
    'canEditRegistry', public.can_edit_registry(),
    'canManageUsers', public.can_manage_users(),
    'canManageClasses', public.can_manage_classes()
  );
$$;

-- The gym's wall clock, written once. `session_date + start_time` is a naive
-- timestamp; comparing it against now() without this conversion opens check-in
-- an hour early under DST.
create or replace function public.gym_timezone()
returns text
language sql
immutable
as $$
  select 'Europe/Rome';
$$;

create or replace function public.session_checkin_open(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.status = 'scheduled'
    and now() >= ((s.session_date + s.start_time) at time zone public.gym_timezone())
                 - make_interval(mins => c.checkin_opens_minutes_before)
    and now() <= ((s.session_date + s.end_time) at time zone public.gym_timezone())
                 + make_interval(mins => c.checkin_closes_minutes_after)
  from public.class_session s
  join public.course c on c.id = s.course_id
  where s.id = p_session_id;
$$;

grant execute on function public.can_manage_classes() to authenticated;
grant execute on function public.gym_timezone() to authenticated;
grant execute on function public.session_checkin_open(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. course and class_session policies
-- ---------------------------------------------------------------------------
-- Everyone signed in reads the calendar — a student cannot check in to a
-- lesson they cannot see. Writing is technical staff only.
drop policy if exists "authenticated can select course" on public.course;
create policy "authenticated can select course" on public.course
  for select to authenticated using (true);

drop policy if exists "class managers can insert course" on public.course;
create policy "class managers can insert course" on public.course
  for insert to authenticated with check (public.can_manage_classes());

drop policy if exists "class managers can update course" on public.course;
create policy "class managers can update course" on public.course
  for update to authenticated
  using (public.can_manage_classes()) with check (public.can_manage_classes());

drop policy if exists "class managers can delete course" on public.course;
create policy "class managers can delete course" on public.course
  for delete to authenticated using (public.can_manage_classes());

drop policy if exists "authenticated can select class_session" on public.class_session;
create policy "authenticated can select class_session" on public.class_session
  for select to authenticated using (true);

drop policy if exists "class managers can insert class_session" on public.class_session;
create policy "class managers can insert class_session" on public.class_session
  for insert to authenticated with check (public.can_manage_classes());

drop policy if exists "class managers can update class_session" on public.class_session;
create policy "class managers can update class_session" on public.class_session
  for update to authenticated
  using (public.can_manage_classes()) with check (public.can_manage_classes());

drop policy if exists "class managers can delete class_session" on public.class_session;
create policy "class managers can delete class_session" on public.class_session
  for delete to authenticated using (public.can_manage_classes());

-- ---------------------------------------------------------------------------
-- 3. attendance policies
-- ---------------------------------------------------------------------------
-- Writing moves from can_edit_registry() (maestro/admin) to
-- can_manage_classes(), which adds the instructor.
drop policy if exists "editors can insert attendance" on public.attendance;
drop policy if exists "editors can update attendance" on public.attendance;
drop policy if exists "editors can delete attendance" on public.attendance;

drop policy if exists "class managers can insert attendance" on public.attendance;
create policy "class managers can insert attendance" on public.attendance
  for insert to authenticated with check (public.can_manage_classes());

drop policy if exists "class managers can update attendance" on public.attendance;
create policy "class managers can update attendance" on public.attendance
  for update to authenticated
  using (public.can_manage_classes()) with check (public.can_manage_classes());

drop policy if exists "class managers can delete attendance" on public.attendance;
create policy "class managers can delete attendance" on public.attendance
  for delete to authenticated using (public.can_manage_classes());

-- Student check-in. Four conditions together, and permissive policies OR, so
-- this widens nothing for staff. A student may only mark themselves, only
-- present, only as 'self', and only while the window is open.
drop policy if exists "members can check themselves in" on public.attendance;
create policy "members can check themselves in" on public.attendance
  for insert to authenticated with check (
    person_id = public.current_person_id()
    and present
    and checked_in_by = 'self'
    and public.session_checkin_open(session_id)
  );

-- Undoing a check-in is allowed while the window is open — wrong class, it
-- happens. A row created by staff is not theirs to remove.
drop policy if exists "members can undo their own check-in" on public.attendance;
create policy "members can undo their own check-in" on public.attendance
  for delete to authenticated using (
    person_id = public.current_person_id()
    and checked_in_by = 'self'
    and public.session_checkin_open(session_id)
  );

-- ---------------------------------------------------------------------------
-- 4. Deleting a course must not erase attendance
-- ---------------------------------------------------------------------------
-- class_session cascades from course and attendance cascades from session, so
-- a plain delete would silently take the gym's hours with it. Same rule as
-- revoking portal access: the records survive the administrative act. In a
-- trigger rather than in the server action, because the service-role key
-- bypasses RLS entirely.
create or replace function public.guard_course_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.attendance a
    join public.class_session s on s.id = a.session_id
    where s.course_id = old.id
  ) then
    raise exception 'Il corso ha presenze registrate: puoi solo sospenderlo.'
      using errcode = 'restrict_violation';
  end if;

  return old;
end;
$$;

drop trigger if exists course_guard_delete on public.course;
create trigger course_guard_delete
before delete on public.course
for each row execute function public.guard_course_delete();

-- ---------------------------------------------------------------------------
-- 5. Session generation
-- ---------------------------------------------------------------------------
-- The weekday arithmetic lives in TypeScript (utils/schedule.ts, unit-tested)
-- and arrives here as a list of dates. What SQL does is the part only SQL can
-- do atomically: drop future sessions the new schedule supersedes, but only
-- where nobody has been recorded yet, then insert the rest.
--
-- security invoker: the inserts and deletes below run under the caller's own
-- policies, so a student calling this changes nothing.
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

  -- Keep the end time of surviving future sessions in step with the course;
  -- the instructor is left alone, since it may have been overridden on purpose
  -- for a single lesson.
  update public.class_session s
  set end_time = v_course.end_time
  where s.course_id = p_course_id
    and s.session_date >= current_date
    and s.start_time = v_course.start_time
    and s.end_time is distinct from v_course.end_time;

  return v_inserted;
end;
$$;

grant execute on function public.sync_course_sessions(uuid, date[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Views
-- ---------------------------------------------------------------------------
-- session_overview does the timezone maths once, so no JavaScript ever has to.
-- present_count respects the caller's own attendance policy (security_invoker),
-- which means a student sees only their own row counted — the UI shows the
-- count to staff only.
drop view if exists public.session_overview;
create view public.session_overview with (security_invoker = on) as
select
  s.id,
  s.course_id,
  c.name as course_name,
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

drop view if exists public.course_overview;
create view public.course_overview with (security_invoker = on) as
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
  ) as upcoming_sessions
from public.course c
left join public.person p on p.id = c.instructor_id;

grant select on public.session_overview to authenticated;
grant select on public.course_overview to authenticated;
