# Database (Supabase)

Plain SQL migrations in `supabase/migrations/` (Supabase CLI layout). Supabase (Postgres + Auth + RLS) **is** the backend.

## Migrations index

- `20260910000000_init_schema.sql` — tables `person`, `assigned_role`, `role_threshold`, `attendance`, `promotion_criteria`; enums `belt_rank`, `person_role`; view `person_hours`; RLS on everywhere, zero policies (default-deny).
- `20260910120000_admin_rls_policies.sql` — original flat policies. **Superseded**, history only.
- `20260911000000_account_management.sql` — profile trigger on `auth.users` insert + backfill, first `can_manage_users()`, anti-self-promotion guards.
- `20260911120000_role_based_access.sql` — **the current permission model** (adds `admin`, per-role policies). Read first when reasoning about access.
- `20260925000000`–`20260925050000` — multi-gym tenancy (`040000`: who may set `person.auth_user_id`; `050000`: auth trigger also on the app_metadata update). Read `docs/claude/gyms.md` first.
- `20260926000000_gym_location_checkin.sql` — `gym.latitude`/`longitude`, `attendance.gym_distance_m`, `check_in(session, lat, lng, accuracy)` RPC, `set_gym_location(latitude, longitude)` RPC. Read `docs/claude/attendance-and-dashboard.md` (Check-in) and `docs/claude/gyms.md` (Per-gym settings).
- `20260926010000_drop_direct_checkin.sql` — drops the RLS insert policy allowing direct member check-in; **applies only after the app calling `check_in()` is deployed**. Prevents bypass via direct insert.

## Applying migrations

- **Applied by hand from the dashboard; the MCP here cannot do it.** Never run schema/RLS changes against whatever project the MCP shows — verify project ref `poksgledkecwviypspmi`. Paste into that project's SQL Editor, or connect the right MCP/CLI and re-check `list_migrations`.
- `supabase/scripts/` = SQL run by hand against live, **not** part of history: `register-applied-migrations.sql` (tells Supabase hand-pasted files are applied, so preview branches stop replaying them) and `diagnose-access.sql` (read-only; tells apart the faults that all end with staff seeing the allievo view). Keep them non-destructive; schema changes go in a migration.

## Idempotent ≠ order-independent

Several objects are defined in more than one migration; only the **last one run** survives:
- `current_access()`: `20260911120000`, `20260912010000`, `20260925030000` (now the last definition — adds `isPlatformAdmin`, `gymStatus`)
- `member_overview`: `20260911140000`, `20260911200000`, `20260912000000`
- `person_hours`: `20260910000000`, `20260912000000`
- `gym_timezone()`: was a constant, redefined in `20260925010000` to read the caller's gym; keeps its zero-argument signature

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
