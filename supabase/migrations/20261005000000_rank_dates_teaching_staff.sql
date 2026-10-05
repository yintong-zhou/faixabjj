-- FAIXABJJ — belt and stripe dates are corrected by the teaching staff only
--
-- Until now any registry editor (head_coach and admin) could correct
-- person.rank_since / stripe_since with a direct update. The rule is now:
--   - head_coach and instructor correct those two dates;
--   - the gym manager (admin) does not: it runs the portal, it does not judge
--     how long somebody has held a belt. It keeps correcting joined_at.
-- An admin who also holds head_coach or instructor keeps the right through
-- that role, as everywhere else.
--
-- The instructor has no update right on person (RLS), and must not get one: it
-- would open every other column. So the correction is one security definer
-- function, correct_rank_dates(), and the guard trigger lets these two columns
-- move only inside it or inside record_promotion() — the same transaction-local
-- marker pattern as faixa.recording_promotion (20260927000000), not settable
-- through the API.
--
-- Redefines current_access() (last: 20260925030000) to add
-- canCorrectRankDates, and guard_person_auth_link() (last: 20260930000000).
-- Both restated in full. Replay-safe.

create or replace function public.can_correct_rank_dates()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_active_role(array['head_coach', 'instructor']);
$$;

grant execute on function public.can_correct_rank_dates() to authenticated;

-- Identical to 20260925030000 plus canCorrectRankDates.
create or replace function public.current_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'canViewRegistry', public.current_gym_id() is not null and public.can_view_registry(),
    'canEditRegistry', public.current_gym_id() is not null and public.can_edit_registry(),
    'canManageUsers', public.current_gym_id() is not null and public.can_manage_users(),
    'canManageClasses', public.current_gym_id() is not null and public.can_manage_classes(),
    'canCorrectRankDates', public.current_gym_id() is not null and public.can_correct_rank_dates(),
    'isPlatformAdmin', public.is_platform_admin(),
    'gymStatus', public.current_gym_status()
  );
$$;

grant execute on function public.current_access() to authenticated;

-- Not a promotion: no history row, belt and stripes untouched. Refuses the
-- caller's own row, another gym's row, future dates and a stripe older than
-- the belt — the same checks the app makes, here because a crafted call is not
-- bound by the form.
create or replace function public.correct_rank_dates(
  p_person_id uuid,
  p_rank_since date,
  p_stripe_since date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_gym_id() is null or not public.can_correct_rank_dates() then
    raise exception 'only a head coach or an instructor corrects rank dates'
      using errcode = '42501';
  end if;

  if p_person_id = public.current_person_id() then
    raise exception 'rank dates cannot be corrected on your own record'
      using errcode = '42501';
  end if;

  if p_rank_since is null or p_stripe_since is null then
    raise exception 'both dates are required' using errcode = '22004';
  end if;

  if greatest(p_rank_since, p_stripe_since) > (now() at time zone public.gym_timezone())::date then
    raise exception 'a rank date cannot be in the future' using errcode = '22007';
  end if;

  if p_stripe_since < p_rank_since then
    raise exception 'the last stripe cannot predate the belt' using errcode = '23514';
  end if;

  perform set_config('faixa.correcting_rank_dates', 'on', true);

  update public.person
     set rank_since = p_rank_since,
         stripe_since = p_stripe_since
   where id = p_person_id
     and gym_id = public.current_gym_id();

  if not found then
    raise exception 'person not found' using errcode = 'P0002';
  end if;

  perform set_config('faixa.correcting_rank_dates', 'off', true);
end;
$$;

revoke execute on function public.correct_rank_dates(uuid, date, date) from public, anon;
grant execute on function public.correct_rank_dates(uuid, date, date) to authenticated;

-- Identical to 20260930000000 except:
--   - inside correct_rank_dates() only rank_since and stripe_since may change,
--     never on the caller's own row;
--   - outside it (and outside record_promotion()) nobody changes them, registry
--     editors included.
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
  v_rank_dates text[] := array['rank_since', 'stripe_since', 'updated_at'];
begin
  if auth.uid() is null then
    return new;
  end if;

  if current_setting('faixa.correcting_rank_dates', true) = 'on' then
    if old.auth_user_id = auth.uid()
       or (to_jsonb(new) - v_rank_dates) is distinct from (to_jsonb(old) - v_rank_dates)
    then
      raise exception
        'La correzione delle date di grado cambia solo quelle due date, e mai sulla propria scheda.'
        using errcode = 'insufficient_privilege';
    end if;
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

  if (new.rank_since is distinct from old.rank_since
      or new.stripe_since is distinct from old.stripe_since)
     and current_setting('faixa.recording_promotion', true) is distinct from 'on'
  then
    raise exception
      'Le date di cintura e tacca si correggono solo con correct_rank_dates(), da maestro o istruttore.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;
