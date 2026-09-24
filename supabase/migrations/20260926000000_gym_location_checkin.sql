-- Check-in near the gym (spec: docs/superpowers/specs/2026-09-25-gym-location-checkin-design.md).
--
-- A gym may have a position. When it does, a member's self check-in succeeds
-- only within 50 m of it. The browser reports the position; the server cannot
-- verify it, so this stops the lazy check-in from home, not a determined
-- cheat — the instructor's roll call stays the authority.
--
-- Compatible with the app deployed before it: the direct-insert policy
-- "members can check themselves in" is dropped only by 20260926010000,
-- applied after the new app is live.

alter table public.gym add column if not exists latitude double precision;
alter table public.gym add column if not exists longitude double precision;

-- Both or neither. Spelled out: with a plain `between` a null longitude makes
-- the check null, and a null check passes.
alter table public.gym drop constraint if exists gym_location_valid;
alter table public.gym add constraint gym_location_valid check (
  (latitude is null and longitude is null)
  or (
    latitude is not null and longitude is not null
    and latitude between -90 and 90
    and longitude between -180 and 180
  )
);

-- Great-circle distance in metres (haversine, mean Earth radius 6 371 000 m).
-- least(1, …) keeps rounding from pushing asin outside its domain.
create or replace function public.gym_distance_m(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
strict
set search_path = ''
as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

grant execute on function public.gym_distance_m(double precision, double precision, double precision, double precision) to authenticated;

-- The one way a member marks themselves present. Answers an outcome instead of
-- raising, so the app can say what to do next. The coordinates are compared
-- and dropped: they are written nowhere and never appear in an error.
create or replace function public.check_in(
  p_session_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- Radius around the gym's position within which a check-in is accepted.
  max_distance_m constant double precision := 50;
  -- A fix less precise than this cannot tell "in the gym" from "next street".
  max_accuracy_m constant double precision := 100;
  v_person uuid := public.current_person_id();
  v_gym_lat double precision;
  v_gym_lng double precision;
  v_distance double precision;
begin
  -- session_checkin_open() is false for another gym's session, a suspended
  -- gym and a caller with no gym (20260925030000).
  if v_person is null or p_session_id is null or not public.session_checkin_open(p_session_id) then
    return jsonb_build_object('result', 'closed', 'distance_m', null);
  end if;

  if exists (
    select 1 from public.attendance a
    where a.person_id = v_person and a.session_id = p_session_id
  ) then
    return jsonb_build_object('result', 'already', 'distance_m', null);
  end if;

  select g.latitude, g.longitude into v_gym_lat, v_gym_lng
  from public.gym g
  where g.id = public.current_gym_id();

  if v_gym_lat is not null then
    if p_lat is null or p_lng is null
       or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      return jsonb_build_object('result', 'location_needed', 'distance_m', null);
    end if;
    if p_accuracy is null or p_accuracy < 0 or p_accuracy > max_accuracy_m then
      return jsonb_build_object('result', 'imprecise', 'distance_m', null);
    end if;
    v_distance := public.gym_distance_m(v_gym_lat, v_gym_lng, p_lat, p_lng);
    if v_distance > max_distance_m then
      return jsonb_build_object('result', 'too_far', 'distance_m', round(v_distance)::int);
    end if;
  end if;

  -- Same values the direct insert used; gym_id comes from the gym_scope trigger.
  begin
    insert into public.attendance (person_id, session_id, present, checked_in_by)
    values (v_person, p_session_id, true, 'self');
  exception when unique_violation then
    -- Two taps, two requests: the second finds the first.
    return jsonb_build_object('result', 'already', 'distance_m', null);
  end;

  return jsonb_build_object(
    'result', 'ok',
    'distance_m', case when v_distance is null then null else round(v_distance)::int end
  );
end;
$$;

revoke execute on function public.check_in(uuid, double precision, double precision, double precision) from public, anon;
grant execute on function public.check_in(uuid, double precision, double precision, double precision) to authenticated;

-- The manager has no update on gym (only the superadmin does, "platform admins
-- manage gyms"). This changes the two location columns of the caller's own
-- gym and nothing else. null, null clears the position; a half pair fails the
-- gym_location_valid check (23514).
create or replace function public.set_gym_location(p_lat double precision, p_lng double precision)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_gym uuid := public.current_gym_id();
begin
  if v_gym is null or not public.can_manage_users() then
    raise exception 'not allowed to set the gym location' using errcode = '42501';
  end if;

  update public.gym set latitude = p_lat, longitude = p_lng where id = v_gym;
end;
$$;

revoke execute on function public.set_gym_location(double precision, double precision) from public, anon;
grant execute on function public.set_gym_location(double precision, double precision) to authenticated;
