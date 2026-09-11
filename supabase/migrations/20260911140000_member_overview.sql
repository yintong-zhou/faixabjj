-- FAIXABJJ — member overview for the Registro
--
-- The Registro lists every member with their active roles and accumulated
-- hours. Doing that from the client would mean one query per person for the
-- roles and another for the hours, and it would make filtering by role
-- impossible to paginate correctly. A view flattens it into one row per
-- person, so the page can filter, sort, count and page in a single request.

-- ---------------------------------------------------------------------------
-- Security note — read before adding any other view to this project
-- ---------------------------------------------------------------------------
-- A Postgres view runs with the privileges of its *owner* unless
-- security_invoker is on, which means it silently bypasses the Row Level
-- Security of the tables it reads. `person_hours` was created in
-- 20260910000000 without it, so any authenticated user — an allievo
-- included — could read every member's total hours straight from the view,
-- even though the `attendance` policies forbid reading anyone else's rows.
-- That is fixed here.
alter view public.person_hours set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- member_overview
-- ---------------------------------------------------------------------------
-- security_invoker = on: the view is evaluated as the calling user, so the
-- `person` policies apply unchanged. Staff see everyone; an allievo querying
-- this view sees only their own row. The view adds no privileges of its own.
create or replace view public.member_overview
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
  coalesce(roles.active_roles, array[]::text[]) as active_roles,
  -- "Active" means the person still holds at least one role; someone whose
  -- assignments have all been closed is a former member.
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

grant select on public.member_overview to authenticated;
