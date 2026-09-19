-- FAIXABJJ — promoting on the children's ladder
--
-- Follows 20260919100000, which added the twelve children's values to
-- belt_rank and could do nothing else: Postgres refuses to use a freshly added
-- enum value in the transaction that adds it. Everything that mentions them is
-- here.
--
-- Two changes:
--   1. record_promotion() knows the full ladder, and caps a children's belt at
--      three degrees instead of four.
--   2. The IBJJF age minimums for blue, purple and brown are seeded, because
--      with children in the registry they stop being optional.

-- ---------------------------------------------------------------------------
-- 1. The age minimums that the children's belts make load-bearing
-- ---------------------------------------------------------------------------
-- belt-criteria.md gives ibjjf_age_min_years 16 for white -> blue, 16 for
-- blue -> purple and 18 for purple -> brown. They were left unseeded when the
-- criteria were first written (see 20260919000000), because at the time the
-- registry held adults only and an age gate would just have removed people from
-- the queue.
--
-- The children's system changes that. An eight-year-old white belt now sits in
-- the registry, nextStep() offers them blue once they have four stripes, and
-- without this row their attendance alone would put them in the eligibility
-- queue for an adult blue belt. The age on (blue, 0) is what stops it, and it
-- is a federation rule rather than a house preference.
--
-- Consequence to know about: promotionStatus() treats a missing birth_date as a
-- failed check, never a passed one, so an adult with no birth date on file
-- leaves the queue too. That is the safe direction — the alternative is
-- promoting somebody the federation says is too young — but it does mean the
-- registry's birth dates now matter, and blank ones are worth filling in.
--
-- Guarded on `is null` so a figure the gym has since chosen in the criteria
-- panel is never overwritten.
update public.promotion_criteria set min_age_years = 16
 where belt = 'blue' and stripe = 0 and min_age_years is null;
update public.promotion_criteria set min_age_years = 16
 where belt = 'purple' and stripe = 0 and min_age_years is null;
update public.promotion_criteria set min_age_years = 18
 where belt = 'brown' and stripe = 0 and min_age_years is null;

comment on column public.promotion_criteria.min_age_years is
  'Minimum age in whole years, null when the grade has none. Seeded from the IBJJF minimums in belt-criteria.md: 16 for blue, 16 for purple, 18 for brown, 18 for black. The children''s belts have no rows here at all — the IBJJF children''s system sets no minimum time and no hours.';

-- The children's belts are deliberately NOT seeded into promotion_criteria.
-- belt-criteria.md is explicit that the children's system has no mandatory
-- minimum time and gives no hours model for it: promotion happens on completing
-- the degrees of whichever method the professor adopts, which is a judgement,
-- not a threshold. Rows here would have to be invented, and inventing them
-- would put every child in the eligibility queue against a number that means
-- nothing. With no row, promotionStatus() returns the "no-criterion" blocker,
-- so children never appear in the count, the ?idonei=1 filter or the green dot
-- — while remaining fully promotable from the panel, with the same history.

-- ---------------------------------------------------------------------------
-- 2. record_promotion() over both ladders
-- ---------------------------------------------------------------------------
-- Only two things change from 20260918130000: v_order carries all seventeen
-- belts, and the stripe ceiling depends on the belt. Everything else — the
-- privilege check, the refusal to promote yourself, the future-date refusal,
-- the forward-only rule, the two update branches — is unchanged and repeated
-- here because `create or replace function` replaces the whole body.
--
-- SECURITY INVOKER — the default, and it matters. A definer function would
-- bypass the policies and the guard trigger that freeze belt columns, which are
-- the whole reason promotion is not self-service.
--
-- The belts are compared as text rather than as enum literals, the same style
-- the rest of this project uses, so the ladder is a plain array lookup.
create or replace function public.record_promotion(
  p_person_id uuid,
  p_to_belt belt_rank,
  p_to_stripes smallint,
  -- `current_date` is UTC, the gym is not: between midnight and 02:00 in Rome
  -- the UTC date is still yesterday.
  p_promoted_on date default (now() at time zone public.gym_timezone())::date,
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_person public.person%rowtype;
  -- Both ladders in one line, in the order they are climbed. They share their
  -- first rung (white) and rejoin at blue, which is the transition at 16, so a
  -- single increasing sequence expresses "forward" for a child, for an adult,
  -- and for the child who becomes one.
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

  -- Nobody promotes themselves. A promotion is somebody else's judgement of
  -- you, and a history row whose subject and signer are the same person is not
  -- the record of a decision — it is a self-award wearing one.
  if p_person_id = public.current_person_id() then
    raise exception 'a promotion cannot be recorded for yourself'
      using errcode = '42501';
  end if;

  select * into v_person from public.person where id = p_person_id;
  if not found then
    raise exception 'person not found' using errcode = 'P0002';
  end if;

  -- Backdating is legitimate (the belt was given on the mat last Saturday);
  -- forward-dating is not, and it would hand somebody free time at rank.
  if p_promoted_on > (now() at time zone public.gym_timezone())::date then
    raise exception 'a promotion cannot be dated in the future'
      using errcode = '22007';
  end if;

  -- Four degrees on an adult belt, three on a children's one — that is what the
  -- artwork draws and what KID_MAX_STRIPES in the app says. The black belt has
  -- degrees rather than stripes, and they are out of scope.
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

  -- Forward only. Correcting a wrong grade is a different act from promoting,
  -- and it is deliberately not offered here. Crossing from the children's
  -- ladder to an adult belt is forward like any other step, which is what makes
  -- the transition at 16 an ordinary promotion to record.
  if v_to < v_from or (v_to = v_from and p_to_stripes <= v_person.current_stripes) then
    raise exception 'a promotion must move forward' using errcode = '23514';
  end if;

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
    -- A new belt resets the stripe clock too: the stripes on it start over.
    update public.person
       set current_belt = p_to_belt,
           current_stripes = p_to_stripes,
           rank_since = p_promoted_on,
           stripe_since = p_promoted_on
     where id = p_person_id;
  else
    -- A stripe leaves the belt date alone — "how long at this belt" is what the
    -- next belt hangs on, and a stripe must not reset it.
    update public.person
       set current_stripes = p_to_stripes,
           stripe_since = p_promoted_on
     where id = p_person_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.record_promotion(uuid, belt_rank, smallint, date, text)
  to authenticated;
