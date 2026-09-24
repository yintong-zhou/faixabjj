-- Tenant isolation tests. Throwaway database only (replay.sh --isolation):
-- this file creates gyms and users and deletes a gym.
--
-- Users (fixed ids so the checks can name them):
--   a1 admin of gym A (ASD Little Gym)   a2 student of gym A
--   b1 admin of gym B                    b2 student of gym B
--   s0 platform superadmin, in no gym

select set_config('test.gym_a', (select id::text from public.gym order by created_at limit 1), false);
insert into public.gym (id, name) values ('00000000-0000-0000-0000-00000000000b', 'Test Gym B');
select set_config('test.gym_b', '00000000-0000-0000-0000-00000000000b', false);

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test', jsonb_build_object('gym_id', current_setting('test.gym_a'))),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test', jsonb_build_object('gym_id', current_setting('test.gym_a'))),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test', jsonb_build_object('gym_id', current_setting('test.gym_b'))),
  ('00000000-0000-0000-0000-0000000000b2', 'b2@test', jsonb_build_object('gym_id', current_setting('test.gym_b'))),
  ('00000000-0000-0000-0000-0000000000f0', 's0@test', '{}'::jsonb);

insert into public.platform_admin (auth_user_id) values ('00000000-0000-0000-0000-0000000000f0');

insert into public.assigned_role (person_id, role, gym_id)
select p.id, (case when p.email like '%1@test' then 'admin' else 'student' end)::person_role, p.gym_id
from public.person p where p.email like '%@test';

-- Corso B's check-in window is widened to +/-1440 minutes (24h) so session
-- …05cc below is open at whatever instant replay.sh happens to run, in either
-- direction: the container runs in UTC, the window is read in Europe/Rome
-- (public.gym_timezone()), and the default 15/0-minute window would close for
-- 1-2 hours a day depending on the gap between the two — closed for reasons
-- that have nothing to do with tenancy, which T5 and T13 must not depend on.
insert into public.course (id, name, weekdays, start_time, end_time, gym_id, checkin_opens_minutes_before, checkin_closes_minutes_after) values
  ('00000000-0000-0000-0000-0000000000ca', 'Corso A', '{1}', '19:00', '20:00', current_setting('test.gym_a')::uuid, 15, 0),
  ('00000000-0000-0000-0000-0000000000cb', 'Corso B', '{1}', '19:00', '20:00', current_setting('test.gym_b')::uuid, 1440, 1440);
insert into public.class_session (id, course_id, session_date, start_time, end_time, gym_id) values
  ('00000000-0000-0000-0000-0000000005aa', '00000000-0000-0000-0000-0000000000ca', current_date, '19:00', '20:00', current_setting('test.gym_a')::uuid),
  ('00000000-0000-0000-0000-0000000005bb', '00000000-0000-0000-0000-0000000000cb', current_date, '19:00', '20:00', current_setting('test.gym_b')::uuid),
  -- A second session of gym B, spanning the whole day and (via Corso B's wide
  -- window above) open at whatever instant replay.sh runs. Used by T5 and T13
  -- so that a genuinely-open session of gym B is what a2/a1 are refused —
  -- each block's positive control proves it is actually open.
  ('00000000-0000-0000-0000-0000000005cc', '00000000-0000-0000-0000-0000000000cb', current_date, '00:00', '23:59:59', current_setting('test.gym_b')::uuid);
insert into public.attendance (person_id, session_id, present, gym_id)
select p.id, '00000000-0000-0000-0000-0000000005bb', true, p.gym_id
from public.person p where p.email = 'b2@test';

-- Setup checks, as postgres.
do $$ begin
  if (select count(*) from public.person where email like '%@test') <> 4 then
    raise exception 'FAIL setup: expected 4 gym profiles, the superadmin must have none';
  end if;
  if (select count(*) from public.promotion_criteria where gym_id = current_setting('test.gym_b')::uuid)
     <> (select count(*) from public.promotion_criteria_template) then
    raise exception 'FAIL T10: a new gym must start with a copy of the default criteria';
  end if;
