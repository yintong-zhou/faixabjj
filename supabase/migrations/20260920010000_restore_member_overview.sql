-- Restores person_hours and member_overview to their final shape.
--
-- Why this file exists — the same fault as
-- 20260920000000_restore_current_access.sql, on the other side of the schema.
--
-- member_overview is defined in three migrations: 20260911140000 creates it,
-- 20260911200000 reshapes it around belt_since, and 20260912000000 gives it the
-- shape the app actually reads, with stripe_since and with total_hours counting
-- attendance rows instead of summing a duration column. person_hours is
-- likewise redefined by 20260912000000. Applied in name order that is correct,
-- but these files are pasted into the SQL Editor by hand, and re-pasting any of
-- the earlier ones on its own — as happened while making their statements
-- idempotent — reverts the view to a shape that predates the columns the app
-- selects.
--
-- The symptom is asymmetric, and worth recognising: the staff dashboard names
-- stripe_since in its select, so the request fails outright and every card
-- renders 0, as though the gym had no students; the Registro's list survives
-- because it selects *, and only the eligibility count and the green dots go
-- quiet. A dashboard of zeros and a working member list is this fault, not an
-- empty database.
--
-- This file sorts after all three, so it is the last word whatever order they
-- were applied in. It recreates both views verbatim from 20260912000000 rather
-- than editing an applied migration.
--
-- drop + create, not create or replace: replace cannot add, drop or rename a
-- column, which is exactly what is needed when the live view is the older
-- shape. member_overview is dropped first because it reads person_hours.

drop view if exists public.member_overview;
drop view if exists public.person_hours;

-- security_invoker is mandatory on every view in this project: without it the
-- view runs with its owner's privileges and hands every student the whole gym's
-- hours.
create view public.person_hours with (security_invoker = on) as
select
  person_id,
  count(*) filter (where present) as total_hours
from public.attendance
group by person_id;

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
