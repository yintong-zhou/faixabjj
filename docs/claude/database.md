# Database (Supabase)

Plain SQL migrations in `supabase/migrations/` (Supabase CLI layout). Supabase (Postgres + Auth + RLS) **is** the backend.

## Migrations index

- `20260910000000_init_schema.sql` — tables `person`, `assigned_role`, `role_threshold`, `attendance`, `promotion_criteria`; enums `belt_rank`, `person_role`; view `person_hours`; RLS on everywhere, zero policies (default-deny).
- `20260910120000_admin_rls_policies.sql` — original flat policies. **Superseded**, history only.
- `20260911000000_account_management.sql` — profile trigger on `auth.users` insert + backfill, first `can_manage_users()`, anti-self-promotion guards.
- `20260911120000_role_based_access.sql` — **the current permission model** (adds `admin`, per-role policies). Read first when reasoning about access.
- `20260925000000`–`20260925050000` — multi-gym tenancy (`040000`: who may set `person.auth_user_id`; `050000`: auth trigger also on the app_metadata update). Read `docs/claude/gyms.md` first.
- `20260926000000_gym_location_checkin.sql` — `gym.latitude`/`longitude`, `gym_distance_m()` function, `check_in(session, lat, lng, accuracy)` RPC, `set_gym_location(latitude, longitude)` RPC. Read `docs/claude/attendance-and-dashboard.md` (Check-in) and `docs/claude/gyms.md` (Per-gym settings). **Apply BEFORE merging/deploying the app** — the app selects `gym.latitude`/`longitude` (`GYM_COLUMNS` in `frontend/utils/supabase/gym.ts`), which are unknown columns without it, and `getGymSettings` returns null, 404ing `requireGymSettings` on almost every gym page.
- `20260927000000_rank_write_guards.sql` — `guard_person_auth_link()` becomes an **allowlist** for non-editors (own row: only `full_name`, `phone`, `birth_date`, `notes`); nobody changes their own rank columns or `joined_at`; belt/stripes change, and `promotion` rows are inserted, **only inside `record_promotion()`** (transaction-local `faixa.recording_promotion`, not settable through the API). **Apply AFTER deploying the app** whose `addPerson` sets the starting belt with the service role: with the old app, adding a person would create the account and then fail on the belt ("account created, profile not saved").
- `20260928000000_delete_person_after_revoke.sql` — delete policy on `person` now also requires `auth_user_id is null` (revoke first). No deploy order.
- `20260930000000_person_username.sql` — `person.username` (check `person_username_format`, global unique index `person_username_unique`), backfilled for rows with an account by the same rule as `suggestUsername()`; `username` added to the guard's self-editable allowlist. **Apply BEFORE deploying the app**: `/account`, `/members/[id]` and the login select or write `username`, an unknown column without it.
- `20260930010000_login_username_lookup.sql` — `login_email_for_username(text)`, security definer, executable by `service_role` only (revoked from anon/authenticated): the login's username → account email lookup in one round trip. **Apply BEFORE deploying the app**: without it every username sign-in fails with PGRST202 and shows "wrong credentials".
- `20261002000000_gym_invite_registration.sql` — `gym_invite` (one link per gym, readable by user managers only), `registration_request` (pending self-registrations, written only by the service role), trigger `username_cross_unique` (a username is unique across `person` and `registration_request`; the same account may hold it on both sides, which is how approval moves it), `regenerate_invite_token()` (authenticated, own gym, `can_manage_users()`), `gym_for_invite()` and `username_available()` (service role only), and `login_email_for_username()` redefined to resolve pending accounts. **Apply BEFORE deploying the app**: `/gym`, `/join`, `/members` and the username login all call these.
- `20261004000000_platform_admin_username.sql` — `platform_admin.username` (format check, unique index), `set_platform_admin_username()` (authenticated, own row only, 42501 for anyone else), and `username_cross_unique()`, `username_available()`, `login_email_for_username()` redefined to include `platform_admin`. **Apply BEFORE deploying the app**: the superadmin `/account` selects `platform_admin.username` and calls the setter.
- `20261004010000_platform_dashboard.sql` — `platform_gym_activity(days)` and `platform_weekly_presences(weeks)`, security definer, rows only for a platform admin (none for anyone else), revoked from anon: the superadmin dashboard's counts. **Apply BEFORE deploying the app**: without them the superadmin's `/dashboard` shows the load-failed message.
- `20261005000000_rank_dates_teaching_staff.sql` — belt/stripe dates corrected by head_coach and instructor only, not admin: `can_correct_rank_dates()`, `correct_rank_dates(person, rank_since, stripe_since)` (security definer, own gym, never own row, no future, stripe ≥ belt; marker `faixa.correcting_rank_dates`), `current_access()` adds `canCorrectRankDates`, `guard_person_auth_link()` refuses any direct change of the two dates (editors included) outside that function or `record_promotion()`. **Apply BEFORE deploying the app**: the new `correctRankDates` calls the RPC (PGRST202 without it). With the old app after it, the admin's date correction fails with the generic error — harmless.
- `20261005010000_promotion_head_coach_only.sql` — `can_promote()` (active `head_coach`), `record_promotion()` checks it instead of `can_edit_registry()`, promotion insert/delete policies follow, `current_access()` adds `canPromote`. **Apply BEFORE deploying the app** (the app reads `canPromote`; without it nobody sees the promote panel). Apply after `20261005000000`.
- `20261006000000_app_log.sql` — `app_log` (errors and key events, ids only, never Postgres `details`), pruned on every insert by the statement trigger `app_log_prune` (`prune_app_log()`, security definer: older than 7 days, beyond the 2000 newest), readable only by `is_platform_admin()`, written only by the service role (`utils/log.ts`). Not a domain table: no `gym_id` scope, see `docs/claude/gyms.md`. **Apply BEFORE deploying the app**: without it every log write fails (console only, harmless) and `/logs` shows the load-failed message.
- `20260926010000_drop_direct_checkin.sql` — drops the RLS insert policy allowing direct member check-in; **applies only after the app calling `check_in()` is deployed**. Prevents bypass via direct insert. Apply AFTER the deploy; rolling the app back after this migration breaks member self check-in until the old policy is restored.

