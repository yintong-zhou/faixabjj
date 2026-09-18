-- FAIXABJJ — recording a promotion
--
-- Updating `person` and inserting the history row must happen together or not
-- at all, and from the client they would be two separate writes. This is the
-- case where the project already puts the logic in SQL (sync_course_sessions).
--
-- SECURITY INVOKER — the default, and it matters. A definer function would
-- bypass the policies and the guard trigger that freeze belt columns, which are
-- the whole reason promotion is not self-service. The privilege is re-checked
-- at the top instead, so the failure is a clear message rather than a policy
-- violation halfway through.
create or replace function public.record_promotion(
  p_person_id uuid,
  p_to_belt belt_rank,
  p_to_stripes smallint,
  -- `current_date` is UTC, the gym is not: between midnight and 02:00 in Rome
  -- the UTC date is still yesterday. A wall-clock date and a UTC date are not
  -- the same thing, so the gym's clock is applied here exactly as it is in
  -- session_checkin_open().
  p_promoted_on date default (now() at time zone public.gym_timezone())::date,
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_person public.person%rowtype;
  v_order text[] := array['white', 'blue', 'purple', 'brown', 'black'];
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
  -- the record of a decision — it is a self-award wearing one. Without this a
  -- head coach, or a portal-only admin who never trains, could hand themselves
  -- a black belt; the same escalation the assigned_role write rule and
  -- guard_person_auth_link close elsewhere. The app never needs the self case:
  -- the panel is always reached from another person's detail page.
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
  -- Compared against the gym's wall-clock date, not `current_date`: that one is
  -- UTC, so between midnight and 02:00 in Rome it would refuse today as a
  -- future date.
  if p_promoted_on > (now() at time zone public.gym_timezone())::date then
    raise exception 'a promotion cannot be dated in the future'
      using errcode = '22007';
  end if;

  if p_to_stripes < 0 or p_to_stripes > 4 then
    raise exception 'stripes must be between 0 and 4' using errcode = '23514';
  end if;

  -- The black belt has degrees, not stripes.
  if p_to_belt = 'black' and p_to_stripes <> 0 then
    raise exception 'the black belt has no stripes' using errcode = '23514';
  end if;

  v_from := array_position(v_order, v_person.current_belt::text);
  v_to := array_position(v_order, p_to_belt::text);

  -- Forward only. Correcting a wrong grade is a different act from promoting,
  -- and it is deliberately not offered here.
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
