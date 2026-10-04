-- FAIXABJJ — the platform superadmin's dashboard: activity, as counts only
--
-- The superadmin sits outside every gym and the platform is the gyms' data
-- processor (docs/claude/gyms.md): it never reads a member, an attendance row
-- or a promotion. These two functions answer it with aggregates — how many
-- lessons, how many presences, when the last lesson was — and nothing that
-- names or tells apart a person. Like gym_overview(), they are security
-- definer and return no rows to anybody who is not a platform admin.
--
-- Dates are each session's own `session_date`, the gym-local day of the
-- lesson, so no timezone conversion is involved. A presence counts as on the
-- gym's own dashboard chart: present, on a lesson that was not cancelled.
-- Replay-safe.

-- Per gym, over the last p_days days up to today (1–366, default 30). Joined
-- in the app to gym_overview() by id, which already carries name, status and
-- the head counts.
create or replace function public.platform_gym_activity(p_days integer default 30)
returns table (
  gym_id uuid,
  lessons_held bigint,
  presences bigint,
  self_checkins bigint,
  last_lesson date,
  pending_requests bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with win as (
    select current_date - (greatest(1, least(coalesce(p_days, 30), 366)) - 1) as since
  ),
  present as (
    select a.gym_id, a.session_id, a.checked_in_by, s.session_date
    from public.attendance a
    join public.class_session s on s.id = a.session_id
    where a.present
      and s.status <> 'cancelled'
      and s.session_date <= current_date
  )
  select
    g.id,
    (select count(distinct p.session_id) from present p, win
      where p.gym_id = g.id and p.session_date >= win.since),
    (select count(*) from present p, win
      where p.gym_id = g.id and p.session_date >= win.since),
    (select count(*) from present p, win
      where p.gym_id = g.id and p.session_date >= win.since and p.checked_in_by = 'self'),
    (select max(p.session_date) from present p where p.gym_id = g.id),
    (select count(*) from public.registration_request r where r.gym_id = g.id)
  from public.gym g
  where public.is_platform_admin();
$$;

-- Presences across every gym, one row per week (Monday first), the last
-- p_weeks weeks (1–52, default 12) ending with the current one. Weeks with no
-- presence are returned as zero, so the chart has no gaps.
create or replace function public.platform_weekly_presences(p_weeks integer default 12)
returns table (
  week_start date,
  presences bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with weeks as (
    select generate_series(
      date_trunc('week', current_date)
        - make_interval(weeks => greatest(1, least(coalesce(p_weeks, 12), 52)) - 1),
      date_trunc('week', current_date),
      interval '7 days'
    )::date as week_start
  )
  select
    w.week_start,
    (select count(*)
       from public.attendance a
       join public.class_session s on s.id = a.session_id
      where a.present
        and s.session_date >= w.week_start
        and s.session_date < w.week_start + 7
        and s.status <> 'cancelled'
        and s.session_date <= current_date)
  from weeks w
  where public.is_platform_admin()
  order by w.week_start;
$$;

revoke all on function public.platform_gym_activity(integer) from public, anon;
revoke all on function public.platform_weekly_presences(integer) from public, anon;
grant execute on function public.platform_gym_activity(integer) to authenticated;
grant execute on function public.platform_weekly_presences(integer) to authenticated;