end $$;

-- T1–T6 as a1, admin of gym A.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$ begin
  if exists (select 1 from public.person where gym_id <> current_setting('test.gym_a')::uuid) then
    raise exception 'FAIL T1: a1 reads people of another gym';
  end if;
  if (select count(*) from public.person where email like '%@test') <> 2 then
    raise exception 'FAIL T1: a1 should read exactly the 2 test people of gym A';
  end if;
  -- Profiles are named after the email's local part by the auth trigger.
  if exists (select 1 from public.member_overview where full_name in ('b1', 'b2')) then
    raise exception 'FAIL T1: member_overview leaks another gym';
  end if;
  if exists (select 1 from public.course where id = '00000000-0000-0000-0000-0000000000cb')
     or exists (select 1 from public.class_session where id = '00000000-0000-0000-0000-0000000005bb')
     or exists (select 1 from public.attendance where session_id = '00000000-0000-0000-0000-0000000005bb') then
    raise exception 'FAIL T1: a1 reads courses, sessions or attendance of gym B';
  end if;
  if exists (select 1 from public.gym where id = current_setting('test.gym_b')::uuid) then
    raise exception 'FAIL T9: a1 reads the row of gym B';
  end if;
  if exists (select 1 from public.gym_overview()) then
    raise exception 'FAIL T9: gym_overview() answers a non-superadmin';
  end if;
  if exists (select 1 from public.gym_managers(current_setting('test.gym_b')::uuid)) then
    raise exception 'FAIL T9: gym_managers() answers a non-superadmin';
  end if;
  if (select public.current_access() ->> 'isPlatformAdmin') is distinct from 'false'
     or (select public.current_access() ->> 'gymStatus') is distinct from 'active'
     or (select public.current_access() ->> 'canManageUsers') is distinct from 'true' then
    raise exception 'FAIL: current_access() for a1 is %', public.current_access();
  end if;
end $$;

do $$ begin
  begin
    insert into public.course (name, weekdays, start_time, end_time, gym_id)
    values ('Intruso', '{2}', '10:00', '11:00', current_setting('test.gym_b')::uuid);
    raise exception 'FAIL T2: a1 created a course in gym B';
  exception when insufficient_privilege then null;
  end;

  insert into public.course (name, weekdays, start_time, end_time)
  values ('Nuovo A', '{2}', '10:00', '11:00');
  if (select gym_id from public.course where name = 'Nuovo A') <> current_setting('test.gym_a')::uuid then
    raise exception 'FAIL T3: gym_id was not filled with the caller''s gym';
  end if;

  begin
    insert into public.gym (name) values ('Palestra abusiva');
    raise exception 'FAIL T9: a1 created a gym';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.course set gym_id = current_setting('test.gym_b')::uuid where name = 'Nuovo A';
    raise exception 'FAIL T6: gym_id changed';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- T4: a cross-gym reference is refused even when the attacker knows the id.
-- The id of b2 is read as postgres and handed over in a setting.
select set_config('test.b2', (select id::text from public.person where email = 'b2@test'), false);
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$ begin
  begin
    insert into public.assigned_role (person_id, role) values (current_setting('test.b2')::uuid, 'instructor');
    raise exception 'FAIL T4: a1 gave a role to a person of gym B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.promotion (person_id, from_belt, from_stripes, to_belt, to_stripes)
    values (current_setting('test.b2')::uuid, 'white', 0, 'white', 1);
    raise exception 'FAIL T4: a1 recorded a promotion for a person of gym B';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- T14: person.auth_user_id cannot be forged. It is the proof the service-role
-- account actions rely on, so a manager who could point a row of their own gym
-- at somebody else's account could reset its password or delete it.
-- Fixtures, as postgres: b3, an account of gym B with no person row (an
-- invitee not yet linked); c0, an account with no gym at all; and an
-- account-less person of gym A to re-point.
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000b3', 'b3@other', jsonb_build_object('gym_id', current_setting('test.gym_b'))),
  ('00000000-0000-0000-0000-0000000000c0', 'c0@other', '{}'::jsonb);
