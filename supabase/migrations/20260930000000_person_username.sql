-- FAIXABJJ — sign in with a username as well as the email
--
-- A convenience: every account keeps its email; the username is a shorter,
-- second way in. The login action resolves it to the account's email on the
-- server with the service role (utils/supabase/login-identifier.ts), so no
-- function here maps usernames to emails for the API.
--
-- Unique across the whole platform, not per gym: at login the gym is not yet
-- known. Lower case only and never an `@`, which is how the login tells a
-- username from an email.
--
-- Existing accounts get one generated from their name — the same rule as
-- suggestUsername() in frontend/utils/username.ts — with a number appended on a
-- collision. Rows without an account get none; restoreAccess gives them one.
--
-- Redefines guard_person_auth_link() (last: 20260927000000) only to add
-- `username` to what a member may change on their own row. Replay-safe.

alter table public.person add column if not exists username text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'person_username_format'
      and conrelid = 'public.person'::regclass
  ) then
    alter table public.person
      add constraint person_username_format
      check (username ~ '^[a-z0-9._-]{3,30}$');
  end if;
end;
$$;

create unique index if not exists person_username_unique
  on public.person (username)
  where username is not null;

-- Backfill. Oldest row first, so the earlier member keeps the plain name.
-- Base cut to 26 characters, leaving room for a suffix of up to 4 digits.
do $$
declare
  r record;
  v_base text;
  v_candidate text;
  n int;
begin
  for r in
    select id, full_name
    from public.person
    where auth_user_id is not null
      and username is null
    order by created_at, id
  loop
    v_base := lower(extensions.unaccent(coalesce(r.full_name, '')));
    v_base := regexp_replace(v_base, '\s+', '.', 'g');
    v_base := regexp_replace(v_base, '[^a-z0-9._-]', '', 'g');
    v_base := regexp_replace(v_base, '\.{2,}', '.', 'g');
    v_base := btrim(v_base, '.');
    v_base := rtrim(left(v_base, 26), '.');
    if length(v_base) = 0 then
      v_base := 'user';
    elsif length(v_base) < 3 then
      v_base := v_base || '.user';
    end if;

    v_candidate := v_base;
    n := 1;
    while exists (select 1 from public.person where username = v_candidate) loop
      n := n + 1;
      v_candidate := left(v_base, 30 - length(n::text)) || n::text;
    end loop;

    update public.person set username = v_candidate where id = r.id;
  end loop;
end;
$$;

-- Identical to 20260927000000 except `username` in v_self_editable.
create or replace function public.guard_person_auth_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- What /account lets a member edit about themselves. updated_at is set by its
  -- own trigger and must not count as a change.
  v_self_editable text[] := array['full_name', 'phone', 'birth_date', 'notes', 'username', 'updated_at'];
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.auth_user_id is distinct from old.auth_user_id
     and not public.can_manage_users()
  then
    raise exception
      'Solo un maestro o un admin può cambiare l''account collegato a una persona.'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.can_edit_registry() then
    if (to_jsonb(new) - v_self_editable) is distinct from (to_jsonb(old) - v_self_editable) then
      raise exception
        'Della propria scheda si possono modificare solo nome, username, telefono, data di nascita e note.'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if old.auth_user_id = auth.uid()
     and (new.current_belt is distinct from old.current_belt
          or new.current_stripes is distinct from old.current_stripes
          or new.rank_since is distinct from old.rank_since
          or new.stripe_since is distinct from old.stripe_since
          or new.joined_at is distinct from old.joined_at)
  then
    raise exception
      'Nessuno può modificare il proprio grado, le relative date o la data di iscrizione.'
      using errcode = 'insufficient_privilege';
  end if;

  if (new.current_belt is distinct from old.current_belt
      or new.current_stripes is distinct from old.current_stripes)
     and current_setting('faixa.recording_promotion', true) is distinct from 'on'
  then
    raise exception
      'Cintura e tacche cambiano solo registrando una promozione.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- The login's lookup, in one call whatever the outcome. Resolving a username
-- with two requests (the person row, then the account) took measurably longer
-- when the username existed than when it did not, and that difference answered
-- "does Mario Rossi have an account here?" before any captcha is checked. One
-- statement makes the found and the not-found case the same round trip.
--
-- Executable by the service role only (emailForUsername in
-- frontend/utils/supabase/login-identifier.ts). Revoked from anon and
-- authenticated explicitly: default privileges on this schema grant execute on
-- every new function to both, and either could then map usernames to emails.
create or replace function public.login_email_for_username(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text
  from public.person p
  join auth.users u on u.id = p.auth_user_id
  where p.username = p_username
  limit 1
$$;

revoke all on function public.login_email_for_username(text) from public, anon, authenticated;
grant execute on function public.login_email_for_username(text) to service_role;
