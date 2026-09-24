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

insert into public.course (id, name, weekdays, start_time, end_time, gym_id) values
  ('00000000-0000-0000-0000-0000000000ca', 'Corso A', '{1}', '19:00', '20:00', current_setting('test.gym_a')::uuid),
  ('00000000-0000-0000-0000-0000000000cb', 'Corso B', '{1}', '19:00', '20:00', current_setting('test.gym_b')::uuid);
insert into public.class_session (id, course_id, session_date, start_time, end_time, gym_id) values
  ('00000000-0000-0000-0000-0000000005aa', '00000000-0000-0000-0000-0000000000ca', current_date, '19:00', '20:00', current_setting('test.gym_a')::uuid),
  ('00000000-0000-0000-0000-0000000005bb', '00000000-0000-0000-0000-0000000000cb', current_date, '19:00', '20:00', current_setting('test.gym_b')::uuid),
  -- A session of gym B whose check-in window spans the whole day, so T13 does
  -- not depend on what time replay.sh happens to run at.
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
  if (select public.current_access() ->> 'isPlatformAdmin') <> 'false'
     or (select public.current_access() ->> 'gymStatus') <> 'active'
     or (select public.current_access() ->> 'canManageUsers') <> 'true' then
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

-- T5: a2 cannot check in to a session of gym B.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
do $$ begin
  begin
    insert into public.attendance (person_id, session_id, present, checked_in_by)
    values (public.current_person_id(), '00000000-0000-0000-0000-0000000005bb', true, 'self');
    raise exception 'FAIL T5: a2 checked in to a session of gym B';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- T13: session_checkin_open() does not leak another gym's session, even to a
-- caller who names its id directly and even though the function is security
-- definer and would otherwise read class_session/course with no gym filter.
-- The session named here (…05cc) is open all day, so the only way this could
-- read true is the leak this test guards against.
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
  if (select public.current_access() ->> 'isPlatformAdmin') <> 'true'
     or (select public.current_access() ->> 'canViewRegistry') <> 'false' then
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
  if (select public.current_access() ->> 'gymStatus') <> 'suspended'
     or (select public.current_access() ->> 'canManageUsers') <> 'false' then
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

select 'tenant isolation: all checks passed' as result;