delete from public.person where auth_user_id = '00000000-0000-0000-0000-0000000000b3';
insert into public.person (id, full_name, gym_id) values
  ('00000000-0000-0000-0000-00000000fa11', 'Senza account', current_setting('test.gym_a')::uuid);

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_rows int;
begin
  begin
    insert into public.person (full_name, auth_user_id) values ('Falso', '00000000-0000-0000-0000-0000000000f0');
    raise exception 'FAIL T14: a1 inserted a person linked to the superadmin';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.person (full_name, auth_user_id) values ('Falso', '00000000-0000-0000-0000-0000000000c0');
    raise exception 'FAIL T14: a1 inserted a person linked to an account that is not theirs';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.person set auth_user_id = '00000000-0000-0000-0000-0000000000b3'
    where id = '00000000-0000-0000-0000-00000000fa11';
    raise exception 'FAIL T14: a1 linked a person to an account of gym B';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.person set auth_user_id = '00000000-0000-0000-0000-0000000000f0'
    where id = '00000000-0000-0000-0000-00000000fa11';
    raise exception 'FAIL T14: a1 linked a person to the superadmin';
  exception when insufficient_privilege then null;
  end;

  -- Positive control: clearing the link (revokeAccess, the FK's ON DELETE SET
  -- NULL) still works for an end user.
  update public.person set auth_user_id = null where email = 'a2@test';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'FAIL T14: control failed — a1 could not clear a2''s account link';
  end if;
  -- Editing any other column of a linked row is untouched by the guard.
  update public.person set notes = 'ok' where email = 'a1@test';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'FAIL T14: control failed — a1 could not edit their own row';
  end if;
end $$;
rollback;

-- T14, positive control: the self-insert of getOrCreateProfile — an end user's
-- JWT, auth_user_id = auth.uid(). Run as postgres with c0's claims, not under
-- `set role authenticated`: under RLS no account without a person row can
-- insert one any more (no current gym), so this isolates the guard itself.
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c0', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c0","role":"authenticated"}', true);
do $$
declare
  v_id uuid;
begin
  insert into public.person (full_name, auth_user_id, gym_id)
  values ('c0', '00000000-0000-0000-0000-0000000000c0', current_setting('test.gym_a')::uuid)
  returning id into v_id;
  if v_id is null then
    raise exception 'FAIL T14: control failed — a self-insert was refused';
  end if;
end $$;
rollback;

-- T14, service role: it may link any account (inviteToPortal) — except the
-- superadmin, which nobody may link.
begin;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_rows int;
begin
  begin
    update public.person set auth_user_id = '00000000-0000-0000-0000-0000000000f0'
    where id = '00000000-0000-0000-0000-00000000fa11';
    raise exception 'FAIL T14: the service role linked a person to the superadmin';
  exception when insufficient_privilege then null;
  end;
  update public.person set auth_user_id = '00000000-0000-0000-0000-0000000000c0'
  where id = '00000000-0000-0000-0000-00000000fa11';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'FAIL T14: control failed — the service role could not link an invitee';
  end if;
end $$;
rollback;

-- T14, no API request at all (a migration, the SQL Editor): still no superadmin.
do $$ begin
  begin
    update public.person set auth_user_id = '00000000-0000-0000-0000-0000000000f0'
    where id = '00000000-0000-0000-0000-00000000fa11';
    raise exception 'FAIL T14: plain SQL linked a person to the superadmin';
  exception when insufficient_privilege then null;
  end;
end $$;
delete from public.person where id = '00000000-0000-0000-0000-00000000fa11';

