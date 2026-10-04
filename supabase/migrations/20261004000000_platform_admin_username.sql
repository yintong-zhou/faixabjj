-- FAIXABJJ — a username for the platform superadmin
--
-- The superadmin has no person row (see docs/claude/gyms.md), so until now it
-- had no username and signed in with its email only. Its username lives on its
-- own platform_admin row, under the same rules as everybody else's: lower case,
-- no `@`, unique across the whole platform — at login the account type is not
-- known any more than the gym is.
--
-- Redefines username_cross_unique() and username_available() (last:
-- 20261002000000) and login_email_for_username() (last: 20261002000000) only to
-- take platform_admin into account. Replay-safe.

alter table public.platform_admin add column if not exists username text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'platform_admin_username_format'
      and conrelid = 'public.platform_admin'::regclass
  ) then
    alter table public.platform_admin
      add constraint platform_admin_username_format
      check (username ~ '^[a-z0-9._-]{3,30}$');
  end if;
end;
$$;

create unique index if not exists platform_admin_username_unique
  on public.platform_admin (username)
  where username is not null;

-- Unique across the three tables that hold a username. Each side checks the
-- other two under an advisory lock on the name (a concurrent writer of the
-- same name waits, then sees the committed row). The same account may hold it
-- on two sides: that is approval moving it from a request to the new profile.
-- 23505, like the unique indexes, so every caller reads it as "taken".
create or replace function public.username_cross_unique()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.username is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.username is not distinct from old.username
     and new.auth_user_id is not distinct from old.auth_user_id then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('username:' || new.username));

  if (tg_table_name <> 'person' and exists (
        select 1 from public.person p
        where p.username = new.username and p.auth_user_id is distinct from new.auth_user_id))
     or (tg_table_name <> 'registration_request' and exists (
        select 1 from public.registration_request r
        where r.username = new.username and r.auth_user_id is distinct from new.auth_user_id))
     or (tg_table_name <> 'platform_admin' and exists (
        select 1 from public.platform_admin a
        where a.username = new.username and a.auth_user_id is distinct from new.auth_user_id))
  then
    raise exception 'Username already taken.' using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists username_cross_unique on public.platform_admin;
create trigger username_cross_unique before insert or update of username, auth_user_id on public.platform_admin
  for each row execute function public.username_cross_unique();

-- The superadmin's only write on its own row. platform_admin stays without an
-- update policy — the row is the superadmin grant itself, granted by hand — so
-- the username goes through this function, which touches that one column of
-- the caller's own row and nothing else. 42501 for anyone who is not one.
create or replace function public.set_platform_admin_username(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.platform_admin
     set username = p_username
   where auth_user_id = auth.uid();
  if not found then
    raise exception 'Only a platform superadmin can set this username.'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke all on function public.set_platform_admin_username(text) from public, anon;
grant execute on function public.set_platform_admin_username(text) to authenticated;

-- The invite form's live check, now also against the superadmin's name.
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.person where username = p_username)
     and not exists (select 1 from public.registration_request where username = p_username)
     and not exists (select 1 from public.platform_admin where username = p_username)
$$;

revoke all on function public.username_available(text) from public, anon, authenticated;
grant execute on function public.username_available(text) to service_role;

-- The login's username lookup, now also for the superadmin. Still one
-- statement, so found and not-found cost the same round trip (see
-- 20260930010000).
create or replace function public.login_email_for_username(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text
  from (
    select p.auth_user_id from public.person p where p.username = p_username
    union all
    select r.auth_user_id from public.registration_request r where r.username = p_username
    union all
    select a.auth_user_id from public.platform_admin a where a.username = p_username
  ) x
  join auth.users u on u.id = x.auth_user_id
  limit 1
$$;

revoke all on function public.login_email_for_username(text) from public, anon, authenticated;
grant execute on function public.login_email_for_username(text) to service_role;
