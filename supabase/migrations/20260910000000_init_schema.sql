-- FAIXABJJ — initial schema
-- Entities per README.md "Data model (summary)": Person, AssignedRole, RoleThreshold,
-- Attendance, PromotionCriteria.

create extension if not exists pgcrypto;

-- Belt ranks and person roles used across several tables.
create type belt_rank as enum ('white', 'blue', 'purple', 'brown', 'black');
create type person_role as enum ('student', 'assistant', 'instructor', 'head_coach');

-- ---------------------------------------------------------------------------
-- Person — single unified registry for students and instructors. The same
-- person can hold multiple roles at once (see assigned_role) as their rank
-- grows, so role is not a column here.
-- ---------------------------------------------------------------------------
create table person (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users (id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  birth_date date,
  joined_at date not null default current_date,
  current_belt belt_rank not null default 'white',
  current_stripes smallint not null default 0 check (current_stripes between 0 and 4),
  rank_since date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index person_auth_user_id_key on person (auth_user_id) where auth_user_id is not null;
create index person_email_idx on person (email) where email is not null;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger person_set_updated_at
before update on person
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- AssignedRole — role history per person, with start/end dates. A person can
-- hold several different roles concurrently (e.g. student + assistant), but
-- not two active assignments of the *same* role at once.
-- ---------------------------------------------------------------------------
create table assigned_role (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person (id) on delete cascade,
  role person_role not null,
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now(),
  constraint assigned_role_dates_check check (end_date is null or end_date >= start_date)
);

create index assigned_role_person_id_idx on assigned_role (person_id);
create unique index assigned_role_active_unique on assigned_role (person_id, role) where end_date is null;

-- ---------------------------------------------------------------------------
-- RoleThreshold — suggested (never automatic) belt threshold per role.
-- ---------------------------------------------------------------------------
create table role_threshold (
  role person_role primary key,
  suggested_min_belt belt_rank not null,
  suggested_min_stripes smallint not null default 0 check (suggested_min_stripes between 0 and 4),
  notes text
);

-- ---------------------------------------------------------------------------
-- Attendance — present/absent per person/date, one row per class day, with a
-- reference to who led the session.
-- ---------------------------------------------------------------------------
create table attendance (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person (id) on delete cascade,
  class_date date not null,
  present boolean not null default true,
  duration_hours numeric(4, 2) not null default 1.5 check (duration_hours > 0),
  led_by uuid references person (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  unique (person_id, class_date)
);

create index attendance_person_id_idx on attendance (person_id);
create index attendance_class_date_idx on attendance (class_date);
create index attendance_led_by_idx on attendance (led_by) where led_by is not null;

-- Automatic hour count per person, derived from attendance.
create view person_hours as
select
  person_id,
  sum(duration_hours) filter (where present) as total_hours
from attendance
group by person_id;

-- ---------------------------------------------------------------------------
-- PromotionCriteria — configurable hour and time-at-rank thresholds per
-- belt/stripe. Used to power eligibility alerts; promotions themselves stay
-- a manual instructor decision.
-- ---------------------------------------------------------------------------
create table promotion_criteria (
  belt belt_rank not null,
  stripe smallint not null check (stripe between 0 and 4),
  min_hours numeric(6, 1) not null,
  min_time_at_rank_days integer not null,
  notes text,
  primary key (belt, stripe)
);

-- ---------------------------------------------------------------------------
-- Row Level Security — enabled here; policies (based on a person's active
-- role, per README's "Permissions" architecture) are a separate follow-up.
-- ---------------------------------------------------------------------------
alter table person enable row level security;
alter table assigned_role enable row level security;
alter table role_threshold enable row level security;
alter table attendance enable row level security;
alter table promotion_criteria enable row level security;
