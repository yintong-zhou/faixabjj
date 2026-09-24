-- FAIXABJJ — one portal, many gyms
--
-- Faixa BJJ is the product; the gyms it hosts are isolated tenants that share
-- nothing. Every domain table gets a gym_id, and the rows that existed before
-- this migration all belong to the first gym, ASD Little Gym.
--
-- This file only shapes the data. Isolation itself is the restrictive policy
-- in 20260925020000; the triggers that fill, freeze and cross-check gym_id are
-- in 20260925010000.

do $$
begin
  create type public.gym_status as enum ('active', 'suspended');
exception when duplicate_object then null;
end $$;

create table if not exists public.gym (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 120),
  status public.gym_status not null default 'active',
  timezone text not null default 'Europe/Rome',
  -- Before this day hours are estimated, from it on they are counted. See
  -- frontend/utils/hours.ts for why it must be the real go-live date.
  tracking_started_on date not null default current_date,
  session_length_hours numeric(3, 1) not null default 1 check (session_length_hours > 0),
  lessons_per_week numeric(3, 1) not null default 3 check (lessons_per_week > 0),
  created_at timestamptz not null default now()
);

-- The first gym, holding every row that predates multi-tenancy. Guarded on
-- the table being empty rather than on the name: the superadmin may rename it,
-- and a replay must not then create a second one.
insert into public.gym (name, timezone, tracking_started_on, session_length_hours, lessons_per_week)
select 'ASD Little Gym', 'Europe/Rome', date '2026-09-13', 1, 3
where not exists (select 1 from public.gym);

-- The platform superadmin sits outside every gym: no person row, so no belt,
-- no hours and nothing in any gym's registry. Granted by hand only
-- (supabase/scripts/bootstrap-platform-admin.sql), never by a migration.
create table if not exists public.platform_admin (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- The criteria a new gym starts from: a snapshot of the thresholds as they
-- stand today. `on conflict do nothing` keeps the first snapshot on a replay,
-- when promotion_criteria already holds several gyms' tuned numbers.
create table if not exists public.promotion_criteria_template (
  belt belt_rank not null,
  stripe smallint not null check (stripe between 0 and 4),
  min_hours numeric(6, 1) not null,
  min_time_at_rank_days integer not null,
  min_age_years smallint,
  primary key (belt, stripe)
);

insert into public.promotion_criteria_template
  (belt, stripe, min_hours, min_time_at_rank_days, min_age_years)
select belt, stripe, min_hours, min_time_at_rank_days, min_age_years
from public.promotion_criteria
on conflict do nothing;

-- gym_id on every domain table: added nullable, backfilled onto the first gym,
-- then made mandatory. `where gym_id is null` makes the backfill a no-op on a
-- replay.
alter table public.person add column if not exists gym_id uuid references public.gym (id) on delete cascade;
alter table public.assigned_role add column if not exists gym_id uuid references public.gym (id) on delete cascade;
alter table public.role_threshold add column if not exists gym_id uuid references public.gym (id) on delete cascade;
alter table public.attendance add column if not exists gym_id uuid references public.gym (id) on delete cascade;
alter table public.promotion_criteria add column if not exists gym_id uuid references public.gym (id) on delete cascade;
alter table public.course add column if not exists gym_id uuid references public.gym (id) on delete cascade;
alter table public.class_session add column if not exists gym_id uuid references public.gym (id) on delete cascade;
alter table public.promotion add column if not exists gym_id uuid references public.gym (id) on delete cascade;

update public.person set gym_id = (select id from public.gym order by created_at limit 1) where gym_id is null;
update public.assigned_role set gym_id = (select id from public.gym order by created_at limit 1) where gym_id is null;
update public.role_threshold set gym_id = (select id from public.gym order by created_at limit 1) where gym_id is null;
update public.attendance set gym_id = (select id from public.gym order by created_at limit 1) where gym_id is null;
update public.promotion_criteria set gym_id = (select id from public.gym order by created_at limit 1) where gym_id is null;
update public.course set gym_id = (select id from public.gym order by created_at limit 1) where gym_id is null;
update public.class_session set gym_id = (select id from public.gym order by created_at limit 1) where gym_id is null;
update public.promotion set gym_id = (select id from public.gym order by created_at limit 1) where gym_id is null;

alter table public.person alter column gym_id set not null;
alter table public.assigned_role alter column gym_id set not null;
alter table public.role_threshold alter column gym_id set not null;
alter table public.attendance alter column gym_id set not null;
alter table public.promotion_criteria alter column gym_id set not null;
alter table public.course alter column gym_id set not null;
alter table public.class_session alter column gym_id set not null;
alter table public.promotion alter column gym_id set not null;

create index if not exists person_gym_id_idx on public.person (gym_id);
create index if not exists assigned_role_gym_id_idx on public.assigned_role (gym_id);
create index if not exists attendance_gym_id_idx on public.attendance (gym_id);
create index if not exists course_gym_id_idx on public.course (gym_id);
create index if not exists class_session_gym_id_idx on public.class_session (gym_id);
create index if not exists promotion_gym_id_idx on public.promotion (gym_id);

-- Criteria and role thresholds are per gym: the key gains gym_id. Dropped and
-- re-added under the same name, which a replay repeats harmlessly.
alter table public.promotion_criteria drop constraint if exists promotion_criteria_pkey;
alter table public.promotion_criteria add constraint promotion_criteria_pkey primary key (gym_id, belt, stripe);

alter table public.role_threshold drop constraint if exists role_threshold_pkey;
alter table public.role_threshold add constraint role_threshold_pkey primary key (gym_id, role);
