-- FAIXABJJ — role-based access
--
-- Replaces the flat "every authenticated user is trusted staff" model from
-- 20260910120000 with the access levels the user actually wants:
--
--   student   — no access to the registry or attendance; sees only their own
--               profile and their own records
--   assistant — same as student for these purposes (explicitly decided)
--   instructor— read-only on the registry and attendance
--   head_coach— full access
--   admin     — full access (new role, for whoever runs the portal)
--
-- Only head_coach and admin manage accounts. This *narrows* the previous
-- definition of can_manage_users(), which included instructor.

-- ---------------------------------------------------------------------------
-- 1. The new 'admin' role
-- ---------------------------------------------------------------------------

-- Postgres forbids using a freshly added enum value in the same transaction
-- that adds it, so nothing below writes 'admin'::person_role as a literal —
-- every check compares role::text instead. Keep it that way if you edit these
-- functions, or the migration stops being replayable from scratch.
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'person_role' and e.enumlabel = 'admin'
  ) then
    alter type public.person_role add value 'admin';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Access predicates
-- ---------------------------------------------------------------------------
-- All security definer with search_path = '' for the same reason as
-- can_manage_users(): they read the very tables whose policies call them, so a
-- plain function would recurse into its own RLS check.

-- The caller's row in the registry — the anchor for every "is this mine?" test.
create or replace function public.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.person p where p.auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.has_active_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.person p
    join public.assigned_role ar on ar.person_id = p.id
    where p.auth_user_id = auth.uid()
      and ar.end_date is null
      and ar.role::text = any(roles)
  );
$$;

-- Registro and Presenze are visible to technical staff only. An allievo (and,
-- by explicit decision, an assistente) never sees them.
create or replace function public.can_view_registry()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_active_role(array['instructor', 'head_coach', 'admin']);
$$;

-- Instructors look but do not touch: writing is for maestro/admin.
create or replace function public.can_edit_registry()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_active_role(array['head_coach', 'admin']);
$$;

-- Narrowed: instructor is no longer a user manager.
create or replace function public.can_manage_users()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_active_role(array['head_coach', 'admin']);
$$;

-- One round trip for the three flags the UI needs, instead of three RPCs.
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
    'canManageUsers', public.can_manage_users()
  );
$$;

grant execute on function public.current_person_id() to authenticated;
grant execute on function public.has_active_role(text[]) to authenticated;
grant execute on function public.can_view_registry() to authenticated;
grant execute on function public.can_edit_registry() to authenticated;
grant execute on function public.can_manage_users() to authenticated;
grant execute on function public.current_access() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. person
-- ---------------------------------------------------------------------------
-- Everyone keeps access to their *own* row — that is what /account reads and
-- writes — but only staff sees anybody else's.

drop policy if exists "authenticated can select person" on public.person;
create policy "staff or self can select person" on public.person
  for select to authenticated
  using (public.can_view_registry() or auth_user_id = auth.uid());

drop policy if exists "authenticated can insert person" on public.person;
-- The self case keeps getOrCreateProfile()'s fallback working for an account
-- whose trigger-created row is missing; it can only ever create its own.
create policy "editors or self can insert person" on public.person
  for insert to authenticated
  with check (public.can_edit_registry() or auth_user_id = auth.uid());

drop policy if exists "authenticated can update person" on public.person;
create policy "editors or self can update person" on public.person
  for update to authenticated
  using (public.can_edit_registry() or auth_user_id = auth.uid())
  with check (public.can_edit_registry() or auth_user_id = auth.uid());

-- Delete policy is unchanged from 20260911000000 (manager only), but
-- can_manage_users() above no longer includes instructor.

-- ---------------------------------------------------------------------------
-- 4. attendance
-- ---------------------------------------------------------------------------
-- A student may read their own attendance (the dashboard is built on it) and
-- nothing else. Writing is maestro/admin only — an instructor is read-only.

drop policy if exists "authenticated can select attendance" on public.attendance;
create policy "staff or self can select attendance" on public.attendance
  for select to authenticated
  using (public.can_view_registry() or person_id = public.current_person_id());

drop policy if exists "authenticated can insert attendance" on public.attendance;
create policy "editors can insert attendance" on public.attendance
  for insert to authenticated with check (public.can_edit_registry());