-- T5: a2 cannot check in to a session of gym B. Uses …05cc, not …05bb: its
-- window is open at whatever instant replay.sh runs (see Corso B above). The
-- positive control proves b2 (gym B, its own session, gym B has no location)
-- can check in to …05cc through check_in(), so the refusal that follows can
-- only be the gym.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
do $$ begin
  if public.check_in('00000000-0000-0000-0000-0000000005cc') ->> 'result' is distinct from 'ok' then
    raise exception 'FAIL T5: control failed — b2 could not check in to …05cc in their own gym: %',
      public.check_in('00000000-0000-0000-0000-0000000005cc');
  end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
do $$ begin
  if public.check_in('00000000-0000-0000-0000-0000000005cc') ->> 'result' is distinct from 'closed' then
    raise exception 'FAIL T5: a2 checked in to a session of gym B';
  end if;
  if exists (select 1 from public.attendance where session_id = '00000000-0000-0000-0000-0000000005cc') then
    raise exception 'FAIL T5: a2 wrote attendance on a session of gym B';
  end if;
end $$;
rollback;

-- T16: check-in near the gym. Gym B gets a position (Milan, Duomo) inside the
-- transaction, as postgres, then b2 checks in to the open session …05cc.
begin;
update public.gym set latitude = 45.4642, longitude = 9.1900 where id = current_setting('test.gym_b')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
do $$
declare
  v jsonb;
begin
  -- One degree of longitude on the equator is 111 195 m (R = 6 371 000 m).
  if abs(public.gym_distance_m(0, 0, 0, 1) - 111195) > 1 then
    raise exception 'FAIL T16: gym_distance_m(0,0,0,1) = %', public.gym_distance_m(0, 0, 0, 1);
  end if;

  -- The direct insert is gone: check_in() is the only way to mark yourself.
  begin
    insert into public.attendance (person_id, session_id, present, checked_in_by)
    values (public.current_person_id(), '00000000-0000-0000-0000-0000000005cc', true, 'self');
    raise exception 'FAIL T16: a member inserted their own attendance directly';
  exception when insufficient_privilege then null;
  end;

  v := public.check_in('00000000-0000-0000-0000-0000000005cc');
  if v ->> 'result' is distinct from 'location_needed' then
    raise exception 'FAIL T16: no coordinates, gym with a position: expected location_needed, got %', v;
  end if;

  v := public.check_in('00000000-0000-0000-0000-0000000005cc', 200, 9.19, 10);
  if v ->> 'result' is distinct from 'location_needed' then
    raise exception 'FAIL T16: latitude 200: expected location_needed, got %', v;
  end if;

  v := public.check_in('00000000-0000-0000-0000-0000000005cc', 45.4642, 9.19, 150);
  if v ->> 'result' is distinct from 'imprecise' then
    raise exception 'FAIL T16: accuracy 150 m: expected imprecise, got %', v;
  end if;

  v := public.check_in('00000000-0000-0000-0000-0000000005cc', 45.4642, 9.19, null);
  if v ->> 'result' is distinct from 'imprecise' then
    raise exception 'FAIL T16: no accuracy: expected imprecise, got %', v;
  end if;

  -- 0.001 degrees of latitude north: about 111 m.
  v := public.check_in('00000000-0000-0000-0000-0000000005cc', 45.4652, 9.19, 10);
  if v ->> 'result' is distinct from 'too_far'
     or (v ->> 'distance_m')::int not between 100 and 120 then
    raise exception 'FAIL T16: 111 m away: expected too_far with distance ~111, got %', v;
  end if;

  -- 0.0002 degrees north: about 22 m.
  v := public.check_in('00000000-0000-0000-0000-0000000005cc', 45.4644, 9.19, 20);
  if v ->> 'result' is distinct from 'ok' then
    raise exception 'FAIL T16: 22 m away: expected ok, got %', v;
  end if;

  v := public.check_in('00000000-0000-0000-0000-0000000005cc', 45.4644, 9.19, 20);
  if v ->> 'result' is distinct from 'already' then
    raise exception 'FAIL T16: second check-in: expected already, got %', v;
  end if;

  if (select count(*) from public.attendance
       where session_id = '00000000-0000-0000-0000-0000000005cc'
         and person_id = public.current_person_id()
         and present and checked_in_by = 'self') <> 1 then
    raise exception 'FAIL T16: expected exactly one self check-in row for b2';
  end if;

  -- The undo policy is untouched.
  delete from public.attendance
   where session_id = '00000000-0000-0000-0000-0000000005cc' and person_id = public.current_person_id();
  if found is false then
    raise exception 'FAIL T16: b2 could not undo their own check-in';
  end if;
