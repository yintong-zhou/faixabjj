-- Makes admin@bjj.com the platform superadmin. Run BY HAND in the SQL Editor
-- of project poksgledkecwviypspmi, after the five 20260925* migrations.
-- Not a migration on purpose: a migration that grants privileges is a
-- privilege grant hiding in a schema change.
--
-- admin@bjj.com is today an admin of the gym. A superadmin sits outside every
-- gym, so the account leaves it: its person row and its roles are removed. If
-- that row carries attendance, promotions, or instructor assignments the script
-- stops rather than erase them — those are the gym's records, not the account's.
do $$
declare
  v_user uuid;
  v_person uuid;
begin
  select id into v_user from auth.users where lower(email) = 'admin@bjj.com';
  if v_user is null then
    raise exception 'admin@bjj.com does not exist in auth.users';
  end if;

  select id into v_person from public.person where auth_user_id = v_user;

  if v_person is not null then
    if exists (select 1 from public.attendance where person_id = v_person)
       or exists (select 1 from public.promotion where person_id = v_person or promoted_by = v_person)
       or exists (select 1 from public.course where instructor_id = v_person)
       or exists (select 1 from public.class_session where instructor_id = v_person) then
      raise exception 'admin@bjj.com has attendance, promotions, or instructor assignments on record: resolve them by hand first';
    end if;
    delete from public.assigned_role where person_id = v_person;
    delete from public.person where id = v_person;
  end if;

  insert into public.platform_admin (auth_user_id) values (v_user)
  on conflict do nothing;

  -- A superadmin belongs to no gym, so its account names none either
  -- (20260925040000 may have copied the gym into app_metadata beforehand).
  update auth.users
     set raw_app_meta_data = raw_app_meta_data - 'gym_id'
   where id = v_user and raw_app_meta_data ? 'gym_id';

  raise notice 'admin@bjj.com is now the platform superadmin';
end $$;
