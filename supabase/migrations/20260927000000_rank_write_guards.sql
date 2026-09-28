-- FAIXABJJ — who may write a person's rank, and through what
--
-- Closes two gaps found by a security review, both inside a single gym:
--
-- 1. A member holds UPDATE on their own `person` row (that is what /account
--    saves), and guard_person_auth_link froze only the rank columns. Every
--    other column stayed writable straight through the API — `joined_at` among
--    them, which the estimated hours and the eligibility count are measured
--    from, so backdating it put a member in the staff's "eligible" queue. The
--    guard now works from an allowlist: someone who is not a registry editor
--    may change only what /account offers (name, phone, birth date, notes).
--    A column added later is frozen for them by default.
--
-- 2. record_promotion() refuses self-promotion, future dates and backward
--    steps, but an editor could skip it: UPDATE their own belt directly, or
--    INSERT a `promotion` row of their choosing. Now
--      - nobody changes the rank columns or the join date of their own row;
--      - belt and stripes change only inside record_promotion(), which is also
--        the only way a history row is written — so every grade change has its
--        history row and every history row passed the function's checks.
--    The two dates alone stay correctable directly by an editor on somebody
--    else's row: that is correctRankDates, a fix and not a decision.
--
-- How "inside record_promotion()" is known: the function sets a
-- transaction-local setting, `faixa.recording_promotion`, and the two guards
-- read it. A client cannot set it: set_config() lives in pg_catalog, which the
-- API does not expose, and PostgREST sets only its own request.* settings. The
-- function stays SECURITY INVOKER, so RLS and gym isolation still apply to
-- everything it does.
--
-- Everything is skipped when auth.uid() is null — the service role, the SQL
-- Editor, the FK's ON DELETE SET NULL cascade — as before. addPerson therefore
-- sets the new member's starting belt with the service role.
--
-- Redefines guard_person_auth_link() (last: 20260911220000) and
-- record_promotion() (last: 20260919110000). Replay-safe.

-- ---------------------------------------------------------------------------
-- 1. person: allowlist for members, own rank frozen for everyone
-- ---------------------------------------------------------------------------
create or replace function public.guard_person_auth_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- What /account lets a member edit about themselves. updated_at is set by its
  -- own trigger and must not count as a change.
  v_self_editable text[] := array['full_name', 'phone', 'birth_date', 'notes', 'updated_at'];
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
        'Della propria scheda si possono modificare solo nome, telefono, data di nascita e note.'
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

-- ---------------------------------------------------------------------------
-- 2. promotion: written only by record_promotion()
-- ---------------------------------------------------------------------------
create or replace function public.guard_promotion_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and current_setting('faixa.recording_promotion', true) is distinct from 'on'
  then
    raise exception 'a promotion is recorded only through record_promotion()'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_promotion_insert on public.promotion;
create trigger guard_promotion_insert
before insert on public.promotion
for each row execute function public.guard_promotion_insert();

-- ---------------------------------------------------------------------------
-- 3. record_promotion(): unchanged from 20260919110000 except the marker
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER, as before: a definer function would bypass RLS and gym
-- isolation. Only the set_config() calls around the two writes are new.
create or replace function public.record_promotion(
  p_person_id uuid,
  p_to_belt belt_rank,
  p_to_stripes smallint,
  p_promoted_on date default (now() at time zone public.gym_timezone())::date,
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_person public.person%rowtype;
  v_order text[] := array[
    'white',
    'gray_white', 'gray', 'gray_black',
    'yellow_white', 'yellow', 'yellow_black',
    'orange_white', 'orange', 'orange_black',
    'green_white', 'green', 'green_black',
    'blue', 'purple', 'brown', 'black'
  ];
  v_kid_belts text[] := array[
    'gray_white', 'gray', 'gray_black',
    'yellow_white', 'yellow', 'yellow_black',
    'orange_white', 'orange', 'orange_black',
    'green_white', 'green', 'green_black'
  ];
  v_max_stripes smallint;
  v_from int;
  v_to int;
  v_id uuid;
begin
  if not public.can_edit_registry() then
    raise exception 'only a registry editor can record a promotion'
      using errcode = '42501';
  end if;

  if p_person_id = public.current_person_id() then
    raise exception 'a promotion cannot be recorded for yourself'
      using errcode = '42501';
  end if;

  select * into v_person from public.person where id = p_person_id;
  if not found then
    raise exception 'person not found' using errcode = 'P0002';
  end if;

  if p_promoted_on > (now() at time zone public.gym_timezone())::date then
    raise exception 'a promotion cannot be dated in the future'
      using errcode = '22007';
  end if;

  if p_to_belt::text = 'black' then
    v_max_stripes := 0;
  elsif p_to_belt::text = any(v_kid_belts) then
    v_max_stripes := 3;
  else
    v_max_stripes := 4;
  end if;

  if p_to_stripes < 0 or p_to_stripes > v_max_stripes then
    raise exception 'stripes must be between 0 and % for this belt', v_max_stripes
      using errcode = '23514';
  end if;

  v_from := array_position(v_order, v_person.current_belt::text);
  v_to := array_position(v_order, p_to_belt::text);

  if v_to < v_from or (v_to = v_from and p_to_stripes <= v_person.current_stripes) then
    raise exception 'a promotion must move forward' using errcode = '23514';
  end if;

  -- Every check above has passed: from here the guards on person and promotion
  -- let this transaction write the grade and its history row.
  perform set_config('faixa.recording_promotion', 'on', true);

  insert into public.promotion (
    person_id, from_belt, from_stripes, to_belt, to_stripes,
    promoted_on, promoted_by, notes
  )
  values (
    p_person_id, v_person.current_belt, v_person.current_stripes,
    p_to_belt, p_to_stripes, p_promoted_on, public.current_person_id(), p_notes
  )
  returning id into v_id;

  if v_to > v_from then
    update public.person
       set current_belt = p_to_belt,
           current_stripes = p_to_stripes,
           rank_since = p_promoted_on,
           stripe_since = p_promoted_on
     where id = p_person_id;
  else
    update public.person
       set current_stripes = p_to_stripes,
           stripe_since = p_promoted_on
     where id = p_person_id;
  end if;

  -- Off again, so nothing later in the same transaction inherits the pass.
  perform set_config('faixa.recording_promotion', 'off', true);

  return v_id;
end;
$$;

grant execute on function public.record_promotion(uuid, belt_rank, smallint, date, text)
  to authenticated;
