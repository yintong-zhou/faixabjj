-- FAIXABJJ — rank_since is the belt date; stripe_since is the stripe date
--
-- Corrects the shape introduced one migration earlier. That one kept
-- `rank_since` for the stripe and added `belt_since` for the belt; the opposite
-- split is the one we want: `rank_since` keeps its original "current rank"
-- meaning (the belt), and the new `stripe_since` records the last stripe.
--
-- This is a follow-up rather than an edit of 20260911200000 because that
-- migration has already been applied. Nothing is lost by dropping `belt_since`:
-- it only ever held a copy of `rank_since` from its own backfill.

alter table public.person
  add column if not exists stripe_since date not null default current_date;

-- Same approximation as before: with no record of the stripe date, the rank
-- date is the closest available value and is never later than the real one.
update public.person
set stripe_since = rank_since
where stripe_since = current_date
  and rank_since < current_date;

comment on column public.person.rank_since is
  'Date the current belt was awarded.';
comment on column public.person.stripe_since is
  'Date the last stripe was awarded.';

-- ---------------------------------------------------------------------------
-- Rebuild the overview without belt_since
-- ---------------------------------------------------------------------------
-- Dropped and recreated rather than replaced: `create or replace view` can
-- append a column but never remove one. The dependent policies live on the
-- underlying tables, not on the view, so nothing else has to be re-granted
-- beyond the select below.
drop view if exists public.member_overview;

-- security_invoker = on is mandatory here, as on every view in this project:
-- without it the view runs as its owner and hands an allievo the whole gym's
-- records regardless of the `person` policies.
create view public.member_overview
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
  p.stripe_since,
  coalesce(roles.active_roles, array[]::text[]) as active_roles,
  coalesce(array_length(roles.active_roles, 1), 0) > 0 as is_active,
  coalesce(hours.total_hours, 0)::numeric as total_hours
from public.person p
left join lateral (
  select array_agg(ar.role::text order by ar.role::text) as active_roles
  from public.assigned_role ar
  where ar.person_id = p.id
    and ar.end_date is null
) roles on true
left join public.person_hours hours on hours.person_id = p.id;

grant select on public.member_overview to authenticated;

alter table public.person drop column if exists belt_since;

-- ---------------------------------------------------------------------------
-- The rank columns a member must not set on themselves
-- ---------------------------------------------------------------------------
-- `stripe_since` replaces `belt_since` in the frozen set. Both dates stay
-- guarded for the same reason as the belt itself: a member holds UPDATE on
-- their own row, and backdating a rank date is how you would fake eligibility
-- for the next promotion.
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
      or new.stripe_since is distinct from old.stripe_since)
     and not public.can_edit_registry()
  then
    raise exception
      'Cintura, tacche e relative date possono essere modificate solo da un maestro o da un admin.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;
