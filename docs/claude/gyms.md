# Multi-gym tenancy and the platform superadmin

Faixa BJJ is the **product**; it hosts isolated gyms that share nothing. The first gym is **ASD Little Gym**, which holds every row that predates tenancy. Spec: `docs/superpowers/specs/2026-09-24-multi-gym-design.md`.

## Isolation

- Every domain table (`person`, `assigned_role`, `role_threshold`, `attendance`, `promotion_criteria`, `course`, `class_session`, `promotion`) has `gym_id not null references gym on delete cascade`.
- **One RESTRICTIVE policy per table, `"gym isolation"`** (`20260925020000`): `gym_id = current_gym_id()`. Postgres ANDs it with every permissive policy, so existing rules need no rewrite and a new policy is covered automatically. **A new domain table must get `gym_id`, the `gym_scope` trigger and this policy**, or it leaks across gyms.
- `current_gym_id()` is null for the superadmin, for an account without a profile, and for a **suspended** gym — that is how suspension hides data and refuses writes from one place.
- Trigger `gym_scope` (`20260925010000`) fills `gym_id` from the caller, freezes it, and refuses references to another gym's rows (person, course, session, instructor, promoter). RLS alone checks only the new row's own `gym_id`. Refusals use `42501`, like RLS.
- **SQL with no API request (a migration, the SQL Editor) that names no gym writes into the first gym** — the one every pre-tenancy row belongs to — so the pre-tenancy seed migrations stay replayable. Never for `person`. Name `gym_id` explicitly in any hand-written insert.
- `gym_timezone()` keeps its zero-argument signature and reads the caller's gym: every reader of a session is in that session's gym.
- Views need nothing: all are `security_invoker`, so RLS isolates them.
- `session_checkin_open()` is redefined in `20260925030000` to scope its lookup to the caller's own gym: it returns `false` for another gym's session (or a suspended one) and for a caller with no current gym, instead of answering as it would for the caller's own session. The filter sits inside the selected expression wrapped in `coalesce`, not the `WHERE` clause — a `WHERE` filter would turn a cross-gym lookup into no row, i.e. null, and null is not the `false` its callers test for.
- Verified by `bash supabase/tests/replay.sh --isolation` (`supabase/tests/tenant-isolation.sql`, checks T1–T13). **Re-run it after any policy, trigger, security definer or table change.** Never run anything in `supabase/tests/` against a real project.

## The platform superadmin

- Row in `platform_admin` (granted by hand: `supabase/scripts/bootstrap-platform-admin.sql`), **no `person` row**: no gym, no belt, no hours. The bootstrap script also removes `admin@bjj.com`'s existing gym `person`/role rows, and aborts if that account is recorded as a course or session instructor (or has attendance or promotions) rather than silently orphaning them.
- Sees `gym` and two definer functions only: `gym_overview()` (aggregates) and `gym_managers(gym_id)` (a gym's admins). Never students, attendance or promotions — least privilege, and the platform is the gyms' data processor.
- `current_access()` (final definition in `20260925030000`) adds `isPlatformAdmin` and `gymStatus`; the four gym flags are false outside an active gym.
- `requireAdmin()` redirects a suspended gym's users to `/suspended`, sends the superadmin from `/dashboard` to `/gyms`, and answers 404 on every other gym page for them. `requirePlatformAdmin()` guards `/gyms/*` (404).
- Nav for the superadmin: *Palestre*, *Account*. `/account` shows email and password only.

## Gym managers

- A manager is the gym's existing `admin` role (portal-only, no belt — `isPortalOnly()`), created by the superadmin on the shared default password with the forced change.
- **An account's gym lives in `app_metadata.gym_id`**, set by whoever creates it; the auth trigger reads it to create or link the person row. No `gym_id`, no profile.
- `inviteUserByEmail` cannot set `app_metadata`, so `inviteToPortal` links the person row itself with the service role after checking the row is in the caller's gym and account-less. It takes the invite's email and name from the RLS-visible target row, never from the form, refuses an invited user who already belongs to another gym or is already linked to a person row, and links with `.select("id")` plus a zero-row check before it writes `app_metadata.gym_id` — an `.update()` that matches no row reports no error, so a lost race must be treated as a failure explicitly.
- Every service-role action on an account first checks, through the user's own client (`personInMyGym()` in `app/members/actions.ts`, `gym_managers()` via `managerOf()` in `app/gyms/actions.ts`), that the target belongs to the gym being acted on.
- `deleteGym` refuses to delete when the account lookup fails: the accounts to remove are read *before* the gym row is deleted (its cascade erases every `person` row, the only record of who to delete from `auth`), so a failed lookup is a precondition, not a detail to log and carry on from.
- `addManager` treats an existing open `admin` role as success (re-adding someone `revokeManager` only removed the auth account for hits `assigned_role_active_unique` with `23505`, not a real failure), and deletes the just-created auth user if the role cannot be assigned or linked — a manager is never left as a bare account.

## Per-gym settings

- `gym.timezone`, `tracking_started_on`, `session_length_hours`, `lessons_per_week`; read once per request by `getGymSettings()` (`utils/supabase/gym.ts`).
- `utils/hours.ts` and `utils/promotion.ts` take them as a required parameter (`HoursSettings`); the old constants survive only as defaults for a new gym in `utils/gym-defaults.ts`.
- "Today" at a gym is `todayIn(gym.timezone)`, not the UTC date.
- A new gym gets a copy of `promotion_criteria_template` (snapshot taken at migration time) via trigger `gym_seed_criteria`.

## Deleting a gym

Only when suspended, with the exact name typed (`deletionConfirmed()`). The `gym` row is deleted first — the cascade erases everything — then its auth accounts with the service role; failures are reported as a count. `guard_course_delete` lets the cascade through (the parent `gym` is already gone) and still refuses a direct delete of a course with attendance.
