-- Accent-insensitive name search in the Registro.
--
-- The search used to be `full_name ilike '%word%'`, which is case-insensitive
-- but not accent-insensitive: "jose" did not find "José", "joao" not "João".
-- member_overview now also exposes `search_name` — the name lower-cased and
-- stripped of accents by the unaccent extension — and the page searches that
-- column with a term folded the same way (utils/search.ts).
--
-- Computed in the view, not stored on person: a gym's registry is small, the
-- `%word%` pattern could use no b-tree index anyway, and a new person column
-- would have to be added to the allowlist in guard_person_auth_link.
--
-- unaccent lives in `extensions`, as Supabase installs extensions. Should it
-- already be installed elsewhere (public, from the dashboard), it is moved, so
-- the qualified call below resolves either way. The one-argument unaccent()
-- finds its dictionary in its own schema, not through the caller's
-- search_path, which matters because the view runs as the invoker.

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'unaccent' and n.nspname <> 'extensions'
  ) then
    alter extension unaccent set schema extensions;
  end if;
end;
$$;

-- The same columns as 20260920010000, plus search_name at the end. drop +
-- create for the reason given there: replace cannot reshape an older view.
-- Nothing else reads member_overview, so dropping it takes nothing with it.
drop view if exists public.member_overview;

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
  coalesce(hours.total_hours, 0)::numeric as total_hours,
  lower(extensions.unaccent(p.full_name)) as search_name
from public.person p
left join lateral (
  select array_agg(ar.role::text order by ar.role::text) as active_roles
  from public.assigned_role ar
  where ar.person_id = p.id
    and ar.end_date is null
) roles on true
left join public.person_hours hours on hours.person_id = p.id;

grant select on public.member_overview to authenticated;
