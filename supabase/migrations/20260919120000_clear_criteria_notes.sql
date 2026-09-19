-- FAIXABJJ — the seeded criteria notes are cleared
--
-- 20260918100000 seeded a `notes` value on all twenty criteria rows, recording
-- where each number came from: "white_to_blue: practical minimum 0.5 years,
-- 72 h at 3x/week (belt-criteria.md)" and, on every stripe row, "stripe
-- interval: not in belt-criteria.md, seeded as an estimate and meant to be
-- tuned". 20260919000000 rewrote the black belt's to match the corrected age.
--
-- That was provenance for whoever read the migration, and it should have stayed
-- there. `notes` is a free-text field the gym edits on /members/criteria, so
-- every row opened with a line of English developer prose sitting in the box —
-- text the reader did not write, cannot act on, and has to clear before writing
-- anything of their own. The reasoning is not lost: it is in the migrations and
-- in belt-criteria.md, which is where it belongs.
--
-- Cleared rather than the seeding removed, because 20260918100000 has been
-- applied and an applied migration is not edited. A from-scratch replay seeds
-- the notes and this migration clears them again, which ends in the same state.
--
-- The guard is the document's own name: every seeded note mentions
-- belt-criteria.md, and a note somebody at the gym has since written will not.
-- A correction to a seeded default must never overwrite a deliberate entry —
-- the same rule the age corrections follow.
update public.promotion_criteria
   set notes = null
 where notes like '%belt-criteria.md%';

comment on column public.promotion_criteria.notes is
  'Free text for the gym, shown and edited on /members/criteria. Left empty on purpose: the provenance of the seeded numbers lives in the migrations and in belt-criteria.md, not in a field somebody has to clear before writing their own note.';
