-- FAIXABJJ — black belt degrees (0–6)
--
-- The black belt carries degrees, not stripes: six of them (IBJJF General
-- System of Graduation, belt-criteria.md "black_belt_degrees"). The seventh
-- degree is worn on the red-and-black belt, which the app does not model.
-- Until now the black belt took none (record_promotion() refused any), and
-- every stripes column stopped at 4.
--
--   - person.current_stripes and promotion.from_/to_stripes: up to 6 on a
--     black belt, still up to 4 on any other. The plain 0–4 checks of
--     20260910000000 / 20260918120000 are replaced by per-belt ones; existing
--     rows all satisfy them (nothing could exceed 4 before).
--   - record_promotion(): a black belt accepts 0–6. Only that line changes.
--
-- Degrees are recorded by hand like any promotion; nothing suggests them
-- (nextStep() still returns null at black). registration_request keeps 0–4:
-- self-registration is not changed here.
--
-- Redefines record_promotion() (last: 20261005010000), restated in full.
-- Replay-safe.

alter table public.person drop constraint if exists person_current_stripes_check;
alter table public.person drop constraint if exists person_stripes_for_belt;
alter table public.person add constraint person_stripes_for_belt check (
  current_stripes between 0 and (case when current_belt = 'black' then 6 else 4 end)
);

alter table public.promotion drop constraint if exists promotion_from_stripes_check;
alter table public.promotion drop constraint if exists promotion_to_stripes_check;
alter table public.promotion drop constraint if exists promotion_from_stripes_for_belt;
alter table public.promotion drop constraint if exists promotion_to_stripes_for_belt;
alter table public.promotion add constraint promotion_from_stripes_for_belt check (
  from_stripes between 0 and (case when from_belt = 'black' then 6 else 4 end)
);
alter table public.promotion add constraint promotion_to_stripes_for_belt check (
  to_stripes between 0 and (case when to_belt = 'black' then 6 else 4 end)
);

-- Identical to 20261005010000 except the black belt's ceiling (0 → 6).
-- SECURITY INVOKER, as before: a definer function would bypass RLS and gym
-- isolation.
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
  if not public.can_promote() then
    raise exception 'only a head coach can record a promotion'
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
    v_max_stripes := 6;
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
