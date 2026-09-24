-- FAIXABJJ — what the platform superadmin can see, and the final current_access()
--
-- The superadmin holds no rights on any gym's records (the restrictive policy
-- in 20260925020000 gives them none). What they need is aggregates and the
-- list of a gym's managers, and nothing else — so these are functions that
-- answer only them, never views: a security_invoker view would count zero for
-- somebody who cannot read person, and a definer view would break this
-- project's rule that every view is security_invoker.

create or replace function public.gym_overview()
returns table (
  id uuid,
  name text,
  status text,
  timezone text,
  created_at timestamptz,
  active_people bigint,
  courses bigint,
  managers bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id,
    g.name,
    g.status::text,
    g.timezone,
    g.created_at,
    (select count(*) from public.person p
      where p.gym_id = g.id
        and exists (select 1 from public.assigned_role ar
                    where ar.person_id = p.id and ar.end_date is null)),
    (select count(*) from public.course c where c.gym_id = g.id),
    (select count(distinct ar.person_id) from public.assigned_role ar
      where ar.gym_id = g.id and ar.end_date is null and ar.role::text = 'admin')
  from public.gym g
  where public.is_platform_admin()
  order by g.name;
$$;

-- A gym's managers: its people whose active roles include admin. The only
-- people the superadmin ever sees, because they are the only ones the
-- superadmin acts on.
create or replace function public.gym_managers(p_gym_id uuid)
returns table (
  person_id uuid,
  full_name text,
  email text,
  auth_user_id uuid,
  since date
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.email, p.auth_user_id, min(ar.start_date)
  from public.person p
  join public.assigned_role ar on ar.person_id = p.id
  where public.is_platform_admin()
    and p.gym_id = p_gym_id
    and ar.end_date is null
    and ar.role::text = 'admin'
  group by p.id, p.full_name, p.email, p.auth_user_id
  order by p.full_name;
$$;

grant execute on function public.gym_overview() to authenticated;
grant execute on function public.gym_managers(uuid) to authenticated;

-- The final current_access(). This file sorts last in the multi-gym series,
-- so it is the definition that wins whatever was re-pasted before it — the
-- lesson of 20260920000000. A privilege added later goes in a new migration.
--
-- The four gym flags are false outside an active gym, so a suspended gym's
-- staff get no staff navigation on the "suspended" page.
create or replace function public.current_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'canViewRegistry', public.current_gym_id() is not null and public.can_view_registry(),
    'canEditRegistry', public.current_gym_id() is not null and public.can_edit_registry(),
    'canManageUsers', public.current_gym_id() is not null and public.can_manage_users(),
    'canManageClasses', public.current_gym_id() is not null and public.can_manage_classes(),
    'isPlatformAdmin', public.is_platform_admin(),
    'gymStatus', public.current_gym_status()
  );
$$;

grant execute on function public.current_person_id() to authenticated;
grant execute on function public.has_active_role(text[]) to authenticated;
grant execute on function public.can_view_registry() to authenticated;
grant execute on function public.can_edit_registry() to authenticated;
grant execute on function public.can_manage_users() to authenticated;
grant execute on function public.can_manage_classes() to authenticated;
grant execute on function public.current_access() to authenticated;

-- session_checkin_open() is security definer and, until now, read
-- class_session/course with no gym filter at all: given another gym's (or a
-- suspended gym's) session id, it answered for that session same as for the
-- caller's own. Restated here unchanged except for scoping the lookup to the
-- caller's own gym. The gym check moves into the selected expression, not the
-- WHERE clause, and the whole thing is wrapped in coalesce: a WHERE-clause
-- filter would make a cross-gym or suspended-gym lookup return no row at all,
-- i.e. null, and null is not the false this function's callers test for.
create or replace function public.session_checkin_open(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      s.gym_id = (select public.current_gym_id())
      and s.status = 'scheduled'
      and c.is_active
      and now() >= ((s.session_date + s.start_time) at time zone public.gym_timezone())
                   - make_interval(mins => c.checkin_opens_minutes_before)
      and now() <= ((s.session_date + s.end_time) at time zone public.gym_timezone())
                   + make_interval(mins => c.checkin_closes_minutes_after)
    from public.class_session s
    join public.course c on c.id = s.course_id
    where s.id = p_session_id
  ), false);
$$;

grant execute on function public.session_checkin_open(uuid) to authenticated;
