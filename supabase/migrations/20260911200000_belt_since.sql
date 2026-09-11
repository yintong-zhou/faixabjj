-- FAIXABJJ — separate the belt promotion date from the last stripe date
--
-- `rank_since` was carrying both meanings at once. It now means only "when the
-- last stripe was awarded" (UI label: "Ultima tacca"), and the belt promotion
-- gets its own column. They move at different rates — a belt lasts years while
-- stripes come every few months — and "how long at this belt" is the figure
-- promotion eligibility actually hangs on, so it cannot be inferred from the
-- stripe date.

alter table public.person
  add column if not exists belt_since date not null default current_date;

-- Existing rows have no record of the belt date. `rank_since` is the closest
-- thing available: for anyone still on their first stripe of a belt the two
-- genuinely coincide, and for everyone else it is at least not later than the
-- real promotion. Correct the outliers by hand from the Registro.
update public.person
set belt_since = rank_since
where belt_since = current_date
  and rank_since < current_date;

comment on column public.person.belt_since is
  'Date the current belt was awarded. rank_since is the date of the last stripe.';

-- ---------------------------------------------------------------------------
-- The rank columns a member must not set on themselves
-- ---------------------------------------------------------------------------
-- Same reasoning as 20260911120000: a member holds UPDATE on their own row, so
-- without this they could promote themselves. `belt_since` joins the list —
-- backdating it is exactly how you would fake eligibility for the next belt.
create or replace function public.guard_person_auth_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.uid() is null for the service role and for the FK's own ON DELETE SET
  -- NULL cascade, both trusted server-side paths; the guard only applies to a
  -- request carrying an end user's JWT.
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

  if (new.current_belt is distinct from old.current_belt
      or new.current_stripes is distinct from old.current_stripes
      or new.rank_since is distinct from old.rank_since
      or new.belt_since is distinct from old.belt_since)
     and not public.can_edit_registry()
  then
    raise exception
      'Cintura, tacche e relative date possono essere modificate solo da un maestro o da un admin.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Surface it in the overview
-- ---------------------------------------------------------------------------
-- Appended last: `create or replace view` may add columns but never reorder or
-- drop the existing ones. security_invoker stays on, or the view would hand an
-- allievo the whole gym's records.
create or replace view public.member_overview
with (security_invoker = on)
as
select
  p.id,
  p.auth_user_id,
  p.full_name,
  p.email,
  p.phone,
  p.birth_date,
  p.joined_at,
  p.current_belt,
  p.current_stripes,
  p.rank_since,
  coalesce(roles.active_roles, array[]::text[]) as active_roles,
  coalesce(array_length(roles.active_roles, 1), 0) > 0 as is_active,
  coalesce(hours.total_hours, 0)::numeric as total_hours,
  p.belt_since
from public.person p
left join lateral (
  select array_agg(ar.role::text order by ar.role::text) as active_roles
  from public.assigned_role ar
  where ar.person_id = p.id
    and ar.end_date is null
) roles on true
left join public.person_hours hours on hours.person_id = p.id;

grant select on public.member_overview to authenticated;
