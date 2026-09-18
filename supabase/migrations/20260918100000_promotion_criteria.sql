-- FAIXABJJ — promotion criteria: the numbers behind the eligibility alerts
--
-- Source: belt-criteria.md, at three sessions a week — the same frequency the
-- app already assumes in frontend/utils/hours.ts (LESSONS_PER_WEEK). Where the
-- document gives an IBJJF minimum it is used; where it gives only a practical
-- range, the lower bound is used, because this table answers "from when may an
-- instructor consider it", not "when should it happen".
--
-- A row means: WHAT IS REQUIRED TO REACH THIS GRADE.
--   (blue, 0)    = what it takes to be given the blue belt
--   (blue, 1..4) = what it takes to be given the n-th stripe on blue
--
-- The time column is anchored differently in the two cases, and this is the
-- one thing to get right when reading it:
--   stripe = 0 → measured from person.rank_since   (the belt date)
--   stripe > 0 → measured from person.stripe_since (the last stripe date)
--
-- There is deliberately no (black, 1..4): the black belt has no stripes but
-- degrees, which are out of scope. No row means no modelled next step, which
-- is exactly what should be shown for someone already at black.
--
-- min_hours is in CLOCK HOURS, like the document. The app counts attendance
-- and calls each row an "hour"; frontend/utils/hours.ts converts with
-- SESSION_LENGTH_HOURS = 1.5. Do not "fix" these numbers into attendance
-- counts — the conversion has a single home, and it is not this table.

alter table public.promotion_criteria
  add column if not exists min_age_years smallint
  check (min_age_years is null or min_age_years between 0 and 99);

comment on column public.promotion_criteria.min_age_years is
  'Minimum age in whole years, null when the grade has none. Only brown->black has one (IBJJF: 19).';

comment on column public.promotion_criteria.min_hours is
  'Clock hours required at the current grade. Converted from attendance counts by SESSION_LENGTH_HOURS in the app, never stored as attendance counts.';

comment on column public.promotion_criteria.min_time_at_rank_days is
  'Days at the current grade. Measured from person.rank_since when stripe = 0, from person.stripe_since otherwise.';

-- ---------------------------------------------------------------------------
-- Belt transitions — from belt-criteria.md "transitions" and "hours_by_transition"
-- ---------------------------------------------------------------------------
-- `on conflict do nothing` on purpose: re-running this migration must never
-- overwrite numbers the gym has since tuned from the app.
insert into public.promotion_criteria
  (belt, stripe, min_hours, min_time_at_rank_days, min_age_years, notes)
values
  ('blue',   0, 108, 183, null, 'white_to_blue: practical minimum 0.5 years, 108 h at 3x/week'),
  ('purple', 0, 432, 730, null, 'blue_to_purple: IBJJF minimum 2 years, 432 h at 3x/week'),
  ('brown',  0, 324, 548, null, 'purple_to_brown: IBJJF minimum 1.5 years, 324 h at 3x/week'),
  ('black',  0, 216, 365,   19, 'brown_to_black: IBJJF minimum 1 year and 19 years of age, 216 h at 3x/week')
on conflict (belt, stripe) do nothing;

-- ---------------------------------------------------------------------------
-- Stripes — NOT from the document
-- ---------------------------------------------------------------------------
-- belt-criteria.md gives only an interval ("stripe_interval_months: [2, 4],
-- shorter at white/blue, longer at higher belts") and no hours at all. The
-- numbers below are therefore an informed guess, not a source: 2 months on
-- white and blue, 3 on purple, 4 on brown, with the hours those intervals
-- imply at three 1.5 h lessons a week. They are seeded so the feature works on
-- day one; the criteria page exists so the gym can correct them.
insert into public.promotion_criteria
  (belt, stripe, min_hours, min_time_at_rank_days, notes)
select
  b.belt,
  s.stripe::smallint,
  b.hours,
  b.days,
  'stripe interval: not in belt-criteria.md, seeded as an estimate and meant to be tuned'
from (values
  ('white'::belt_rank,  40,  61),
  ('blue'::belt_rank,   40,  61),
  ('purple'::belt_rank, 60,  91),
  ('brown'::belt_rank,  80, 122)
) as b(belt, hours, days)
cross join generate_series(1, 4) as s(stripe)
on conflict (belt, stripe) do nothing;

-- ---------------------------------------------------------------------------
-- Reading the criteria is staff business
-- ---------------------------------------------------------------------------
-- Until now this table was readable by every authenticated user, which was
-- harmless while it was empty. Filled, it is exactly the table that tells a
-- student how far they are from the next grade — the one thing the app has
-- decided not to show them. Hiding it in the UI would leave two API calls
-- between a student and the number, so the rule is enforced here instead.
drop policy if exists "authenticated can select promotion_criteria" on public.promotion_criteria;
create policy "registry viewers can select promotion_criteria" on public.promotion_criteria
  for select to authenticated
  using (public.can_view_registry());
