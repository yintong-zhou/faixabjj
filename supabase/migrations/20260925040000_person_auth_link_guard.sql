-- FAIXABJJ — who may point a person row at an auth account
--
-- person.auth_user_id is the proof every service-role action relies on: "this
-- account is one of my gym's people" is answered by finding a person row of the
-- caller's gym linked to it. Until now any registry editor could write that
-- column — insert a person with somebody else's auth_user_id, or re-point an
-- existing row — and so make any account look like one of theirs: another
-- gym's member, or the platform superadmin, who has no person row by design.
-- The service-role actions then reset that account's password or delete it.
--
-- Two rules, enforced here because RLS sees only the new row's own gym:
--   1. an end user (a request carrying a JWT whose role is not service_role)
--      may set auth_user_id only to their own account, or to null. That keeps
--      the lazy self-insert of getOrCreateProfile, and revokeAccess / the FK's
--      ON DELETE SET NULL. The trusted paths carry no end-user JWT: the
--      service role (inviteToPortal's link), the auth.users trigger
--      handle_new_auth_user (GoTrue, no claims) and SQL with no API request.
--   2. nobody — service role and SQL Editor included — links a person row to
--      a platform superadmin. The superadmin sits outside every gym.
-- On UPDATE both apply only when the value changes, so editing any other
-- column of a row is unaffected.
--
-- The JWT role is read the way Supabase's own auth.role() reads it. A request
-- with a subject but no role claim is treated as an end user: it can only be
-- one.
create or replace function public.guard_person_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if new.auth_user_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.auth_user_id is not distinct from old.auth_user_id then
    return new;
  end if;

  if exists (select 1 from public.platform_admin pa where pa.auth_user_id = new.auth_user_id) then
    raise exception 'A platform administrator cannot be linked to a person.'
      using errcode = '42501';
  end if;

  v_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    case when auth.uid() is not null then 'authenticated' end
  );

  if v_role is not null
     and v_role <> 'service_role'
     and new.auth_user_id is distinct from auth.uid() then
    raise exception 'Only your own account can be linked to a person.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_person_auth_user on public.person;
create trigger guard_person_auth_user before insert or update on public.person
  for each row execute function public.guard_person_auth_user();

-- The account side of the same proof. The account actions also check that the
-- target account names the caller's gym in its own app_metadata, which only
-- the service role writes. Accounts created before tenancy carry no gym_id
-- there, so they take it from the person row they are already linked to.
-- Guarded on the key being absent: re-running changes nothing, and an account
-- that already names a gym is never rewritten. A platform superadmin is left
-- alone: it belongs to no gym (bootstrap-platform-admin.sql strips the key).
update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
                           || jsonb_build_object('gym_id', p.gym_id::text)
  from public.person p
 where p.auth_user_id = u.id
   and not (coalesce(u.raw_app_meta_data, '{}'::jsonb) ? 'gym_id')
   and not exists (select 1 from public.platform_admin pa where pa.auth_user_id = u.id);
