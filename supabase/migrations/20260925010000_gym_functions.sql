-- FAIXABJJ — gym functions and the triggers that keep every row in its gym
--
-- All security definer with search_path = '' for the reason given in
-- 20260911120000: they read tables whose policies call them, and a plain
-- function would recurse into its own RLS check.

-- The caller's gym, or null. Null for the platform superadmin (no person row),
-- for an account with no profile, and for a suspended gym — which is how
-- suspension hides a gym's data and refuses its writes from one place.
create or replace function public.current_gym_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.gym_id
  from public.person p
  join public.gym g on g.id = p.gym_id
  where p.auth_user_id = auth.uid()
    and g.status = 'active'
  limit 1;
$$;

-- The caller's gym status even when suspended, so the app can say "suspended"
-- instead of drawing empty pages.
create or replace function public.current_gym_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select g.status::text
  from public.person p
  join public.gym g on g.id = p.gym_id
  where p.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admin pa where pa.auth_user_id = auth.uid()
  );
$$;

-- Was a constant, now the caller's gym. Keeps its signature on purpose: every
-- reader of a session belongs to that session's gym (the restrictive policy
-- guarantees it), so the caller's timezone *is* the session's, and
-- session_checkin_open, session_overview and record_promotion keep working
-- unchanged. Stable, no longer immutable: it reads a table.
create or replace function public.gym_timezone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select g.timezone from public.gym g where g.id = public.current_gym_id()),
    'Europe/Rome'
  );
$$;

grant execute on function public.current_gym_id() to authenticated;
grant execute on function public.current_gym_status() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.gym_timezone() to authenticated;