end $$;
rollback;

-- T16: set_gym_location(). A student is refused; the manager of gym B sets
-- gym B only; a half pair is refused by the constraint.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
do $$ begin
  begin
    perform public.set_gym_location(45.1, 9.1);
    raise exception 'FAIL T16: a student set the gym location';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$ begin
  perform public.set_gym_location(45.1, 9.1);
  if (select latitude from public.gym where id = current_setting('test.gym_b')::uuid) is distinct from 45.1 then
    raise exception 'FAIL T16: the manager of gym B could not set its location';
  end if;
  begin
    perform public.set_gym_location(45.1, null);
    raise exception 'FAIL T16: a latitude without a longitude was stored';
  exception when check_violation then null;
  end;
  perform public.set_gym_location(null, null);
  if (select latitude from public.gym where id = current_setting('test.gym_b')::uuid) is not null then
    raise exception 'FAIL T16: null, null did not clear the location';
  end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.set_gym_location(1, 1);
reset role;
do $$ begin
  if (select latitude from public.gym where id = current_setting('test.gym_b')::uuid) is not null then
    raise exception 'FAIL T16: the manager of gym A changed the location of gym B';
  end if;
  if (select latitude from public.gym where id = current_setting('test.gym_a')::uuid) is distinct from 1 then
    raise exception 'FAIL T16: the manager of gym A could not set their own location';
  end if;
end $$;
rollback;

-- T13: session_checkin_open() does not leak another gym's session, even to a
-- caller who names its id directly and even though the function is security
-- definer and would otherwise read class_session/course with no gym filter.
-- The positive control below (b1, gym B's own admin, while gym B is still
-- active) proves …05cc is genuinely open, so a1's false further down can only
-- be the gym check — not a closed window.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$ begin
  if public.session_checkin_open('00000000-0000-0000-0000-0000000005cc') is distinct from true then
    raise exception 'FAIL T13: control failed — …05cc should be open for gym B''s own b1, got %',
      public.session_checkin_open('00000000-0000-0000-0000-0000000005cc');
  end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$ begin
  if public.session_checkin_open('00000000-0000-0000-0000-0000000005cc') is distinct from false then
    raise exception 'FAIL T13: session_checkin_open() answered true for a session of gym B';
  end if;
end $$;
rollback;

-- T7: the superadmin sees gyms and aggregates, never people.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f0', true);
do $$ begin
  if exists (select 1 from public.person) or exists (select 1 from public.attendance)
     or exists (select 1 from public.promotion) or exists (select 1 from public.assigned_role) then
    raise exception 'FAIL T7: the superadmin reads gym records';
  end if;
  if (select count(*) from public.gym) <> 2 then
    raise exception 'FAIL T7: the superadmin should read both gyms';
  end if;
  if (select count(*) from public.gym_overview()) <> 2 then
    raise exception 'FAIL T7: gym_overview() should list both gyms';
  end if;
  if (select managers from public.gym_overview() where id = current_setting('test.gym_b')::uuid) <> 1
     or (select active_people from public.gym_overview() where id = current_setting('test.gym_b')::uuid) <> 2 then
    raise exception 'FAIL T7: wrong aggregates for gym B';
  end if;
  if (select count(*) from public.gym_managers(current_setting('test.gym_b')::uuid)) <> 1
     or (select email from public.gym_managers(current_setting('test.gym_b')::uuid)) <> 'b1@test' then
    raise exception 'FAIL T7: gym_managers() should return b1 only';
  end if;
  if (select public.current_access() ->> 'isPlatformAdmin') is distinct from 'true'
     or (select public.current_access() ->> 'canViewRegistry') is distinct from 'false' then
    raise exception 'FAIL T7: current_access() for the superadmin is %', public.current_access();
  end if;
  -- The first-gym fallback is for SQL with no API request only: a signed-in
  -- caller with no gym gets no gym, and the write is refused.
  begin
    insert into public.course (name, weekdays, start_time, end_time) values ('X', '{1}', '10:00', '11:00');
    raise exception 'FAIL T7: the superadmin wrote a course without a gym';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.gym set status = 'suspended' where id = current_setting('test.gym_b')::uuid;
