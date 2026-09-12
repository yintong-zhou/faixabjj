-- FAIXABJJ — class schedule
--
-- Adds the recurring `course` and the concrete `class_session` it generates,
-- and moves `attendance` from "one row per person per day" to "one row per
-- person per session". The old shape could not express a member training twice
-- in one evening, which the hour count has to be able to record.

create type class_status as enum ('scheduled', 'cancelled');
create type checkin_source as enum ('self', 'staff');

-- ---------------------------------------------------------------------------
-- course — the recurring rule, not a lesson
-- ---------------------------------------------------------------------------
-- One course carries a single time slot across several weekdays. A course that
-- runs at different times on different days is two courses; that trade buys us
-- one table instead of two.
create table course (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  -- ISO weekday numbers: 1 = Monday … 7 = Sunday.
  weekdays smallint[] not null default '{}',
  start_time time not null,
  end_time time not null,
  starts_on date not null default current_date,
  ends_on date,
  instructor_id uuid references person (id) on delete set null,
  is_active boolean not null default true,
  -- The check-in window, per course rather than global: it is the only
  -- per-course policy in the design, and a one-row settings table to hold two
  -- integers is more structure than the problem deserves.
  checkin_opens_minutes_before integer not null default 60
    check (checkin_opens_minutes_before between 0 and 1440),
  checkin_closes_minutes_after integer not null default 30
    check (checkin_closes_minutes_after between 0 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_times_check check (end_time > start_time),
  constraint course_dates_check check (ends_on is null or ends_on >= starts_on),
  constraint course_weekdays_check check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[])
);

create trigger course_set_updated_at
before update on course
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- class_session — the lesson that actually happens
-- ---------------------------------------------------------------------------
-- Times are copied from the course at generation instead of being read through
-- it, so editing a course never silently rewrites lessons that already
-- happened. The unique key is what makes generation idempotent.
create table class_session (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references course (id) on delete cascade,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  instructor_id uuid references person (id) on delete set null,
  status class_status not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now(),
  unique (course_id, session_date, start_time),
  constraint class_session_times_check check (end_time > start_time)
);

create index class_session_date_idx on class_session (session_date);
create index class_session_course_id_idx on class_session (course_id);

-- ---------------------------------------------------------------------------
-- attendance — rewired onto sessions
-- ---------------------------------------------------------------------------
alter table attendance add column session_id uuid references class_session (id) on delete cascade;
-- Records who created the row. A row the member made themselves is one they
-- may still undo; a row the staff made is not.
alter table attendance add column checked_in_by checkin_source not null default 'staff';

-- Existing rows predate the calendar and have no session. Park them under an
-- inactive course so no hour of anybody's history is lost. Almost certainly a
-- no-op: no attendance UI has ever shipped.
do $$
declare
  legacy_course uuid;
begin
  if exists (select 1 from attendance) then
    insert into course (name, description, weekdays, start_time, end_time, is_active)
    values (
      'Lezioni storiche',
      'Presenze registrate prima del calendario dei corsi.',
      '{}', '00:00', '01:00', false
    )
    returning id into legacy_course;

    insert into class_session (course_id, session_date, start_time, end_time, instructor_id)
    select distinct legacy_course, a.class_date, '00:00'::time, '01:00'::time, a.led_by
    from attendance a;

    update attendance a
    set session_id = s.id
    from class_session s
    where s.course_id = legacy_course
      and s.session_date = a.class_date
      and s.instructor_id is not distinct from a.led_by;
  end if;
end
$$;

alter table attendance alter column session_id set not null;

-- "One per person per day" is exactly the rule that has to go: two classes in
-- one evening are two hours.
alter table attendance drop constraint attendance_person_id_class_date_key;
alter table attendance add constraint attendance_person_session_key unique (person_id, session_id);

-- Both views read columns that are about to disappear, so they come down
-- first: person_hours sums duration_hours, and member_overview reads
-- person_hours. Postgres refuses the column drops while they exist. Both are
-- recreated at the bottom of this file.
drop view if exists public.member_overview;
drop view if exists public.person_hours;

-- The session carries the date and the instructor now.
drop index if exists attendance_class_date_idx;
drop index if exists attendance_led_by_idx;
alter table attendance drop column class_date;
alter table attendance drop column led_by;

-- One attendance is one hour, full stop. A defaulted duration column would let
-- a crafted write store 2 and turn the rule into a convention.
alter table attendance drop column duration_hours;

create index attendance_session_id_idx on attendance (session_id);

-- ---------------------------------------------------------------------------
-- person_hours — now a count, not a sum
-- ---------------------------------------------------------------------------
-- security_invoker is mandatory: without it the view runs with its owner's
-- privileges and hands every student the whole gym's hours.
create view public.person_hours with (security_invoker = on) as
select
  person_id,
  count(*) filter (where present) as total_hours
from public.attendance
group by person_id;

-- Recreated verbatim from 20260911220000_stripe_since.sql. Only the meaning of
-- total_hours changed underneath it: one hour per attendance instead of a sum
-- of durations.
create view public.member_overview
with (security_invoker = on)
as
select
  p.id,
  p.auth_user_id,
  p.full_name,
  p.email,
  p.phone,
  p.birth_date,
  p.joined_at,
  p.current_belt,
  p.current_stripes,
  p.rank_since,
  p.stripe_since,
  coalesce(roles.active_roles, array[]::text[]) as active_roles,
  coalesce(array_length(roles.active_roles, 1), 0) > 0 as is_active,
  coalesce(hours.total_hours, 0)::numeric as total_hours
from public.person p
left join lateral (
  select array_agg(ar.role::text order by ar.role::text) as active_roles
  from public.assigned_role ar
  where ar.person_id = p.id
    and ar.end_date is null
) roles on true
left join public.person_hours hours on hours.person_id = p.id;

grant select on public.person_hours to authenticated;
grant select on public.member_overview to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security — enabled here, policies in the follow-up migration
-- ---------------------------------------------------------------------------
alter table course enable row level security;
alter table class_session enable row level security;