## Applying migrations

- **Applied by hand from the dashboard; the MCP here cannot do it.** Never run schema/RLS changes against whatever project the MCP shows — verify project ref `poksgledkecwviypspmi`. Paste into that project's SQL Editor, or connect the right MCP/CLI and re-check `list_migrations`.
- `supabase/scripts/` = SQL run by hand against live, **not** part of history: `register-applied-migrations.sql` (tells Supabase hand-pasted files are applied, so preview branches stop replaying them) and `diagnose-access.sql` (read-only; tells apart the faults that all end with staff seeing the allievo view). Keep them non-destructive; schema changes go in a migration.

## Idempotent ≠ order-independent

Several objects are defined in more than one migration; only the **last one run** survives:
- `current_access()`: `20260911120000`, `20260912010000`, `20260925030000` (adds `isPlatformAdmin`, `gymStatus`), `20261005000000` (adds `canCorrectRankDates`), `20261005010000` (last — adds `canPromote`)
- `member_overview`: `20260911140000`, `20260911200000`, `20260912000000`, `20260920010000`, `20260929000000` (adds `search_name`; **the last word now** — re-pasting `20260920010000` drops the column and breaks the Registro search)
- `person_hours`: `20260910000000`, `20260912000000`
- `guard_person_auth_link()`: `20260911000000`, `20260911120000`, `20260911200000`, `20260911220000`, `20260927000000`, `20260930000000`, `20261005000000` (last — re-pasting an earlier one lets the admin write rank dates directly again)
- `record_promotion()`: `20260918130000`, `20260919110000`, `20260927000000`, `20261005010000` (last — re-pasting `20260927000000` lets the admin promote again; an earlier one drops the marker, and every promotion then fails)
- `login_email_for_username()`: `20260930010000`, `20261002000000`, `20261004000000` (last)
- `username_cross_unique()`, `username_available()`: `20261002000000`, `20261004000000` (last — re-pasting the earlier one lets a member take the superadmin's username)
- `gym_timezone()`: was a constant, redefined in `20260925010000` to read the caller's gym; keeps its zero-argument signature
- policy `"members can check themselves in"`: created by `20260912010000`, dropped by `20260926010000`; re-pasting `20260912010000` alone silently restores the direct-insert bypass of `check_in()`

Pasting an earlier file alone silently reverts the object. Both past failures looked like data problems (staff falling back to member view; dashboard of zeros). Repairs `20260920000000_restore_current_access.sql` and `20260920010000_restore_member_overview.sql` restate the final definitions and sort last.

Rules: adding a field to one of these objects → **new** migration. Re-applying by hand → the **whole** history in name order, never one file.

## Every migration must be replay-safe

Pasting in the SQL Editor records nothing in `supabase_migrations.schema_migrations`, so preview branches clone the schema and replay "pending" migrations on top (that is how `42710: already exists` happened). Therefore:
- every `create policy` preceded by `drop policy if exists` of the **same** name; every `create trigger` by `drop trigger if exists`;
- `if not exists` on tables, indexes, columns, enum values; `if exists` on `drop column` / `drop constraint`;
- `or replace` on views and functions; `create type` / `add constraint` wrapped in `do $$ … exception when duplicate_object then null; end $$`;
- seeds `insert … on conflict do nothing`; corrective `update` guarded on the value being corrected;
- a view reshaped by a later migration uses `drop view if exists` + `create view` (replace cannot add/drop/rename columns — "cannot drop columns from view").

Known limits (structural, don't "fix"):
- `create table if not exists` skips a table with a different shape — not a substitute for a real migration.
- `20260910000000` cannot be replayed over a migrated DB: `20260912000000` drops `attendance.class_date`/`duration_hours`. From empty the history applies cleanly (21/21). For branches cloned from live, register migrations in `schema_migrations` instead.
- The `gym_scope` trigger's first-gym fallback (`docs/claude/gyms.md`) never applies to `person`. Re-running the old profile backfill migration (`20260911000000`) on the live project fails with "No gym for this row." once `admin@bjj.com` is recorded as the platform superadmin with no `person` row. The Docker replay can't catch this: the stub has no `auth.users` rows, so that backfill is a no-op there either way.

**Verify history changes by replaying, not reading:** `bash supabase/tests/replay.sh [--isolation]` — runs `postgres:17-alpine` in Docker, stubs Supabase (roles `anon`/`authenticated`/`service_role`, schema `auth`, `auth.users`, `auth.uid()`), runs every file in name order with `psql -v ON_ERROR_STOP=1`, **twice**, and with `--isolation` also runs `supabase/tests/tenant-isolation.sql`. This caught bugs reading the diff missed. Never run anything in `supabase/tests/` against a real project.

## Views

**`security_invoker = on` is mandatory on every view** — otherwise it runs with owner privileges and an allievo reads the whole gym. (`person_hours` lacked it originally; fixed in the Registro migration.) Check on any new view.

## Frontend ↔ Supabase

Direct `@supabase/supabase-js` + `@supabase/ssr`, no custom API layer (the user's JWT must reach Postgres for RLS).
- `frontend/utils/supabase/client.ts` — browser client.
- `frontend/utils/supabase/server.ts` — `createClient(await cookies())` for Server Components/Actions/Route Handlers.
- `frontend/utils/supabase/proxy.ts` + `frontend/proxy.ts` — refresh auth cookie, gate routes. Next.js renamed `middleware.ts` → `proxy.ts`; don't recreate the old name.
- `.env.example` is the template; `.env.local` (gitignored) has real values. Uses the **publishable** key `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, not legacy `anon` — don't rename.
- `utils/supabase/admin.ts` reads `SUPABASE_SECRET_KEY`, is `server-only`, **bypasses RLS** — every server action using it re-checks its guard.
