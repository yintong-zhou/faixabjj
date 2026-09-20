-- Read-only diagnosis for "a staff member is seeing the allievo view".
--
-- Run in the SQL Editor of project poksgledkecwviypspmi. It writes nothing.
--
-- getAccess() fails closed on purpose, so several different faults produce the
-- same screen: the RPC missing, the RPC present but stale, the grant missing,
-- or the person genuinely having no active role. These four queries tell them
-- apart. Start with the first — it is the one that has actually gone wrong.

-- 1. Does current_access() return all four flags?
-- `false` means an older three-flag definition is in place (see
-- 20260920000000_restore_current_access.sql). Everybody loses Corsi and the
-- gym dashboard while the Registro keeps working.
select prosrc like '%canManageClasses%' as has_four_flags
from pg_proc
where proname = 'current_access';

-- 1b. Is member_overview the final shape?
-- Expect 14 rows including stripe_since and total_hours, and no belt_since. An
-- older shape means an earlier migration was re-pasted over a later one (see
-- 20260920010000_restore_member_overview.sql): the staff dashboard renders
-- every card as 0 while the Registro's list keeps working.
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'member_overview'
order by ordinal_position;

-- 2. Do the predicates exist, and can `authenticated` execute them?
-- A missing row, or has_execute = false, is indistinguishable from having no
-- role as far as the app is concerned.
select
  p.proname,
  has_function_privilege('authenticated', p.oid, 'execute') as has_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'current_access',
    'current_person_id',
    'has_active_role',
    'can_view_registry',
    'can_edit_registry',
    'can_manage_users',
    'can_manage_classes'
  )
order by p.proname;

-- 3. Who currently holds an active role?
-- `end_date is null` is what makes an assignment active; a closed one grants
-- nothing.
select
  p.full_name,
  p.email,
  r.role,
  r.start_date,
  p.auth_user_id is not null as has_account
from assigned_role r
join person p on p.id = r.person_id
where r.end_date is null
order by r.role, p.full_name;

-- 4. Is the account linked to its registry row?
-- A person with auth_user_id null has no account, and an auth user with no
-- matching person row resolves to no roles at all — current_person_id()
-- returns null and every predicate is false.
select
  u.email,
  p.id as person_id,
  p.full_name
from auth.users u
left join person p on p.auth_user_id = u.id
order by u.email;
