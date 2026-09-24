-- The gym of a new account arrives in a second statement, not in the insert.
--
-- GoTrue's admin createUser inserts the auth.users row first and only then
-- applies app_metadata with an UPDATE (supabase/auth, adminUserCreate:
-- tx.Create(user) … user.UpdateAppMetaData). The after-insert trigger
-- on_auth_user_created therefore never saw app_metadata.gym_id, created no
-- person, and addManager / addPerson rolled the account back as a failure.
--
-- handle_new_auth_user now also runs when raw_app_meta_data changes, and acts
-- only when a gym has just appeared (or changed) on an account that no person
-- row holds yet and that is not a platform admin. A later metadata write that
-- keeps the gym — setTemporaryPassword restating must_change_password — finds
-- nothing to do.
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

  if tg_op = 'UPDATE'
     and (old.raw_app_meta_data ->> 'gym_id') is not distinct from (new.raw_app_meta_data ->> 'gym_id') then
    return new;
  end if;

  -- Already somebody's profile, or the platform superadmin (who has none on
  -- purpose, and whom 20260925040000 refuses to link): nothing to create.
  if exists (select 1 from public.person where auth_user_id = new.id)
     or exists (select 1 from public.platform_admin where auth_user_id = new.id) then
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

drop trigger if exists on_auth_user_gym_assigned on auth.users;
create trigger on_auth_user_gym_assigned
after update of raw_app_meta_data on auth.users
for each row execute function public.handle_new_auth_user();
