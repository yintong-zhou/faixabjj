# Multi-gym tenancy and the platform superadmin

Faixa BJJ is the **product**; it hosts isolated gyms that share nothing. The first gym is **ASD Little Gym**, which holds every row that predates tenancy. Spec: `docs/superpowers/specs/2026-09-24-multi-gym-design.md`.

## Isolation

- Every domain table (`person`, `assigned_role`, `role_threshold`, `attendance`, `promotion_criteria`, `course`, `class_session`, `promotion`, `gym_invite`, `registration_request`) has `gym_id not null references gym on delete cascade`.
- **One RESTRICTIVE policy per table, `"gym isolation"`** (`20260925020000`): `gym_id = current_gym_id()`. Postgres ANDs it with every permissive policy, so existing rules need no rewrite and a new policy is covered automatically. **A new domain table must get `gym_id`, the `gym_scope` trigger and this policy**, or it leaks across gyms.
- `current_gym_id()` is null for the superadmin, for an account without a profile, and for a **suspended** gym — that is how suspension hides data and refuses writes from one place.
- Trigger `gym_scope` (`20260925010000`) fills `gym_id` from the caller, freezes it, and refuses references to another gym's rows (person, course, session, instructor, promoter). RLS alone checks only the new row's own `gym_id`. Refusals use `42501`, like RLS.
- **SQL with no API request (a migration, the SQL Editor) that names no gym writes into the first gym** — the one every pre-tenancy row belongs to — so the pre-tenancy seed migrations stay replayable. Never for `person`. Name `gym_id` explicitly in any hand-written insert.
- Trigger `guard_person_auth_user` (`20260925040000`) guards `person.auth_user_id`, the proof every service-role account action relies on: an end-user JWT may set it only to `auth.uid()` or null (service role, the auth trigger and plain SQL may link any account), and **nobody** may link a `platform_admin` account. Without it a manager could point a row at the superadmin and reset its password.
- `gym_timezone()` keeps its zero-argument signature and reads the caller's gym: every reader of a session is in that session's gym.
- Views need nothing: all are `security_invoker`, so RLS isolates them.
- `session_checkin_open()` is redefined in `20260925030000` to scope its lookup to the caller's own gym: it returns `false` for another gym's session (or a suspended one) and for a caller with no current gym, instead of answering as it would for the caller's own session. The filter sits inside the selected expression wrapped in `coalesce`, not the `WHERE` clause — a `WHERE` filter would turn a cross-gym lookup into no row, i.e. null, and null is not the `false` its callers test for.
- Verified by `bash supabase/tests/replay.sh --isolation` (`supabase/tests/tenant-isolation.sql`, checks T1–T14). **Re-run it after any policy, trigger, security definer or table change.** Never run anything in `supabase/tests/` against a real project.

## The platform superadmin

