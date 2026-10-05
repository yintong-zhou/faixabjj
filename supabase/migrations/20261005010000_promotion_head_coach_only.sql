-- FAIXABJJ — promotions are the head coach's alone
--
-- Until now any registry editor (head_coach and admin) could record a
-- promotion. The gym manager (admin) runs the portal and does not award
-- grades; an instructor never did. So:
--   - can_promote() = an active head_coach role (an admin who is also a head
--     coach keeps it through that role);
--   - record_promotion() checks it instead of can_edit_registry();
--   - the promotion insert/delete policies follow, so the history is written
--     and removed by the same people;
--   - current_access() gains canPromote.
-- The approval of a self-registration writes the starting grade with the
-- service role; the app takes the athlete's declared grade unchanged there
-- unless the approver can promote (app/members/requests/actions.ts).
--
-- Redefines current_access() (last: 20261005000000) and record_promotion()
-- (last: 20260927000000), both restated in full. Replay-safe.

create or replace function public.can_promote()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_active_role(array['head_coach']);
$$;

grant execute on function public.can_promote() to authenticated;

-- Identical to 20261005000000 plus canPromote.
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
    'canPromote', public.current_gym_id() is not null and public.can_promote(),
    'isPlatformAdmin', public.is_platform_admin(),
    'gymStatus', public.current_gym_status()
  );
$$;

grant execute on function public.current_access() to authenticated;

drop policy if exists "editors can insert promotion" on public.promotion;
drop policy if exists "head coaches can insert promotion" on public.promotion;
create policy "head coaches can insert promotion" on public.promotion
  for insert to authenticated
  with check (public.can_promote());

drop policy if exists "editors can delete promotion" on public.promotion;
drop policy if exists "head coaches can delete promotion" on public.promotion;
create policy "head coaches can delete promotion" on public.promotion
  for delete to authenticated
  using (public.can_promote());

-- Identical to 20260927000000 except the role check (can_promote()).
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
