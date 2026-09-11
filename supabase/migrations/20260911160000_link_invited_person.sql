-- FAIXABJJ — link an invited account to the person already in the registry
--
-- People are now added to the Registro as plain rows, with no account and no
-- email sent. Portal access, when it is needed at all, is granted later as a
-- separate act. That breaks the original trigger: inviting someone who is
-- already in the registry would create a *second* `person` row for the same
-- human, because the trigger only ever inserted.
--
-- Linking belongs here rather than in the server action: every path that
-- creates an auth user goes through this trigger, so fixing it at the source
-- covers the invite flow, the Supabase Dashboard, and anything added later.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked uuid;
begin
  -- Prefer an existing account-less registry row with the same email: that is
  -- someone a maestro added by hand who is only now getting portal access.
  -- Matching is case-insensitive because the registry email is typed by a
  -- human while the auth email is normalised.
  update public.person
     set auth_user_id = new.id
   where id = (
     select p.id
     from public.person p
     where p.auth_user_id is null
       and new.email is not null
       and lower(p.email) = lower(new.email)
     order by p.created_at
     limit 1
   )
  returning id into linked;

  if linked is null then
    insert into public.person (auth_user_id, full_name, email)
    values (
      new.id,
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        split_part(coalesce(new.email, ''), '@', 1),
        'Nuovo utente'
      ),
      new.email
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;
