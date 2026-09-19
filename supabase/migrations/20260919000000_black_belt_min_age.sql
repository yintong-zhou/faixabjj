-- FAIXABJJ — the black belt's minimum age is 18, not 19
--
-- 20260918100000_promotion_criteria.sql seeded (black, 0) with
-- min_age_years = 19, taken from belt-criteria.md as it then stood. That figure
-- came from the community summary, not from the federation. The IBJJF *General
-- System of Graduation* gives **18** for brown -> black, and belt-criteria.md
-- has since been merged with the IBJJF document and states that where the two
-- disagree the federation wins. So the seeded value was simply wrong.
--
-- This is a corrective migration rather than an edit to 20260918100000 because
-- that one has been applied. Editing an applied migration leaves the database
-- and the file describing different things, and the next person to replay the
-- history from scratch gets a third state.
--
-- Guarded on the value still being 19: the criteria panel on /members exists so
-- the gym can tune these numbers, and a correction to a seeded default must
-- never overwrite a figure somebody has since chosen on purpose.
update public.promotion_criteria
   set min_age_years = 18,
       notes = 'brown_to_black: IBJJF minimum 1 year and 18 years of age, 144 h at 3x/week (belt-criteria.md)'
 where belt = 'black'
   and stripe = 0
   and min_age_years = 19;

comment on column public.promotion_criteria.min_age_years is
  'Minimum age in whole years, null when the grade has none. Seeded only for brown->black (IBJJF: 18); the IBJJF minimums for blue (16), purple (16) and brown (18) are modelled in belt-criteria.md but deliberately left unseeded.';

-- ---------------------------------------------------------------------------
-- The other three IBJJF age minimums — NOT applied, on purpose
-- ---------------------------------------------------------------------------
-- The merged belt-criteria.md also carries ibjjf_age_min_years for the three
-- lower transitions: 16 for white -> blue, 16 for blue -> purple, 18 for
-- purple -> brown. They are left out of this migration because seeding them is
-- not a correction, it is a behaviour change: promotionStatus() reads
-- min_age_years generically, so the moment these rows carry an age, every
-- member below it stops appearing in the eligible count, in the ?idonei=1
-- filter and with the green dot on their row. A gym with a children's course
-- would see its white belts drop out of the queue overnight.
--
-- That is the correct IBJJF behaviour and may well be what this gym wants, but
-- it is a decision about who the queue is for, not a typo being fixed — the
-- same reason the first head_coach insert sits commented out at the bottom of
-- the account-management migrations instead of running itself.
--
-- To adopt them, run this by hand from the SQL Editor (or uncomment it into a
-- migration of its own, which is the better record):
--
--   update public.promotion_criteria set min_age_years = 16
--    where belt = 'blue'   and stripe = 0 and min_age_years is null;
--   update public.promotion_criteria set min_age_years = 16
--    where belt = 'purple' and stripe = 0 and min_age_years is null;
--   update public.promotion_criteria set min_age_years = 18
--    where belt = 'brown'  and stripe = 0 and min_age_years is null;
--
-- Note that an age minimum makes birth_date load-bearing: promotionStatus()
-- treats a missing date as a failed check ("missing-birth-date"), never as a
-- passed one, so members with no birth date on file will leave the queue too.
