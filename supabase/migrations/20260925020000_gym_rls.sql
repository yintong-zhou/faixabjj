-- FAIXABJJ — gym isolation
--
-- One RESTRICTIVE policy per domain table. Postgres ANDs restrictive policies
-- with the permissive ones, so every existing rule becomes "what it was, and
-- only inside the caller's gym" without being rewritten — and a policy added
-- later is covered the moment it exists, which a hand-rewritten list could
-- never promise. With current_gym_id() null (superadmin, no profile, suspended
-- gym) nothing passes.
--
-- `(select …)` so the planner evaluates the function once per statement, not
-- once per row.

drop policy if exists "gym isolation" on public.person;
create policy "gym isolation" on public.person as restrictive for all to authenticated
  using (gym_id = (select public.current_gym_id()))
  with check (gym_id = (select public.current_gym_id()));

drop policy if exists "gym isolation" on public.assigned_role;
create policy "gym isolation" on public.assigned_role as restrictive for all to authenticated
  using (gym_id = (select public.current_gym_id()))
  with check (gym_id = (select public.current_gym_id()));

drop policy if exists "gym isolation" on public.role_threshold;
create policy "gym isolation" on public.role_threshold as restrictive for all to authenticated
  using (gym_id = (select public.current_gym_id()))
  with check (gym_id = (select public.current_gym_id()));

drop policy if exists "gym isolation" on public.attendance;
create policy "gym isolation" on public.attendance as restrictive for all to authenticated
  using (gym_id = (select public.current_gym_id()))
  with check (gym_id = (select public.current_gym_id()));

drop policy if exists "gym isolation" on public.promotion_criteria;
create policy "gym isolation" on public.promotion_criteria as restrictive for all to authenticated
  using (gym_id = (select public.current_gym_id()))
  with check (gym_id = (select public.current_gym_id()));

drop policy if exists "gym isolation" on public.course;
create policy "gym isolation" on public.course as restrictive for all to authenticated
  using (gym_id = (select public.current_gym_id()))
  with check (gym_id = (select public.current_gym_id()));

drop policy if exists "gym isolation" on public.class_session;
create policy "gym isolation" on public.class_session as restrictive for all to authenticated
  using (gym_id = (select public.current_gym_id()))
  with check (gym_id = (select public.current_gym_id()));

drop policy if exists "gym isolation" on public.promotion;
create policy "gym isolation" on public.promotion as restrictive for all to authenticated
  using (gym_id = (select public.current_gym_id()))
  with check (gym_id = (select public.current_gym_id()));

-- gym: the superadmin manages every gym; a member reads their own, for its
-- name in the header and the settings the hours are computed from.
alter table public.gym enable row level security;

drop policy if exists "platform admins manage gyms" on public.gym;
create policy "platform admins manage gyms" on public.gym for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "members read their own gym" on public.gym;
create policy "members read their own gym" on public.gym for select to authenticated
  using (id = (select public.current_gym_id()));

-- platform_admin: read your own row, write nothing. Granted by hand only.
alter table public.platform_admin enable row level security;

drop policy if exists "platform admins read themselves" on public.platform_admin;
create policy "platform admins read themselves" on public.platform_admin for select to authenticated
  using (auth_user_id = auth.uid());

-- The template is read only by gym_seed_criteria() (definer). No policy:
-- default-deny for everybody else.
alter table public.promotion_criteria_template enable row level security;