drop policy if exists "authenticated can update attendance" on public.attendance;
create policy "editors can update attendance" on public.attendance
  for update to authenticated
  using (public.can_edit_registry()) with check (public.can_edit_registry());

drop policy if exists "authenticated can delete attendance" on public.attendance;
create policy "editors can delete attendance" on public.attendance
  for delete to authenticated using (public.can_edit_registry());

-- ---------------------------------------------------------------------------
-- 5. assigned_role
-- ---------------------------------------------------------------------------
-- Reading your own roles is what /account shows; writing stays manager-only
-- (the anti-self-promotion rule from 20260911000000).

drop policy if exists "authenticated can select assigned_role" on public.assigned_role;
create policy "staff or self can select assigned_role" on public.assigned_role
  for select to authenticated
  using (public.can_view_registry() or person_id = public.current_person_id());

-- ---------------------------------------------------------------------------
-- 6. Reference tables
-- ---------------------------------------------------------------------------
-- role_threshold and promotion_criteria are configuration, not personal data:
-- readable by any signed-in user, writable by maestro/admin.

drop policy if exists "authenticated can insert role_threshold" on public.role_threshold;
create policy "editors can insert role_threshold" on public.role_threshold
  for insert to authenticated with check (public.can_edit_registry());

drop policy if exists "authenticated can update role_threshold" on public.role_threshold;
create policy "editors can update role_threshold" on public.role_threshold
  for update to authenticated
  using (public.can_edit_registry()) with check (public.can_edit_registry());

drop policy if exists "authenticated can delete role_threshold" on public.role_threshold;
create policy "editors can delete role_threshold" on public.role_threshold
  for delete to authenticated using (public.can_edit_registry());

drop policy if exists "authenticated can insert promotion_criteria" on public.promotion_criteria;
create policy "editors can insert promotion_criteria" on public.promotion_criteria
  for insert to authenticated with check (public.can_edit_registry());

drop policy if exists "authenticated can update promotion_criteria" on public.promotion_criteria;
create policy "editors can update promotion_criteria" on public.promotion_criteria
  for update to authenticated
  using (public.can_edit_registry()) with check (public.can_edit_registry());

drop policy if exists "authenticated can delete promotion_criteria" on public.promotion_criteria;
create policy "editors can delete promotion_criteria" on public.promotion_criteria
  for delete to authenticated using (public.can_edit_registry());

-- ---------------------------------------------------------------------------
-- 7. Freeze the columns a member must not set on themselves
-- ---------------------------------------------------------------------------
-- Now that a student can update their own `person` row, the RLS policy alone
-- would let a crafted request set current_belt = 'black'. Promotion is an
-- instructor decision and never self-service, so the rank columns join
-- auth_user_id in the guard.

create or replace function public.guard_person_auth_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.uid() is null for the service role and for the FK's own ON DELETE SET
  -- NULL cascade, both trusted server-side paths; the guard only applies to a
  -- request carrying an end user's JWT.
  if auth.uid() is null then
    return new;
  end if;

  if new.auth_user_id is distinct from old.auth_user_id
     and not public.can_manage_users()
  then
    raise exception
      'Solo un maestro o un admin può cambiare l''account collegato a una persona.'
      using errcode = 'insufficient_privilege';
  end if;

  if (new.current_belt is distinct from old.current_belt
      or new.current_stripes is distinct from old.current_stripes
      or new.rank_since is distinct from old.rank_since)
     and not public.can_edit_registry()
  then
    raise exception
      'Cintura e gradi possono essere modificati solo da un maestro o da un admin.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bootstrap reminder
-- ---------------------------------------------------------------------------
-- If you have not promoted your own account yet, do it now — after this
-- migration an account with no active role is treated as an allievo and sees
-- neither Registro nor Presenze nor the user management area:
--
--   insert into public.assigned_role (person_id, role)
--   select p.id, 'head_coach'::public.person_role
--   from public.person p
--   where p.email = 'tua.email@esempio.it'
--   on conflict do nothing;
--
-- Use 'admin' instead of 'head_coach' for someone who runs the portal without
-- teaching. Left commented on purpose: a migration that silently grants
-- privileges is a privilege grant hiding in a schema change.
