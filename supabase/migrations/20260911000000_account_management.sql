-- FAIXABJJ — account management
--
-- Three things happen here:
--   1. every auth user gets a `person` row (the profile), created automatically
--      on signup and backfilled for users that already exist;
--   2. a `can_manage_users()` predicate that answers "is the current user an
--      admin/maestro?", derived from the roles already modelled in
--      `assigned_role` rather than from a second, parallel role concept;
--   3. the privileged operations are narrowed to that predicate.
--
-- Context for (3): the earlier policies in 20260910120000 treat every
-- authenticated user as trusted staff. That stays true for reading and for
-- editing the registry, but the user explicitly asked that only an admin or a
-- maestro may delete other users, so the destructive paths are tightened.

-- ---------------------------------------------------------------------------
-- 1. Profile provisioning
-- ---------------------------------------------------------------------------

-- Runs as the definer so it can write to `person` from the auth schema's
-- trigger context, where the caller has no RLS-visible identity yet.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.person (auth_user_id, full_name, email)
  values (
    new.id,
    -- Fall back to the local part of the email so `full_name` (not null) is
    -- always satisfied; the user renames themselves from /account.
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1),
      'Nuovo utente'
    ),
    new.email
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Backfill: accounts created before this migration have no profile yet.
insert into public.person (auth_user_id, full_name, email)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(u.email, ''), '@', 1),
    'Nuovo utente'
  ),
  u.email
from auth.users u
where not exists (
  select 1 from public.person p where p.auth_user_id = u.id
)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Who may manage users
-- ---------------------------------------------------------------------------

-- "Admin o maestro" == an *active* instructor / head_coach assignment.
-- security definer because the function has to read `person` and
-- `assigned_role` in order to evaluate the very policies that guard those
-- tables — a plain function would recurse into its own RLS check.
-- `search_path = ''` forces every name below to be schema-qualified, which is
-- what makes a definer function safe to expose.
create or replace function public.can_manage_users()
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
      and ar.role in ('instructor'::public.person_role, 'head_coach'::public.person_role)
  );
$$;

grant execute on function public.can_manage_users() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Narrow the privileged operations
-- ---------------------------------------------------------------------------

-- Deleting a person is now a manager-only action.
drop policy if exists "authenticated can delete person" on public.person;
create policy "user managers can delete person" on public.person
  for delete to authenticated using (public.can_manage_users());

-- Writing to `assigned_role` has to be manager-only as well, otherwise the
-- restriction above is decorative: any authenticated user could insert an
-- active 'head_coach' assignment for themselves and become a manager on the
-- spot. Reading stays open to all staff.
drop policy if exists "authenticated can insert assigned_role" on public.assigned_role;
create policy "user managers can insert assigned_role" on public.assigned_role
  for insert to authenticated with check (public.can_manage_users());

drop policy if exists "authenticated can update assigned_role" on public.assigned_role;
create policy "user managers can update assigned_role" on public.assigned_role
  for update to authenticated
  using (public.can_manage_users())
  with check (public.can_manage_users());

drop policy if exists "authenticated can delete assigned_role" on public.assigned_role;
create policy "user managers can delete assigned_role" on public.assigned_role
  for delete to authenticated using (public.can_manage_users());

-- The other escalation path: `person.auth_user_id` is what ties an account to
-- its roles, so repointing the head coach's profile at your own account would
-- hand you their privileges. Staff may still edit every other column of any
-- person (that is the existing "trusted staff" model) — only this link is
-- frozen.
create or replace function public.guard_person_auth_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.uid() is null for the service role and for the FK's own ON DELETE SET
  -- NULL cascade, both of which are trusted server-side paths; the guard only
  -- applies to a request carrying an end user's JWT.
  if auth.uid() is not null
     and new.auth_user_id is distinct from old.auth_user_id
     and not public.can_manage_users()
  then
    raise exception
      'Solo un istruttore o un maestro può cambiare l''account collegato a una persona.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists person_guard_auth_link on public.person;
create trigger person_guard_auth_link
before update on public.person
for each row execute function public.guard_person_auth_link();

-- ---------------------------------------------------------------------------
-- Bootstrap — run once, by hand
-- ---------------------------------------------------------------------------
-- Nobody has a role yet, so right after applying this migration *no* account
-- can manage users and /account/utenti is unreachable for everyone. Promote
-- the first account by running the statement below in the SQL Editor with your
-- own email, then reload the app.
--
--   insert into public.assigned_role (person_id, role)
--   select p.id, 'head_coach'::public.person_role
--   from public.person p
--   where p.email = 'tua.email@esempio.it'
--   on conflict do nothing;
--
-- It is left commented on purpose: a migration that silently promotes someone
-- is a privilege grant hiding in a schema change.
