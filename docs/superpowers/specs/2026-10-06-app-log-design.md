# App log — design

Date: 2026-10-06. Branch: `feat/app-log`.

## Goal

A log the platform superadmin (`admin@bjj.com`) can read in the app, holding
server errors and key events, that empties itself: rows older than **7 days**
are deleted and at most **2000 rows** are kept. Today errors go to
`console.error` only (`logDbError()`, ~89 callers) and are invisible outside
the Vercel logs.

## Decisions

- Access by **`is_platform_admin()`** / `requirePlatformAdmin()`, not by a
  hardcoded email: `admin@bjj.com` is the platform superadmin, and the check
  survives an email change.
- **No personal data** in a row: only internal ids (actor, subject, gym). The
  superadmin never sees a member's data (`docs/claude/gyms.md`); ids are the
  minimum that makes an event useful.
- Postgres `details` is **never stored** (a unique violation puts the row's
  values, e.g. an email, there). `code` and `message` carry no row data.
- Retention runs **inside the write** (statement trigger), no pg_cron, no
  Vercel Cron: no extension to enable, and the 2000 cap is never exceeded.

## Database — `supabase/migrations/20261006000000_app_log.sql`

Table `public.app_log`, platform-level (not a domain table):

| column       | type                                        | notes                                  |
| ------------ | ------------------------------------------- | -------------------------------------- |
| `id`         | `bigint generated always as identity` PK    | insertion order                        |
| `created_at` | `timestamptz not null default now()`        |                                        |
| `level`      | `text not null check (level in ('error','event'))` |                                 |
| `scope`      | `text not null`                             | e.g. `members`, `login`, `gyms`        |
| `action`     | `text not null`                             | e.g. `revokeAccess`, `signInWithPassword` |
| `code`       | `text`                                      | errors only                            |
| `message`    | `text`                                      | errors only                            |
| `gym_id`     | `uuid`, no FK                               | outlives a deleted gym                 |
| `actor_id`   | `uuid`                                      | account that acted                     |
| `subject_id` | `uuid`                                      | person / account / gym acted on        |

- **Retention:** `after insert … for each statement` trigger running a
  `security definer` function that deletes rows with
  `created_at < now() - interval '7 days'` and rows beyond the 2000 most recent
  by `id`. No extra index: at most ~2000 rows.
- **Access:** RLS on; one `select` policy `to authenticated using
  (public.is_platform_admin())`; no insert/update/delete policy (only the
  service role writes). `revoke all` from `anon`, `authenticated`; `grant
  select` to `authenticated`.
- **Declared exception** to "every domain row belongs to a gym": no
  `gym_scope` trigger and no "gym isolation" policy — no gym ever reads it.
  Noted in `docs/claude/database.md` and `docs/claude/gyms.md`.
- Replay-safe per `database.md` (`if not exists`, `drop … if exists` before
  every `create policy` / `create trigger`, `or replace` on the function).
- Apply order: **before** deploying the app (the app inserts into the table;
  without it every write fails — harmless, it falls back to the console — and
  `/logs` shows the load-failed message).

## App writes — `frontend/utils/log.ts`

- `logDbError(scope, where, error)` — signature unchanged, so every caller is
  covered. `console.error` unchanged (the deployment's logs, operator-only,
  keep `details`); also writes a `level='error'` row with `code` and
  `message` only.
- `logEvent(session, scope, action, subjectId?)` — new; writes
  `level='event'` with `actor_id = session.userId`,
  `gym_id = session.gymId`.
- `AdminSession` gains `gymId: string | null`, read from the JWT claims
  (`app_metadata.gym_id`) already in hand — no extra query.
- Writes go through `createAdminClient()` inside `after()` (`next/server`), so
  they run after the response and never delay or break the action. No secret
  key, or no request scope → console only. Any failure of the write →
  plain `console.error`, never `logDbError` (no recursion), never a throw.

### Events (one call per successful action)

- **Account:** `addPerson`, `restoreAccess`, `setTemporaryPassword`,
  `revokeAccess`, `deletePerson`, `changeRole` (`app/members/actions.ts`);
  `approveRegistration`, `rejectRegistration`
  (`app/members/requests/actions.ts`).
- **Promotions:** `recordPromotion`, `correctRankDates`, `correctJoinedDate`.
- **Gyms:** `createGym`, `updateGym`, `setGymStatus`, `deleteGym`,
  `addManager`, `resetManagerPassword`, `revokeManager` (`app/gyms/actions.ts`).

### Login

- Success: not logged.
- Wrong credentials (`invalid_credentials`, including an unknown username,
  which signs in against a random address): `console.error` only, as today.
- Any other cause (`captcha_failed`, rate limit, GoTrue failure): a
  `level='error'` row through `logDbError`, no actor, no identifier.

Known risk: a burst of non-credential login failures could push useful rows
past the 2000 cap. Turnstile already limits attempts; pruning events and
errors separately is the upgrade if it ever happens.

## Page — `/logs`

- `requirePlatformAdmin("/logs")` (404 for anyone else); `/logs` added to
  `PROTECTED_PREFIXES` (`utils/supabase/proxy.ts`) and `PLATFORM_PATHS`
  (`require-admin.ts`); nav link "Log" for the superadmin only.
- One table, newest first, `created_at >= now - 7 days`: date and time (UTC,
  `formatDate()` + time), level, scope / action, code + message, gym name
  (resolved from `gym`), actor and subject as shortened ids.
- Load failure → the generic load-failed message, never an empty table.
- Labels in en / it / pt-BR; actions stay technical codes.
- Skipped: filters and pagination — add if 2000 rows become hard to read.

## Verification

- `bash supabase/tests/replay.sh --isolation`, with new checks in
  `supabase/tests/tenant-isolation.sql`: a gym user reads no `app_log` row;
  2010 inserts leave 2000 rows; a row dated 8 days ago is deleted by the next
  insert.
- `npm run lint`, `npm test`.
- Browser: the superadmin sees rows on `/logs`; a gym manager gets 404.