commit;

-- T8: a suspended gym sees nothing and writes nothing, and knows it is suspended.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$ begin
  if exists (select 1 from public.person) or exists (select 1 from public.course) then
    raise exception 'FAIL T8: a suspended gym still reads its data';
  end if;
  if (select public.current_access() ->> 'gymStatus') is distinct from 'suspended'
     or (select public.current_access() ->> 'canManageUsers') is distinct from 'false' then
    raise exception 'FAIL T8: current_access() for b1 is %', public.current_access();
  end if;
  begin
    insert into public.course (name, weekdays, start_time, end_time) values ('X', '{1}', '10:00', '11:00');
    raise exception 'FAIL T8: a suspended gym wrote a course';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- T12: deleting a course with attendance directly is still refused.
do $$ begin
  begin
    delete from public.course where id = '00000000-0000-0000-0000-0000000000cb';
    raise exception 'FAIL T12: a course with attendance was deleted directly';
  exception when restrict_violation then null;
  end;
end $$;

-- T11: deleting gym B, as the superadmin, removes all of it and nothing of A.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f0', true);
delete from public.gym where id = current_setting('test.gym_b')::uuid;
commit;

do $$ begin
  if exists (select 1 from public.person where gym_id = current_setting('test.gym_b')::uuid)
     or exists (select 1 from public.course where gym_id = current_setting('test.gym_b')::uuid)
     or exists (select 1 from public.attendance where gym_id = current_setting('test.gym_b')::uuid)
     or exists (select 1 from public.promotion_criteria where gym_id = current_setting('test.gym_b')::uuid) then
    raise exception 'FAIL T11: rows of the deleted gym survived';
  end if;
  if (select count(*) from public.person where email in ('a1@test', 'a2@test')) <> 2
     or not exists (select 1 from public.course where id = '00000000-0000-0000-0000-0000000000ca') then
    raise exception 'FAIL T11: deleting gym B touched gym A';
  end if;
end $$;

-- T15: GoTrue's admin createUser inserts the auth user first and writes
-- app_metadata in a second statement, so the gym only appears on UPDATE. The
-- person must still be created (or an account-less one linked) in that gym,
-- exactly once, and a later metadata change must not add another row.
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'new-manager@test', '{"full_name":"New Manager"}', '{"provider":"email"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'relink@test', '{}', '{"provider":"email"}');
insert into public.person (full_name, email, gym_id)
values ('Relink', 'relink@test', current_setting('test.gym_a')::uuid);

update auth.users
   set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('must_change_password', true, 'gym_id', current_setting('test.gym_a'))
 where id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2');
-- A later write that keeps the gym (setTemporaryPassword) changes nothing.
update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"must_change_password": true}'
 where id = '00000000-0000-0000-0000-0000000000e1';

do $$ begin
  if (select count(*) from public.person
       where auth_user_id = '00000000-0000-0000-0000-0000000000e1'
         and gym_id = current_setting('test.gym_a')::uuid
         and full_name = 'New Manager') <> 1 then
    raise exception 'FAIL T15: a gym written after insert did not create exactly one person';
  end if;
  if (select count(*) from public.person where email = 'relink@test') <> 1
     or not exists (select 1 from public.person
                     where email = 'relink@test'
                       and auth_user_id = '00000000-0000-0000-0000-0000000000e2') then
    raise exception 'FAIL T15: a gym written after insert did not link the account-less person';
  end if;
end $$;

select 'tenant isolation: all checks passed' as result;
