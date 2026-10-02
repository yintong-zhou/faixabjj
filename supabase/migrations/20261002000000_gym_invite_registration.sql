-- FAIXABJJ — gym invite link and self-registration awaiting approval
--
-- Spec: docs/superpowers/specs/2026-10-02-gym-invite-registration-design.md.
--
-- A manager shares one link per gym; whoever opens it signs up for that gym.
-- The account is created at once by the service role (app/join/actions.ts)
-- with app_metadata.pending_gym_id and no gym_id, so the auth trigger creates
-- no person row and current_gym_id() is null: the account sees nothing. The
-- request waits here until a user manager approves it (the gym goes into
-- app_metadata, the trigger creates the profile) or rejects it (the account is
-- deleted, the request goes with it).
--
-- Redefines login_email_for_username() (last: 20260930010000) so a pending
-- account signs in with its username too. Replay-safe.

-- The link. Its own table, not a column on gym: every member reads their own
-- gym row, and a student must not see the link. No backfill — a gym has no
-- link until a manager generates one.
create table if not exists public.gym_invite (
  gym_id uuid primary key references public.gym (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);

alter table public.gym_invite enable row level security;

drop policy if exists "user managers read the invite" on public.gym_invite;
create policy "user managers read the invite" on public.gym_invite for select to authenticated
  using (public.can_manage_users());

drop policy if exists "gym isolation" on public.gym_invite;
create policy "gym isolation" on public.gym_invite as restrictive for all to authenticated
  using (gym_id = (select public.current_gym_id()))
  with check (gym_id = (select public.current_gym_id()));

drop trigger if exists gym_scope on public.gym_invite;
create trigger gym_scope before insert or update on public.gym_invite
  for each row execute function public.gym_scope();

-- The requests. No insert or update policy: only the service role writes, after
-- checking the link; staff read and delete (reject) through RLS.
create table if not exists public.registration_request (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gym (id) on delete cascade,
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,30}$'),
  birth_date date not null,
  joined_at date not null,
  current_belt public.belt_rank not null default 'white',
  current_stripes smallint not null default 0 check (current_stripes between 0 and 4),
  rank_since date not null,
  stripe_since date not null,
  created_at timestamptz not null default now(),
  constraint registration_request_dates check (stripe_since >= rank_since)
);

alter table public.registration_request enable row level security;

drop policy if exists "user managers read requests" on public.registration_request;
create policy "user managers read requests" on public.registration_request for select to authenticated
  using (public.can_manage_users());

drop policy if exists "user managers delete requests" on public.registration_request;
create policy "user managers delete requests" on public.registration_request for delete to authenticated
  using (public.can_manage_users());

drop policy if exists "gym isolation" on public.registration_request;
create policy "gym isolation" on public.registration_request as restrictive for all to authenticated
  using (gym_id = (select public.current_gym_id()))
  with check (gym_id = (select public.current_gym_id()));

drop trigger if exists gym_scope on public.registration_request;
create trigger gym_scope before insert or update on public.registration_request
  for each row execute function public.gym_scope();

-- A username is unique across both tables: a pending athlete signs in with it,
-- so nobody else may take it meanwhile. Two unique indexes cannot span two
-- tables, so each side checks the other under an advisory lock on the name
-- (a concurrent writer of the same name waits, then sees the committed row).
-- The same account may hold it on both sides: that is approval moving it from
-- the request to the new profile. 23505, like the unique indexes, so callers
-- (claimUsername's retry loop, /account) treat it as "taken".
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

  if tg_table_name = 'person' then
    if exists (
      select 1 from public.registration_request r
      where r.username = new.username and r.auth_user_id is distinct from new.auth_user_id
    ) then
      raise exception 'Username already taken.' using errcode = '23505';
    end if;
  else
    if exists (
      select 1 from public.person p
      where p.username = new.username and p.auth_user_id is distinct from new.auth_user_id
    ) then
      raise exception 'Username already taken.' using errcode = '23505';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists username_cross_unique on public.person;
create trigger username_cross_unique before insert or update of username, auth_user_id on public.person
  for each row execute function public.username_cross_unique();

drop trigger if exists username_cross_unique on public.registration_request;
create trigger username_cross_unique before insert or update on public.registration_request
  for each row execute function public.username_cross_unique();

-- A user manager draws a new link for their own gym; the old one stops working
-- at once. Definer: nobody has a write policy on gym_invite. 64 hex characters
-- from two random UUIDs (gen_random_uuid is core Postgres, no extension needed).
create or replace function public.regenerate_invite_token()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_gym uuid := public.current_gym_id();
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if v_gym is null or not public.can_manage_users() then
    raise exception 'not allowed to manage the invite link' using errcode = '42501';
  end if;

  insert into public.gym_invite (gym_id, token)
  values (v_gym, v_token)
  on conflict (gym_id) do update set token = excluded.token, created_at = now();

  return v_token;
end;
$$;

revoke execute on function public.regenerate_invite_token() from public, anon;
grant execute on function public.regenerate_invite_token() to authenticated;

-- The public form's lookup: the gym of a link, only while that gym is active.
-- Service role only (utils/supabase/invite.ts); revoked from anon and
-- authenticated explicitly, because default privileges grant both execute.
create or replace function public.gym_for_invite(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.gym_id
  from public.gym_invite i
  join public.gym g on g.id = i.gym_id
  where i.token = p_token
    and g.status = 'active'
$$;

revoke all on function public.gym_for_invite(text) from public, anon, authenticated;
grant execute on function public.gym_for_invite(text) to service_role;

-- The form's live username check. Service role only, called by a server action
-- that first checks the link (app/join/actions.ts checkUsername).
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.person where username = p_username)
     and not exists (select 1 from public.registration_request where username = p_username)
$$;

revoke all on function public.username_available(text) from public, anon, authenticated;
grant execute on function public.username_available(text) to service_role;

-- The login's username lookup, now also for a pending account (which has no
-- person row yet). Still one statement, so found and not-found cost the same
-- round trip (see 20260930010000).
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
  ) a
  join auth.users u on u.id = a.auth_user_id
  limit 1
$$;

revoke all on function public.login_email_for_username(text) from public, anon, authenticated;
grant execute on function public.login_email_for_username(text) to service_role;