- Row in `platform_admin` (granted by hand: `supabase/scripts/bootstrap-platform-admin.sql`), **no `person` row**: no gym, no belt, no hours. The bootstrap script also removes `admin@bjj.com`'s existing gym `person`/role rows, and aborts if that account is recorded as a course or session instructor (or has attendance or promotions) rather than silently orphaning them.
- Sees `gym` and four definer functions only: `gym_overview()` (aggregates), `gym_managers(gym_id)` (a gym's admins), and for its dashboard `platform_gym_activity(days)` and `platform_weekly_presences(weeks)` (`20261004010000`: counts of lessons, presences, self check-ins, last lesson date, pending requests). Never a student, an attendance row or a promotion — **counts only, aggregated inside the database**; least privilege, and the platform is the gyms' data processor. Anything new for the superadmin follows the same rule: a definer function returning aggregates, `where public.is_platform_admin()`.
- `current_access()` (final definition in `20260925030000`) adds `isPlatformAdmin` and `gymStatus`; the four gym flags are false outside an active gym.
- `requireAdmin()` redirects a suspended gym's users — and any non-superadmin account in no gym (an orphan) — to `/suspended`, which tells the two apart, and answers 404 on every other gym page for them. `requirePlatformAdmin()` guards `/gyms/*` (404).
- Nav for the superadmin: *Dashboard*, *Palestre*, *Account* (`PLATFORM_PATHS` in `require-admin.ts`). `/dashboard` draws `app/dashboard/platform-dashboard.tsx`: active gyms, active people, presences and lessons over 30 days, presences per week over 12 weeks (the same `AttendanceChart`), and one row per gym with an idle flag for an active gym without lessons in 30 days. A presence counts as on the gym's own chart: present, on a non-cancelled lesson. `/account` shows username, email and password only (`updatePlatformAccount`); the username is on its `platform_admin` row, written only by `set_platform_admin_username()`.

## Gym managers

- A manager is the gym's existing `admin` role (portal-only, no belt — `isPortalOnly()`), created by the superadmin on a unique temporary password (shown once) with the forced change.
- **An account's gym lives in `app_metadata.gym_id`**, set by whoever creates it; the auth trigger reads it to create or link the person row. No `gym_id`, no profile. **GoTrue's admin `createUser` writes `app_metadata` in an UPDATE after the insert**, so the trigger also runs on `update of raw_app_meta_data` (`20260925050000`), acting only when the gym just appeared on an account no person holds and that is not a platform admin; insert-only, every `addManager`/`addPerson` rolled back. Pre-tenancy accounts got it from their person row (`20260925040000`); `setTemporaryPassword`/`revokeAccess` refuse an account whose `gym_id` is not the caller's, or a platform admin.
- `restoreAccess` creates the account with no `gym_id` and links the person row itself with the service role after checking the row is in the caller's gym and account-less. It takes email and name from the RLS-visible target row, never from the form, and links with `.select("id")` plus a zero-row check before it writes `app_metadata.gym_id` — an `.update()` that matches no row reports no error, so a lost race must be treated as a failure explicitly (and the new account is deleted).
- Every service-role action on an account first checks, through the user's own client (`personInMyGym()` in `app/members/actions.ts`, `gym_managers()` via `managerOf()` in `app/gyms/actions.ts`), that the target belongs to the gym being acted on.
- `deleteGym` refuses to delete when the account lookup fails: the accounts to remove are read *before* the gym row is deleted (its cascade erases every `person` row, the only record of who to delete from `auth`), so a failed lookup is a precondition, not a detail to log and carry on from.
- `addManager` treats an existing open `admin` role as success (re-adding someone `revokeManager` only removed the auth account for hits `assigned_role_active_unique` with `23505`, not a real failure), and deletes the just-created auth user if the role cannot be assigned or linked — a manager is never left as a bare account.

## Per-gym settings

- `gym.timezone`, `tracking_started_on`, `session_length_hours`, `lessons_per_week`; read once per request by `getGymSettings()` (`utils/supabase/gym.ts`).
- `utils/hours.ts` and `utils/promotion.ts` take them as a required parameter (`HoursSettings`); the old constants survive only as defaults for a new gym in `utils/gym-defaults.ts`.
- "Today" at a gym is `todayIn(gym.timezone)`, not the UTC date.
- A new gym gets a copy of `promotion_criteria_template` (snapshot taken at migration time) via trigger `gym_seed_criteria`.
- **Location** `gym.latitude`/`longitude` (both or neither, `gym_location_valid`). The superadmin sets it in the gym form; the manager, who has no update on `gym`, on **`/gym`** ("La mia palestra", `requireUserManager`, linked from `/account`) through `set_gym_location()` (`security definer`, own gym only, 42501 otherwise). Route prefixes match by segment (`underPath()`, `utils/paths.ts`) so `/gym` and `/gyms` never match each other. `/gym` also renders the printable check-in QR (`qrcode`, SVG on the server, `SITE_URL/check-in`). `/gym` also holds the gym's registration link (see auth-and-access.md "Invite registration").

## Deleting a gym

Only when suspended, with the exact name typed (`deletionConfirmed()`). The `gym` row is deleted first, with `status = suspended` re-checked in the delete itself — the cascade erases everything — then its auth accounts with the service role; failures are reported as a count; a `platform_admin` account is never deleted from here. `guard_course_delete` lets the cascade through (the parent `gym` is already gone) and still refuses a direct delete of a course with attendance. Accounts of never-approved registration requests are read before the delete too (they have no person row) and deleted with the rest.