-- The gym a referenced row belongs to. Internal to gym_scope(): not granted,
-- since it would let anyone map an id to a gym.
create or replace function public.gym_of(p_table text, p_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_id is null then
    return null;
  elsif p_table = 'person' then
    return (select gym_id from public.person where id = p_id);
  elsif p_table = 'course' then
    return (select gym_id from public.course where id = p_id);
  elsif p_table = 'class_session' then
    return (select gym_id from public.class_session where id = p_id);
  end if;
  raise exception 'gym_of: unknown table %', p_table;
end;
$$;

revoke execute on function public.gym_of(text, uuid) from public, anon, authenticated;

-- One trigger for every domain table:
--   1. fills gym_id from the caller's gym when the insert does not name one
--      (the service role names it; nobody else needs to). SQL that comes from
--      no API request at all — a migration, or a statement pasted into the SQL
--      Editor — falls back to the first gym, the one every pre-tenancy row
--      belongs to, so the seed migrations written before tenancy stay
--      replayable. Never for `person`: a replayed profile backfill must fail
--      loudly rather than drop the superadmin into a gym;
--   2. freezes it — a row never moves to another gym;
--   3. refuses a reference to a row of another gym. RLS checks the new row's
--      own gym_id, not the gym of the rows it points at, so without this an
--      attendance could name another gym's session.
-- Each table's columns are read only inside its own branch: plpgsql resolves
-- NEW's fields at run time, and naming a column another table lacks fails.
create or replace function public.gym_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.gym_id is null then
    new.gym_id := public.current_gym_id();

    if new.gym_id is null
       and tg_table_name <> 'person'
       and auth.uid() is null
       and coalesce(current_setting('request.jwt.claims', true), '') = '' then
      new.gym_id := (select g.id from public.gym g order by g.created_at limit 1);
    end if;
  end if;

  if new.gym_id is null then
    raise exception 'No gym for this row.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.gym_id is distinct from old.gym_id then
      raise exception 'A row cannot move to another gym.' using errcode = '42501';
    end if;
    -- The gym itself is being deleted and the cascade is nulling references
    -- on the way out; there is nothing left to be consistent with.
    if not exists (select 1 from public.gym g where g.id = new.gym_id) then
      return new;
    end if;
  end if;

  if tg_table_name in ('assigned_role', 'attendance', 'promotion') then
    if public.gym_of('person', new.person_id) is distinct from new.gym_id then
      raise exception 'Person belongs to another gym.' using errcode = '42501';
    end if;
  end if;

  if tg_table_name = 'attendance' then
    if public.gym_of('class_session', new.session_id) is distinct from new.gym_id then
      raise exception 'Session belongs to another gym.' using errcode = '42501';
    end if;
  end if;

  if tg_table_name = 'promotion' then
    if new.promoted_by is not null
       and public.gym_of('person', new.promoted_by) is distinct from new.gym_id then
      raise exception 'Promoter belongs to another gym.' using errcode = '42501';
    end if;
  end if;

  if tg_table_name = 'class_session' then
    if public.gym_of('course', new.course_id) is distinct from new.gym_id then
      raise exception 'Course belongs to another gym.' using errcode = '42501';
    end if;
  end if;

  if tg_table_name in ('course', 'class_session') then
    if new.instructor_id is not null
       and public.gym_of('person', new.instructor_id) is distinct from new.gym_id then
      raise exception 'Instructor belongs to another gym.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists gym_scope on public.person;
create trigger gym_scope before insert or update on public.person
  for each row execute function public.gym_scope();
drop trigger if exists gym_scope on public.assigned_role;
create trigger gym_scope before insert or update on public.assigned_role
  for each row execute function public.gym_scope();
drop trigger if exists gym_scope on public.role_threshold;
create trigger gym_scope before insert or update on public.role_threshold
  for each row execute function public.gym_scope();
drop trigger if exists gym_scope on public.attendance;
create trigger gym_scope before insert or update on public.attendance
  for each row execute function public.gym_scope();
drop trigger if exists gym_scope on public.promotion_criteria;
create trigger gym_scope before insert or update on public.promotion_criteria
  for each row execute function public.gym_scope();
drop trigger if exists gym_scope on public.course;
create trigger gym_scope before insert or update on public.course
  for each row execute function public.gym_scope();
drop trigger if exists gym_scope on public.class_session;
create trigger gym_scope before insert or update on public.class_session
  for each row execute function public.gym_scope();
drop trigger if exists gym_scope on public.promotion;
create trigger gym_scope before insert or update on public.promotion
  for each row execute function public.gym_scope();

-- A new gym starts with a copy of the default criteria, editable from
-- /members/criteria like any gym's. Definer: the superadmin who creates the
-- gym holds no rights on promotion_criteria.
create or replace function public.gym_seed_criteria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.promotion_criteria
    (gym_id, belt, stripe, min_hours, min_time_at_rank_days, min_age_years)
  select new.id, t.belt, t.stripe, t.min_hours, t.min_time_at_rank_days, t.min_age_years
  from public.promotion_criteria_template t
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists gym_seed_criteria on public.gym;
create trigger gym_seed_criteria after insert on public.gym
  for each row execute function public.gym_seed_criteria();

-- Every account belongs to exactly one gym, named in app_metadata by whoever
-- created it (a gym manager or the superadmin) — never in user_metadata, which
-- the user can edit. Without it no profile is made: that is the superadmin,
-- and the invite flow, which links its person row from the server action.
-- Linking to an account-less row with the same email stays, within the gym.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gym uuid;
  linked uuid;
begin
  v_gym := nullif(new.raw_app_meta_data ->> 'gym_id', '')::uuid;
  if v_gym is null then
    return new;
  end if;

  update public.person
     set auth_user_id = new.id
   where id = (
     select p.id
     from public.person p
     where p.auth_user_id is null
       and p.gym_id = v_gym
       and new.email is not null
       and lower(p.email) = lower(new.email)
     order by p.created_at
     limit 1
   )
  returning id into linked;

  if linked is null then
    insert into public.person (auth_user_id, full_name, email, gym_id)
    values (
      new.id,
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        split_part(coalesce(new.email, ''), '@', 1),
        'Nuovo utente'
      ),
      new.email,
      v_gym
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- Unchanged rule — a course with attendance can only be suspended — with one
-- exception: when the course's gym no longer exists, this delete is the
-- cascade of a gym deletion the superadmin confirmed, and refusing it would
-- make a suspended gym impossible to delete.
create or replace function public.guard_course_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.gym g where g.id = old.gym_id) then
    return old;
  end if;

  if exists (
    select 1
    from public.attendance a
    join public.class_session s on s.id = a.session_id
    where s.course_id = old.id
  ) then
    raise exception 'Il corso ha presenze registrate: puoi solo sospenderlo.'
      using errcode = 'restrict_violation';
  end if;

  return old;
end;
$$;
