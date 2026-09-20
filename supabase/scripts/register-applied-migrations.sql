-- Registers the migration history as already applied.
--
-- Run this once, in the SQL Editor of project poksgledkecwviypspmi, against the
-- live database only.
--
-- Why it is needed. Every file in supabase/migrations/ has been pasted into the
-- SQL Editor by hand. That executes the statements but records nothing in
-- supabase_migrations.schema_migrations, so Supabase still believes each file is
-- pending. A preview branch clones the schema — effects and all — and then
-- replays the whole "pending" history on top of it, which is where the
-- `42710: policy ... already exists` failures came from. Registering the
-- versions tells Supabase the truth: these are applied, do not replay them.
--
-- It does not run any migration and changes no schema. It writes one row per
-- file, keyed by the timestamp in the filename, and leaves alone any version
-- already recorded.
--
-- Prerequisite: every file listed below must genuinely have been applied to this
-- database. Registering a version that was never run makes Supabase skip it
-- forever, which is worse than replaying it. Check a couple of the later ones
-- first — `select proname from pg_proc where proname = 'record_promotion'` for
-- 20260918130000, `select 1 from pg_enum where enumlabel = 'grey_white'` for
-- 20260919100000 — and do not run this until they answer.
--
-- From here on use `supabase db push`, which registers what it applies by
-- itself, and this script stops being needed.

insert into supabase_migrations.schema_migrations (version, name)
values
  ('20260910000000', 'init_schema'),
  ('20260910120000', 'admin_rls_policies'),
  ('20260911000000', 'account_management'),
  ('20260911120000', 'role_based_access'),
  ('20260911140000', 'member_overview'),
  ('20260911160000', 'link_invited_person'),
  ('20260911200000', 'belt_since'),
  ('20260911220000', 'stripe_since'),
  ('20260912000000', 'class_schedule'),
  ('20260912010000', 'class_schedule_access'),
  ('20260913000000', 'session_instructor_backfill'),
  ('20260918000000', 'checkin_window_defaults'),
  ('20260918010000', 'suspended_course_checkin'),
  ('20260918100000', 'promotion_criteria'),
  ('20260918110000', 'person_rank_hours'),
  ('20260918120000', 'promotion_history'),
  ('20260918130000', 'record_promotion'),
  ('20260919000000', 'black_belt_min_age'),
  ('20260919100000', 'kid_belt_ranks'),
  ('20260919110000', 'kid_belt_promotion'),
  ('20260919120000', 'clear_criteria_notes'),
  ('20260920000000', 'restore_current_access')
on conflict (version) do nothing;

-- Check: this must list all 22 versions above, and nothing pending.
select version, name
from supabase_migrations.schema_migrations
order by version;
