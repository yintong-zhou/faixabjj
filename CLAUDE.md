# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Project status

The repo follows the 3-tier agent architecture in [`AGENT.md`](AGENT.md) (directives / orchestration / execution). `frontend/` is a `create-next-app` scaffold (Next.js App Router + Tailwind) with a branded mobile-first shell and IA, an admin login gate, and real data on `/members` (overview, filters, pagination), `/courses` (recurring definitions), `/attendance` (calendar, roll call, check-in) and `/dashboard` (two views behind one route).

`backend/` (FastAPI) from the `AGENT.md` template deliberately does **not** exist: Supabase (Postgres + Auth + RLS) is the backend. Add it only when logic appears that can live neither in Supabase (RLS policies, Postgres functions/triggers) nor client-side.

- **Stack discrepancy:** root `README.md` says "React + Vite + Tailwind"; `AGENT.md` (which this structure follows, per explicit instruction) says Next.js, and the scaffold is Next.js. `AGENT.md` + this file are authoritative; the README table is stale and should be fixed when convenient.
- The README references `bjj-progress-tracker-project.md`, never committed. Use `README.md` as the product spec.

## Repository structure

```
faixabjj/
├── frontend/        # Next.js (App Router) + Tailwind — npm workspace, run commands from here
├── supabase/
│   └── migrations/  # SQL migrations (schema, RLS) — see "Database"
├── directives/      # SOPs in Markdown (Level 1, AGENT.md). Empty until real workflows exist.
├── execution/       # Deterministic Python scripts (Level 3). Empty until needed.
├── .tmp/            # Scratch only — gitignored, never committed, safe to delete
├── AGENT.md         # Agent operating instructions (3-tier architecture, web app conventions)
└── README.md        # Product spec / overview
```

## Database

Plain SQL migrations in `supabase/migrations/` (standard Supabase CLI layout).

- `20260910000000_init_schema.sql` — five tables (`person`, `assigned_role`, `role_threshold`, `attendance`, `promotion_criteria`), enums (`belt_rank`, `person_role`), the `person_hours` view, RLS enabled everywhere with zero policies (default-deny).
- `20260910120000_admin_rls_policies.sql` — original flat policies (every `authenticated` user = full CRUD). **Superseded**; kept as history, not as a description of current behaviour.
- `20260911000000_account_management.sql` — profile provisioning (`on auth.users insert` trigger + backfill), first `can_manage_users()`, anti-self-promotion guards.
- `20260911120000_role_based_access.sql` — **the current permission model** (adds the `admin` role, per-role policies). Read this first when reasoning about access.

**⚠️ Migrations are applied by hand from the dashboard; the MCP here cannot do it.** Never run schema/RLS changes against whatever project the connected MCP shows — verify the project ref is `poksgledkecwviypspmi` first. Until that is sorted, paste migrations into the correct project's SQL Editor, or connect the right MCP/CLI and re-check `list_migrations`.

### Connecting the frontend to Supabase

The frontend talks to Supabase directly (`@supabase/supabase-js` + `@supabase/ssr`), not through a custom API layer — that is what makes the RLS model work, since the user's JWT must reach Postgres.

- `frontend/utils/supabase/client.ts` — browser client (Client Components).
- `frontend/utils/supabase/server.ts` — server client, `createClient(await cookies())` (Server Components/Actions/Route Handlers).
- `frontend/utils/supabase/proxy.ts` + `frontend/proxy.ts` — refreshes the auth cookie on every request and gates protected routes. Next.js renamed `middleware.ts` to `proxy.ts`; don't recreate the old filename.
- `frontend/.env.example` is the template; `.env.local` (gitignored) already holds real values. This project uses the newer **publishable** key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), not the legacy `anon` key — don't rename it back.

## Authentication

No self-serve signup, and **no signup page on purpose** (confirmed with the user). Accounts are created in the Supabase Dashboard for `poksgledkecwviypspmi` or through `/members`; a public signup form would hand out access. Don't add one without asking.

- `app/login/page.tsx` + `actions.ts` — email/password `"use server"` action (`signInWithPassword`). On failure it redirects to `/login?error=...` with a deliberately generic message; never surface the raw Supabase error, it enables email enumeration.
- **Password recovery:** `/forgot-password` calls `resetPasswordForEmail(email, { redirectTo: "<origin>/reset-password" })` and always redirects to the same `?sent=1` (same anti-enumeration reasoning). `/reset-password` must be a **Client Component**: the recovery link carries tokens in the URL **hash fragment**, which never reaches the server, so only the browser client sees it. It auto-detects the fragment and fires `onAuthStateChange` `"PASSWORD_RECOVERY"`; the page listens for that plus a `getSession()` fallback (in case the event fired first), and shows "invalid link" after a 2s timeout if neither fires.
- `app/auth/signout/route.ts` — POST, signs out, redirects to `/login`. The "Esci"/"Accedi" control in `components/nav-shell.tsx` posts here; `isLoggedIn` is computed server-side in `app/layout.tsx` (`getClaims()`) and passed as a prop, never read client-side.
- `utils/supabase/proxy.ts` redirects logged-out visitors from `/members`, `/attendance`, `/dashboard`, `/account` to `/login?next=<path>`, and logged-in visitors away from `/login` to `/dashboard`. **`PROTECTED_PREFIXES` there is the single source of truth** for gated routes — update it, not individual pages.
- Every protected page **also** calls `requireAdmin()` from `utils/supabase/require-admin.ts` (defense in depth per Supabase's SSR auth guide: proxy cookie checks are spoofable).
- Use `supabase.auth.getClaims()`, not `getUser()` — current guidance, verifies the JWT locally via WebCrypto/JWKS.
- The home page `/` is for **signed-out visitors only**: publicly reachable, but `VISITOR_ONLY` in the proxy redirects an authenticated visitor to `/dashboard`, like `/login`. The nav drops Home for every signed-in user and the header logo points at `/dashboard`, so the redirect is a safety net, not the normal path.

## Account management

Two areas, both under `/account`, both in `PROTECTED_PREFIXES`.

- **`/account`** — the signed-in user's own profile. There is deliberately **no "delete my account"** (cut from scope); removal happens only from `/members`. Editable: `full_name`, `email`, `phone`, `birth_date`, `notes`, password. `current_belt`, `current_stripes`, `rank_since` are **read-only on purpose** — promotion is an instructor decision, never self-service. Email changes go through `auth.updateUser({ email })` and apply only after confirmation.
- **`/members`** — where accounts are managed, alongside the member overview. There is deliberately no separate user-management page: one list of people, not two.

The profile is the `person` row linked by `person.auth_user_id`, not a separate table. `20260911000000` adds the `on auth.users insert` trigger (+ backfill); `getOrCreateProfile()` in `utils/supabase/profile.ts` creates it on demand as a fallback.

**Permission model.** Not flat — the early "every authenticated user is trusted staff" design is gone. Roles come from an _active_ `assigned_role` (`end_date is null`):

| Role         | Registro    | Corsi / Presenze                 | Write registry | Manage accounts |
| ------------ | ----------- | -------------------------------- | -------------- | --------------- |
| `student`    | not visible | Presenze only, check-in for self | no             | no              |
| `assistant`  | not visible | Presenze only, check-in for self | no             | no              |
| `instructor` | read-only   | full                             | no             | no              |
| `head_coach` | full        | full                             | yes            | yes             |
| `admin`      | full        | full                             | yes            | yes             |

`assistant` sitting with `student` rather than with technical staff was an explicit decision. `admin` is for whoever runs the portal without teaching.

SQL predicates: `can_view_registry()`, `can_edit_registry()`, `can_manage_users()`, `can_manage_classes()`; `current_access()` returns all four as JSON in one RPC. The frontend calls them (`getAccess()`, `requireRegistryViewer()`, `requireUserManager()`, `requireClassManager()` in `utils/supabase/require-admin.ts`) instead of re-implementing the rules — keep one definition per privilege. `getAccess()` **fails closed**: an RPC error yields no access. Consequence: before `20260911120000` is applied the RPC does not exist, so everyone is treated as an allievo.

A user with no active role is an allievo. Enforcement is layered: nav hides links, the page calls the `require*` guard (answering **404**, not 403 — a student should not learn the staff sections exist), and RLS enforces it again. **Hiding a nav link is never the access control.**

Three things that look simplifiable but are not:

- Writes to `assigned_role` are manager-only; otherwise anyone could insert an active `head_coach` row for themselves and every restriction above becomes decorative.
- `guard_person_auth_link` (trigger on `person`) freezes `auth_user_id` against non-managers and `current_belt` / `current_stripes` / `rank_since` against non-editors. RLS alone cannot close these: a member legitimately holds UPDATE on their own row, so repointing the head coach's profile at their account would inherit privileges, and self-editing a belt would make promotion self-service. The trigger skips when `auth.uid()` is null (service role, and the FK's own `ON DELETE SET NULL` cascade — without that escape, deleting a user would fail).
- The `admin` enum value is never a literal in migration SQL (`role::text = any(...)` instead): Postgres forbids using a freshly added enum value in the transaction that adds it, so a literal breaks a from-scratch replay.

**Bootstrap.** After the migrations nobody has a role, so nobody can reach user management. The first `head_coach` must be inserted by hand; the statement sits commented out at the bottom of both migrations on purpose — a migration that silently grants privileges is a privilege grant hiding in a schema change.

**Service-role key.** `utils/supabase/admin.ts` reads `SUPABASE_SECRET_KEY` (no `NEXT_PUBLIC_`) and is `server-only`, so importing it from a Client Component is a build error. It **bypasses RLS**, so every server action in `app/members/actions.ts` re-checks `requireUserManager()` itself. Without the key the page renders but destructive controls are disabled.

Revoking access deletes the `auth` user only. `person.auth_user_id` is `ON DELETE SET NULL`, so the registry row and attendance history survive as an account-less person — revoking must not erase the gym's records.

## Forced password change

Every account `addPerson` creates starts on the same published default password, so the app opens nothing else until it is replaced.

- The obligation lives in **`app_metadata.must_change_password`**, not `user_metadata`: the latter is writable by the user it describes (they could clear their own obligation), the former only by the service role, and it still rides in the verified JWT where the proxy and `requireSession()` read it with no extra query.
- Enforced twice: `utils/supabase/proxy.ts` redirects every path to `/change-password`, and `requireAdmin()` does the same per page. `/auth/*` is exempt, or signing out would be unreachable.
- `requireSession()` vs `requireAdmin()`: identical except that `requireAdmin` enforces the pending change. `/change-password` is the one page that must use `requireSession` or it redirects to itself forever; every other protected page uses `requireAdmin`.
- The action **refuses the default password** as the new one (without that the flow is theatre), clears the flag with the admin client, then calls `refreshSession()` — not optional: the old JWT still carries `must_change_password: true` and the proxy would bounce the user back.

## Members

`/members` lists every person with active roles, belt, hours and join date, and is also where accounts are managed (invite, password reset, revoke) — splitting the two would mean two lists of the same people.

Visible to instructors, maestri and admin. An **instructor sees it read-only**: no action controls render (`access.canEditRegistry`) and RLS refuses the writes anyway.

- **Data source:** the `member_overview` view (`20260911140000`), one row per person with `active_roles` (text array), `is_active`, `total_hours` pre-joined. Without it, filtering by role could not be paginated or counted correctly, since roles live in another table.
- **Filters and paging live in the URL** (`q`, `ruolo`, `cintura`, `attivi`, `idonei`, `p`), submitted by a plain `method="get"` form — shareable, reload-proof, no client JS. Row actions carry the query back in a `_query` hidden field so acting on a row does not reset the list.
- **A portal-only admin is excluded from the list.** `admin` means "runs the portal without teaching", so such an account appears nowhere the app asks "which of our people is this" — not the Registro list, roll calls, or instructor dropdowns. It stays selectable only in "Aggiungi persona". **`frontend/utils/members.ts` is the single home for this rule** (`PORTAL_ONLY_ROLE`, `PORTAL_ONLY_ROLES`, `TECHNICAL_ROLES`) — import, don't redeclare. The filter is array _equality_ (`not active_roles eq {admin}`), not "contains admin": someone who is both maestro and admin still trains here. `active_roles` is coalesced to an empty array and sorted in the view so `{admin}` matches exactly the admin-only case. The role filter drops its "Admin" option for the same reason. This is a query-level visibility rule, not RLS: the row exists and a manager can still act on it.
- **Search matches the name only**, never the email — explicit decision. Input is stripped of `%`, `,`, `(`, `)` and backslashes before `ilike`, since those break PostgREST filter syntax.
- **Adding a person also creates their account.** (This requirement was reversed once mid-development; trust this, not older comments.) `addPerson` creates the auth user with the shared default password from `utils/default-password.ts`, `email_confirm: true` (**no email sent**, account works immediately) and `app_metadata.must_change_password`, then fills the `person` row the trigger just created and assigns the role. Required (validated in the server action, not only via the form's `required`, which a crafted POST skips): name, email, role, join date, belt. Optional: phone, birth date, stripes, rank date, notes. **Order matters:** the auth user is created _first_, because that is the step that fails on a duplicate email; otherwise a duplicate strands a person row with no account. It runs on the _user's_ client, not the service-role one, so RLS enforces it and no secret key is needed.
- **"Reimposta password"** (`setTemporaryPassword`) does not email a link and shows no password on screen: one confirmed kebab button restoring the shared default from `utils/default-password.ts` — already printed in the "Aggiungi persona" panel, so nothing must be read off the screen. It **re-arms `must_change_password`**; without that the account sits on a password everybody knows.
- **"Invita al portale"** (`inviteToPortal`) covers a member with no account (in practice, revoked access). It emails them and lets them choose their own password — no default password, no forced change. It is the only action in the app that sends mail.
- **`rank_since` vs `stripe_since`.** `rank_since` = belt promotion date (label "Cambio cintura da"); `stripe_since` (added in `20260911220000`) = last stripe awarded (label "Ultima tacca"). They move at different rates, and "how long at this belt" is what promotion eligibility hangs on, so it must not be inferred from the stripe date. `20260911200000` did it the other way round (a `belt_since` column) and `20260911220000` corrects it as a follow-up because the first had already been applied. Rows were backfilled from `rank_since`; outliers need fixing by hand. Both dates are frozen by `guard_person_auth_link` — backdating either is how you fake eligibility.
- **Each row shows two day counters** under the name: days since `joined_at` and days since `rank_since` (the figure eligibility hangs on). `daysSince()` in `utils/dates.ts` normalises **both ends to UTC midnight** — comparing a UTC-parsed `date` against a local-time `now` drifts by a day depending on timezone and hour. A future date clamps to 0.
- **The list row shows no email**, removed to keep rows scannable. Everything recorded about a person lives on `/members/[id]`, reached from the kebab's **Dettagli**. That page reads `person` (+ `person_hours`) rather than `member_overview`: one record needs no pre-joined roles array, and the table carries `notes`, which the list omits. It also lists the **full role history**, closed assignments included. The kebab carries the list's filters in a `from` param so the back link returns to the exact list.
- **Dettagli is available to instructors too**, so the kebab renders for every viewer; only the account actions inside it are gated on `canEditRegistry`.
- **Every row action sits behind a kebab menu** (`components/row-menu.tsx`), pinned right, so a destructive control is never one stray tap away while scrolling. The menu is a Client Component; the action forms are server-rendered and passed in as `children`, which keeps the server actions working. It closes on Escape and outside pointer press, and needs no close-on-submit since every action navigates and remounts the row. Rows with no available action render no kebab.
- A member with `auth_user_id = null` shows as **"senza account"** (never invited, or revoked). Revocation keeps the registry row and attendance history on purpose.
- `20260911160000_link_invited_person.sql` makes the `auth.users` trigger **link** a new account to an existing account-less row with the same email (case-insensitive) instead of inserting a duplicate. The fix lives in the trigger, not the server action, so every path that creates an auth user is covered.

**Views bypass RLS unless you say otherwise.** A Postgres view runs with its owner's privileges, so `security_invoker = on` is mandatory on **every** view here — without it an allievo reads the whole gym through the view. `person_hours` was created without it in `20260910000000` and the Registro migration fixes it. Check this on any new view.

## Attendance and courses

`/courses` describes the recurring classes; `/attendance` is the calendar they generate, the roll call, and where a member checks in.

**Three tables** (`20260912000000_class_schedule.sql`):

- `course` — the recurring _rule_: `weekdays` (ISO `smallint[]`, 1 = Monday), one `start_time`/`end_time` pair, optional `starts_on`/`ends_on`, and two check-in margins. A course running at different times on different days is modelled as **two courses** — that trade buys one table instead of a `course_slot` join table. It also carries `instructor_id`, the **default** instructor: `sync_course_sessions()` copies it onto sessions it creates and **fills it in on future sessions that have none** (`20260913000000_session_instructor_backfill.sql`). A non-null per-lesson instructor is a deliberate substitution and is never overwritten. Before that migration the instructor was only set at insert time, so an already-generated calendar showed "nessun istruttore" forever — the usual case, since the calendar is generated the moment a course is created. Consequence of the fix: null means "not set", not "explicitly nobody", so clearing one lesson's instructor is re-filled next time the course is saved. (Commit `2da3e44` dropped this field and moved the instructor to the lesson only; that was reversed — the default belongs on the course. **Do not remove it again.**) The dropdown offers `instructor` and `head_coach` only, **not** `admin`. A course pointing at someone who has since lost their technical role keeps them as a selectable option, or the browser falls back to the first entry and silently reassigns the course on save.
- `class_session` — the lesson that actually happens. Times are **copied** from the course at generation, not joined, so editing a course never rewrites lessons that already took place.
- `attendance` — rewired onto `session_id`. `class_date`, `led_by`, `duration_hours` and `unique (person_id, class_date)` are gone; the key is `unique (person_id, session_id)`.

**Hours are an opening balance plus what was recorded.** The estimate exists only to give each member a starting figure on go-live day and is **frozen** from that date (a unit test asserts this). Every hour after go-live arrives only through a member's check-in or an instructor's roll call, which the `attendance` RLS policies enforce (accepting an insert from a class manager, or from the member with `checked_in_by = 'self'` inside the window). **This module must never become a second way of adding an hour.**

**Hours before the app existed are estimated, not counted.** `person_hours` only knows FAIXABJJ attendance, so a three-year member would read as zero. `frontend/utils/hours.ts` is the single definition: hours before `TRACKING_STARTED_ON` are assumed at `LESSONS_PER_WEEK` (3) a week since `joined_at`, hours from that date on are counted, total is the sum.

- **`TRACKING_STARTED_ON` must be set to the real go-live date** — the whole point of the design. Without a cutoff, estimating while also counting real attendance double-counts every week from now on. A future date inflates every total; the code clamps the estimate at today, but that is a guard, not a substitute.
- The average is **one constant for everybody**, explicitly: it is a declared estimate, and a per-person figure would dress an assumption up as a measurement.
- **Anywhere an estimated total is shown it must say so.** The Registro row appends "(stima)" with the explanation in `title`; the member detail page splits _Ore totali / Ore registrate / Ore stimate_ with the method spelled out (that record decides promotions); `/account` shows the member their own total with the same caveat.
- Partial weeks count pro rata, or someone who joined yesterday gets a free lesson.

**One attendance is one hour**, and `duration_hours` was _removed_ rather than defaulted to 1: with a default, a crafted write stores 2 and the rule becomes a convention. Cost: a four-hour seminar cannot be one row. `person_hours` is therefore `count(*) filter (where present)`, not a sum — and because `member_overview` reads it, that view must be dropped and recreated in the same migration or the `drop view` is refused.

**Permissions** (`20260912010000_class_schedule_access.sql`): `can_manage_classes()` = instructor + head_coach + admin, exposed as `canManageClasses`, guarded by `requireClassManager()`. It is deliberately **not** `can_edit_registry()`: an instructor runs classes but must never change a belt. Two privileges, two predicates — do not collapse them.

**`/attendance` is open to every signed-in member**, unlike `/members`: check-in must live where the lessons are listed, and there is only one such list. The page calls `requireAdmin()` and branches on `canManageClasses` — staff get the roll call link and presence count, a member gets a check-in button for themselves.

**Two views, one page.** `/attendance` renders the weekly list (default) or a month grid, switched by a segmented control. Both are server-rendered, with all view state in the URL — `v=griglia` selects the grid, `da` is the anchor date, `g` is the day opened under the grid.

- **`da` is one anchor read two ways**: the week it falls in, or the month. That is what makes toggling keep your place, and why there is no second "month" parameter.
- **The grid queries `monthGridRange()`, not the month**: the range covers whole Monday–Sunday weeks so spill-in days are drawn rather than left empty. The month helpers (`monthStart`, `shiftMonth`, `monthGridRange`, `formatMonthHeading`) live in `utils/schedule.ts` with the rest of the calendar arithmetic and are unit-tested, including the 31-January trap.
- **The check-in button is deliberately absent from the grid** (explicit decision): a cell has no room. The grid shows where you stand (a tick, "presente"); the action stays in the list view. Staff keep the roll-call link in both, since that is navigation.
- **Where a cell leads depends on what is behind it.** For staff, a day with one lesson links straight to its roll call. A day with several — and any day for a member — opens the panel, which carries a `#giorno` anchor because on a phone it sits below the fold. The whole cell is the link, not the entries inside it: entries are a few pixels tall, and an anchor inside an anchor is invalid HTML.

Seven columns cannot shrink below ~34rem and stay legible, so the grid scrolls inside its own container; the page itself must never scroll sideways.

**The roll call is ordered present-first, then by belt** white→black, fewer stripes first, then by name — the order a class lines up in. `beltRank()` in `utils/supabase/profile.ts` is the single definition of that order (the dashboard's belt chart uses it too); an unrecognised belt sorts last, because it is a data problem. The order is computed on load so tapping a state never makes a row jump under the finger; it settles after "Salva appello".

**The lesson's instructor starts ticked present** — whoever is teaching is on the mat. It is a _default_, not a forced value: the state can be changed, and nothing is written until submit, so "an hour is only ever recorded by a check-in or an instructor's confirmation" still holds. The instructor here is `class_session.instructor_id`, not the course default, and the row carries an "istruttore" tag so the pre-selection does not look arbitrary.

**Student check-in** is an RLS `insert` policy requiring four things together: the row is theirs, `present` is true, `checked_in_by = 'self'`, and `session_checkin_open(session_id)`. Undo is allowed only on their own `'self'` row and only while the window is open. `checked_in_by` is what makes a staff-created row un-undoable by the member.

**The roll call is a snapshot, and must not delete what it never saw.** The form carries a hidden `loaded_at`; on save, a member left "non registrato" whose `self` row was created _after_ that instant is kept rather than deleted, and the confirmation says how many. Without it the ordinary case destroys data: roll call opened at 19:00, check-ins at 19:05, save at 19:20 wipes them silently.

**A confirmed check-in keeps its provenance.** `saveRollCall` writes only rows whose state changed, so a `self` row left present stays `self`. Rewriting it to `staff` would erase who claimed that hour and remove the member's undo.

**Suspending a course stops it** (`20260918010000_suspended_course_checkin.sql`). `is_active` used to describe only the course row, so already-generated lessons kept appearing and accepting check-in. `session_checkin_open()` now requires `c.is_active`, and `session_overview` carries `course_active` so the calendar drops a suspended course **from today on** while keeping past lessons. Consequences: the flag is authoritative rather than destructive (reactivating brings the calendar back, a suspension never loses a schedule); past lessons are untouched because they happened; and `/attendance/[id]` stays reachable for them, with a notice, since correcting a lesson already taught is exactly what an instructor needs. The view exposes the flag instead of filtering on it, or those past lessons would be unreachable.

**An error is not a closed window.** `checkIn` maps only `23505` to "already present" and `42501` to "check-in closed"; anything else gets a generic message and the real reason goes to the server log via `logDbError()`. The old code reported every failure as "closed", sending people to check the clock — with a migration missing, *every* check-in read as closed. `undoCheckIn` splits the same two cases: a refusal deletes zero rows and raises nothing; an error is a different event. The database's own text never reaches the screen — codes and constraint names describe the schema.

**The check-in window is deliberately narrow**: 15 minutes before the start, 0 after the end (`20260918000000_checkin_window_defaults.sql`; the form defaults match). The original 60/30 left consecutive lessons open simultaneously, and one attendance is one hour — a member could collect three by tapping three buttons. A member who forgot asks the instructor: the roll call is the authoritative record, check-in is a convenience on top.

**Two things that look like duplication but are not:**

- **Weekday expansion** lives in TypeScript (`utils/schedule.ts`, covered by `schedule.test.ts`); Postgres only receives the resulting dates through `sync_course_sessions(course_id, dates[])`. SQL does the part only SQL can do atomically: drop the future sessions the new schedule supersedes **but only where no attendance exists**, then insert the rest. Past sessions are never touched.
- **Timezone maths** lives only in SQL. `session_date + start_time` is wall-clock and `now()` is `timestamptz`; comparing them directly opens check-in an hour early under DST. `gym_timezone()` (`Europe/Rome`) is applied once, and `session_overview` exposes `checkin_opens_at`/`checkin_closes_at` as instants, so `checkinState()` in TypeScript only compares two timestamps.

**A course with attendance can only be suspended, never deleted.** The rule is a `before delete` trigger (`guard_course_delete`), not a check in the server action, because the service-role key bypasses RLS — and because `class_session` cascades from `course` and `attendance` from `class_session`, a plain delete would take the gym's hours with it. Same reasoning as "revoca accesso".

**Cancelling a lesson** sets `status = 'cancelled'`: check-in closes, the row shows struck through, recorded attendance survives.

Both `session_overview` and `course_overview` carry `security_invoker = on`. Consequence on `session_overview.present_count`: it respects the caller's own attendance policy, so a student would see only their own row counted — the UI shows that count to staff only.

## Promotions

**There is no `/promotions` route. The queue lives inside the Registro**, deliberately folded in: the eligibility queue was a list of people, the Registro is a list of people, and this project's rule is one list of people, not two — the same reason account management is a row menu here rather than a user-management page. A separate queue put the same person on two screens and drifted from the list it summarised.

What `/members` carries instead: a **summary line above the list** — the count of everyone who has reached the minimums, linking to itself with `idonei=1` — a **`idonei` filter** on the list that already exists, the green dot on each eligible row, and the **criteria editor as a collapsible panel**, in the same `<details>` style as "Aggiungi persona" and rendered only for `access.canEditRegistry`. The page's own `requireRegistryViewer()` guard covers all of it; `updateCriterion` lives in `app/members/actions.ts`, keeps its `requireRegistryEditor()` guard and reuses that file's `back()` helper so saving a criterion returns to the list you were filtering. Both guards answer **404, never 403**.

**Eligibility is computed over every active member, not over the page being shown** — one query on `member_overview` (active, `PORTAL_ONLY_ROLES` excluded, only the columns `promotionStatus()` reads), one on `person_rank_hours`, one on `promotion_criteria`. The old per-page computation could not paginate a filter and could not produce a total, and its `is_active` handling differed from the queue's. Now the dot, the count and the filter are one fact seen three ways and cannot disagree. The cost is one small query — a gym is a few hundred rows with narrow columns. The filter is applied as `.in("id", eligibleIds)` **before** the count and the range, or the total and the paging would describe a different set than the rows; with nobody eligible no query is issued at all, since an empty `in` list is not a query worth sending.

**A `promotion_criteria` row means "what is required to REACH this grade"**: `(blue, 0)` is what it takes to be given the blue belt, `(blue, 3)` is what it takes to earn blue's third stripe. **Two time anchors share one column** (`20260918100000`): `stripe = 0` measures `min_time_at_rank_days` from `person.rank_since` (the belt date); `stripe > 0` measures it from `stripe_since` (the last stripe date). Get this backwards and every stripe reads as overdue or not-yet — the migration comment spells it out for exactly that reason.

**There is no `(black, 1..4)` row.** The black belt has degrees, not stripes — out of scope. No row means no modelled next step, which is exactly the right read for someone already black: `nextStep()` in `frontend/utils/promotion.ts` returns `null`, and the queue and the panel both have nothing further to compute for them.

**`min_hours` is clock hours, like the source document; the app counts attendance.** `SESSION_LENGTH_HOURS = 1.5` in `frontend/utils/hours.ts` is the single place the two units meet — never "fix" the seeded numbers into attendance counts, and never add a second conversion elsewhere. Consequence: the same person can show two different hour figures on two screens, say 142 on the Registro row (attendance) and 213 on a promotion screen (clock hours) — that is correct, not a bug. Every promotion screen is labelled "1 lezione = 1,5 h" so the gap reads as a unit conversion, not an error.

**Hours are counted from the current grade, not from when the person joined** (`person_rank_hours`, `lessons_since_rank` / `lessons_since_stripe`). A lifetime total gets two ordinary cases wrong: someone arriving already graded from another academy would start at zero, and someone who stopped training a year ago would sit just as close to the threshold as the day they stopped, because a total never falls.

**The estimated opening balance is anchored at the later of `joined_at` and the grade date** — `estimatedHours(max(joined_at, anchor))`. The estimate is not attendance, and it must not be credited to a grade the person held before they even joined.

**Eligibility lives in `frontend/utils/promotion.ts`** (`promotionStatus()`), pure and unit-tested like `schedule.ts` and `hours.ts`, and it is never re-implemented in a page or in a query. The database does not know eligibility — only attendance and dates do — which is why `idonei` filters by a set of ids computed in TypeScript rather than by a SQL predicate. Do not answer a future scaling worry by duplicating the rule in SQL; the clean path is moving the hour *estimate* into the database and still deciding in one place.

**`promotion_criteria` is readable by registry viewers only** (`can_view_registry()`, `20260918100000`, replacing the old flat "every authenticated user" policy) — a database policy, not a UI decision. Filled in, the table says exactly how far a student is from their next grade; hiding the page would still leave two API calls between a student and that number, so the rule has to live where the data lives.

**The matching product rule: nothing a member can open states a remaining amount, a next-grade name, or a verdict.** This is not a preference — it is the reason for the restricted policy above. The member dashboard adds only "ore al grado attuale" next to the belt and stripe dates it already showed: a fact about the present, never a bar, a "N hours to go", or the name of what comes next.

**`record_promotion()` is `security invoker`, never `definer`** (`20260918130000`). A definer function would run with the owner's privileges and bypass both RLS and `guard_person_auth_link`, the trigger that freezes `current_belt`/`current_stripes`/`rank_since`/`stripe_since` against non-editors — the whole reason promotion is not self-service. The function re-checks `can_edit_registry()` itself, so the refusal is a clear error rather than a policy violation halfway through the write.

The same function rejects a future-dated promotion, a sideways or backward one, and stripes outside `0..4` — but accepts a backdated one freely, because the belt was really given on the mat before somebody got round to recording it. A belt change resets `current_stripes` to the target (0 in the normal case) and moves both `rank_since` and `stripe_since`; a stripe alone moves only `stripe_since`, because "how long at this belt" is what the next belt hangs on and a stripe must not reset it.

**A promotion can be deleted but never updated** — `promotion` (`20260918120000`) has no update policy. A wrong entry is removed and redone; rewriting one in place would erase the only record of what was actually decided and when, the same reasoning that keeps `promoted_by` as `on delete set null` rather than cascading, so the gym's history survives an instructor's account being revoked.

**The seeded stripe numbers are an estimate, not from `belt-criteria.md`.** The document gives only a 2-4 month interval per stripe and no hours at all; the seeded `min_hours`/`min_time_at_rank_days` are derived from that interval at three 1.5 h lessons a week, not sourced from the document itself. The criteria panel on the Registro exists partly so the gym can correct them once real numbers are known.

**The suggestion follows a ladder — next stripe under four, next belt at four stripes, nothing at black — but the promotion panel still allows any forward grade.** Requiring four stripes before a belt is common academy practice, not a rule in the source document, so it binds only `nextStep()`'s suggestion; `record_promotion()` and the panel's belt/stripe selects accept a direct jump, rejecting only a backward or sideways move.

**The panel's technical and behavioural reminders are text, never a saved checklist.** They come from the `promotions` dictionary section, one list per transition, straight from `belt-criteria.md`. Nothing about them is written anywhere: a tick box would promise a record the app does not keep, and the document is explicit that these minimums are "necessary but not sufficient" — the instructor's judgment on top of them stays undocumented on purpose, exactly as intended.

Surfaced elsewhere: the kebab gets a "Promuovi" item for registry editors; the member detail page lists the full promotion history above the panel; and the staff dashboard carries one compact card with the eligible count, linking to `/members?idonei=1`. That card and the Registro's summary line run the same computation over the same rows, so the two numbers must always agree — the card points straight at the list the count describes.

**The unit note (`t.promotions.hoursNote`, "1 lezione = 1,5 h") stays visible text**, on the summary line and in the criteria panel, never only a `title`: a tooltip never appears on the phone this app is used on, exactly as the roll call found when it replaced its tooltips with a legend. The criteria and the lesson counts are coerced with `Number(...)` where they enter the page, because PostgREST returns `numeric`/`bigint` as strings and a string silently wins a `<`.

## Dashboard

`/dashboard` is two pages behind one route, chosen by `canManageClasses` — the same predicate that opens Corsi and the roll call.

- **`app/dashboard/staff-dashboard.tsx`** — members (active, new in 30 days, without an account, total gym hours), the month's lessons (scheduled, held, cancelled, attendances, average turnout, today's lessons linking to each roll call) and the belt distribution, drawn with the `Belt` component and a plain CSS bar rather than a chart dependency.
- **`app/dashboard/member-dashboard.tsx`** — the member's own belt, hours, lessons in the last 28 days, weekly average, next lessons. Nothing about anybody else.

Three things worth knowing:

- **The split is in which queries run, not which cards render.** A student never triggers the gym-wide queries, and RLS would refuse them anyway (an allievo cannot read `member_overview` or another member's attendance). Hiding cards would not have been access control.
- **Staff counts exclude a portal-only admin** (`PORTAL_ONLY_ROLES`), who is not a student and would skew every figure.
- **The member view is bounded to 90 days**; "last time" reads "—" beyond that window rather than scanning further back.
- Gym-wide hours go through `hoursFor()` like everywhere else, so the total is not zero for a school that has trained for years.

## Languages

English, Italian and Brazilian Portuguese. **English is the default** (`DEFAULT_LOCALE` in `utils/i18n/locales.ts`) — what a visitor with no saved choice and no matching `Accept-Language` gets, and what the pure helpers fall back to. Italian is still the language dictionaries are _authored_ in: `it.ts` defines the `Dictionary` type and the other two must match its shape. Authoring language and default language are two different things — do not collapse them.

- **`utils/i18n/dictionaries/it.ts` defines the `Dictionary` type**; `en.ts` / `pt-BR.ts` are typed as it, so a missing key is a compile error rather than a blank string. The Italian object deliberately has no `as const`: that would make every value a string literal type, forcing English to contain the Italian words.
- **Pages read the dictionary by property, not via `t("a.b.c")`**: `const { t } = await getDictionary()` then `t.registro.title` — compiler-checked, autocompleted, no runtime path resolution. Interpolating or pluralising values are **functions** (`t.dashboard.ofTotal(12)`), so each language pluralises its own way.
- **The locale lives in a cookie, not the URL** (explicit decision): almost every page is behind a login where per-language URLs buy nothing, and the alternative meant moving every route under `app/[locale]/` and rewriting every link and the proxy for one public page. Trade-off: the landing page has one URL in three languages, so crawlers index whichever they are served — if that ever matters, it is the one route worth real per-language URLs.
- `getLocale()` prefers the saved choice, then the closest `Accept-Language` match, then Italian. The header is consulted **only** when no cookie exists: once somebody has chosen, the choice wins even if their browser disagrees.
- **Client Components receive their words as props** (they cannot read the cookie): `NavShell`, `ThemeToggle`, `PasswordInput`, the reset-password form. `/reset-password` was split into a Server page and `reset-form.tsx` for exactly this — the form must stay on the client because the recovery link carries tokens in the URL fragment.
- **`Belt` is an async Server Component** and reads the dictionary itself rather than taking the belt name as a prop at a dozen call sites.
- **Pure utils take the dictionary as a parameter with an English default** (`formatDays`, `formatHours`, `formatWeekdays`, `formatDayHeading`, `beltLabel`, `roleLabel`): they are unit-tested, and a function that reaches for a cookie is neither pure nor testable. `formatMonthHeading` takes a `Locale` instead, because month names come from `Intl`.
- **Weekday names come from the dictionary, month names from `Intl`.** The weekdays are needed as a list anyway (course form checkboxes, grid header), and two sources for one list is how they drift. Twelve month names in three languages is what a platform already has.
- **URL paths are English**, all of them — `/members`, `/attendance`, `/courses`, `/change-password`, `#how-it-works`. Dictionary _keys_ keep Italian names (`t.registro`, `t.presenze`, `t.corsi`), which is internal and deliberate.
- **Dates stay dd/mm/yyyy in every language** (explicit instruction); the locale changes the words around them, not the number format.
- **Server actions look their own messages up** (`t.msg.*`): an error travelling back through a redirect is still copy.
- Language names in the switcher are **never translated** — a Brazilian scans for "Português". Since the switcher shows only a flag and a code, those names are each option's `aria-label`/`title`, so `LOCALE_LABELS` stays untranslated.

## Privacy and cookies

`/privacy` is the privacy notice and cookie policy in one public page, in all three languages, linked from every footer.

- **The banner informs, it does not ask.** The app sets only the Supabase session cookie and the language cookie, plus `theme` and the acknowledgement in `localStorage` — all technical or user-requested preferences, exempt from prior consent under the ePrivacy Directive. So `components/cookie-notice.tsx` has **one button**: a "reject" that switches nothing off would be theatre, and a fake choice is worse than no choice — it invites the reader to believe a decision was made. **The day an analytics script is added, this must become a real consent gate** — storing a decision, loading nothing before it.
- It stores the acknowledgement in `localStorage` under a version string, so bumping `NOTICE_VERSION` shows new text once to everybody. It reads that state through `useSyncExternalStore` like `ThemeToggle`, returning `null` on the server: rendering the banner into the HTML would flash it at every visitor who already dismissed it.
- **The notice is a draft and says so on the page.** There is no data controller yet, so it carries placeholders (`[NOME DELLA PALESTRA]`, `[EMAIL DI CONTATTO]`, the retention period) and a visible warning — a notice with placeholders and no warning reads as finished to anybody who does not look closely.
- **`/privacy` is public and reachable in every state**: in `PUBLIC_PATHS` (so the sitemap lists it), absent from `PROTECTED_PREFIXES` and `VISITOR_ONLY`, and **exempt from the forced-password-change redirect** in `utils/supabase/proxy.ts`. A legal notice nobody can open is not a notice.
- The text lives in the dictionaries (`privacy`, `cookieNotice`) as an array of sections. `UPDATED_ON` is hardcoded on purpose: "last updated" must mean the day somebody rewrote the text, not the day of the last deploy.

## Frontend UI

- **Brand colours are not semantic tokens.** The five values from `brand-guidelines.md` stay fixed; what changes with the theme is `--background`, `--foreground`, `--surface`, `--border`, `--muted`. Use those, not brand names, for anything that must read in both themes. Three dark values are deliberately their own: `--surface` is lifted just off `--background` (as `--color-neutral-dark` it read as a pale block), `--border` is distinct from `--surface` (identical meant bordered cards had no edge), and `--color-accent` is lightened to `#7d97ee` because `#3457d5` on `#16181d` is ~2.3:1, far under the 4.5:1 body text needs. `bg-muted` is the hover wash — never a fixed grey, which flashes bright on dark. The one exception is the logo plate: black artwork on transparency, so it sits on `bg-secondary` (fixed light) in both themes or it disappears.
- **`--success` and `--danger` are the only colours that mean something** rather than belonging to the brand: present and absent in the roll call. They flip per theme like every semantic token — a green dark enough to read on white is nearly black on dark. The three-state control uses them on the icon and a 10% tint, not as a filled button: three saturated circles on thirty rows is a wall of colour. "Non registrato" stays neutral grey: it is an empty state, not an outcome, and a third colour would imply it were one. The control carries a visible legend, because icons replaced letters and a `title` tooltip never appears on the phone where this page is used.
- **SEO lives in three places.** `utils/site.ts` holds `SITE_URL` (from `NEXT_PUBLIC_SITE_URL`) and the public paths; `app/layout.tsx` sets `metadataBase`, the title template, Open Graph and per-theme `themeColor`; `app/robots.ts` and `app/sitemap.ts` publish only the landing page, because every other route answers with a redirect to login and a search result pointing at a login form helps nobody. `metadataBase` is required — without an absolute base, canonical and OG URLs resolve to nothing and crawlers drop them.
- **The landing page links to `/login`, never into the app.** Its buttons used to point at `/members` and `/dashboard`, sending every visitor through the proxy to a login form. It is only ever seen signed out, so signing in is the only action that makes sense.
- Design tokens come from `brand-guidelines.md` at the repo root, implemented as CSS variables in `app/globals.css` (Tailwind v4 `@theme inline`, not a `tailwind.config.js`). Headings use Sora (`font-heading`), body Work Sans (`font-body`), both via `next/font/google` in `app/layout.tsx`.
- `components/nav-shell.tsx` is the app shell: sticky header with horizontal nav at `sm:` and up, fixed bottom tab bar below. It wraps `{children}` in the root layout — don't duplicate navigation inside pages.
- The nav is **role-aware**: `navItemsFor()` renders Home only for a visitor, Dashboard + Account for an allievo, the full set for staff. `canViewRegistry` is computed server-side in `app/layout.tsx` (`getAccess()`) and passed as a prop, like `isLoggedIn`. This only hides links — see the permission model for the real enforcement.
- **Dates read dd/mm/yyyy everywhere.** `formatDate()` in `utils/dates.ts` is the single place that turns a Postgres `date` ("YYYY-MM-DD") into what the app shows; `formatDayHeading()` in `utils/schedule.ts` builds on it, so the calendar reads "lunedì 14/09/2026". Both format in **UTC**, for the same reason as `daysSince()`: formatting a UTC-parsed date in local time shows the previous day east of Greenwich. Never render a raw date column. The one thing that must stay ISO is the `value`/`defaultValue` of an `<input type="date">` — that is what the element accepts and posts back.
- `components/icons.tsx` — hand-rolled inline SVG icons, no icon library. Add new icons there rather than pulling in a package.
- **The language switcher is a flag and a two-letter code** — `components/language-switcher.tsx`, flags hand-drawn in `components/flags.tsx`. Three deliberate points:
  - **The flags are SVG, never the flag emoji**: Windows ships no glyphs for regional-indicator pairs, so `🇮🇹` renders there as the bare letters "IT" — and the gym's front desk is exactly that machine. They live in their own file because they are flat multi-colour artwork, not `currentColor` line icons.
  - Each flag sits on a `ring-1 ring-border` plate, like the `Belt` images: Italy's white centre band would bleed into the light theme's header.
  - It is built on `<details>`/`<summary>`, not React open/closed state, so it opens **and switches language with no JavaScript** — each option is a real submit button carrying its own `locale`. The effect only adds what the element lacks (close on Escape and outside press); no close-on-submit is needed, since switching language navigates and remounts it. Don't replace it with a `useState` popover.
- **Belts are drawn, not spelled out.** `components/belt.tsx` renders the belt graphic wherever a rank is shown — Registro list and detail, `/account`, the roll call. Use it instead of printing the colour and a stripe count; the two are one thing on a belt. Three deliberate points:
  - Artwork lives in `frontend/public/belts/<colour>-<n>-stripe.png` (1000×300, transparent). The `belt_rank` enum says `purple` but the files say `violet`, so `BELT_FILE_COLOR` maps between them — don't rename the enum to match the assets.
  - The images are transparent, so a white belt would vanish on light and a black one on dark. The component puts them on a bordered, faintly tinted plate; that border is what makes them visible, not decoration.
  - The colour and stripe count survive as the `alt` text, which is what a screen reader reads. `BELT_LABELS` is still needed for filter chips and `<select>` options, which cannot hold an image.
- Logos live in `frontend/public/logo/`, belts in `frontend/public/belts/` — not at the root of `public/`.
- `components/coming-soon.tsx` — shared placeholder, currently unused now that `/dashboard` is wired; kept for the next unfinished section. Replace a route's `ComingSoon` with real content rather than adding a parallel page.
- All UI copy is translated (see "Languages"). Never hardcode a user-facing string in a component.
- **Theme (light/dark):** manual toggle in the header (`components/theme-toggle.tsx`), not just OS `prefers-color-scheme`. State is `localStorage["theme"]` (`"light"` | `"dark"`, absent = follow system) applied as `data-theme` on `<html>`. Three pieces must stay in sync:
  - `app/globals.css` defines light tokens on `:root`, a `prefers-color-scheme: dark` override guarded by `:not([data-theme="light"])`, and unconditional `:root[data-theme="dark"]` / `:root[data-theme="light"]` blocks so an explicit choice always wins over system preference in both directions.
  - A blocking inline script in `app/layout.tsx`'s `<head>` applies any stored theme before first paint (prevents a flash of the wrong theme). Don't move theme-reading into a React effect — that runs after paint.
  - `theme-toggle.tsx` reads state via `useSyncExternalStore` (not `useEffect` + `useState`) so it renders `null` on the server without tripping `react-hooks/set-state-in-effect`; a custom `faixabjj-theme-change` event re-syncs other instances of the toggle.

## Commands

All frontend commands run from `frontend/`:

```bash
cd frontend
npm run dev      # dev server (Turbopack) at http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm run lint     # ESLint (eslint-config-next)
npm test         # Vitest, single run
npm run test:watch
```

Vitest covers the pure functions in `frontend/utils/` and nothing else — no jsdom, no component tests, no end-to-end. Anything needing a browser or a database is verified by running the app.

No Python dependencies yet in `execution/` — add a `requirements.txt` there when the first script is written.

To preview the app in this environment, use the `frontend` launch configuration in `.claude/launch.json` (drives the Browser pane) rather than running `npm run dev` manually in a shell.

## What this project is

FAIXABJJ is a lightweight web app for tracking class hours, stripes and belt promotions in a Brazilian Jiu-Jitsu school, with a unified registry for students and instructors.

It deliberately is **not** a full gym management system — no payments, no online enrollment, no competition management. It sits alongside existing gym management software and covers one thing well: technical progression toward stripes/belts, with minimal added workload for instructors. Promotion eligibility is always surfaced as a suggestion/alert — the decision always stays with the instructor, never automated.

## Planned architecture

| Layer              | Choice                                                            |
| ------------------ | ----------------------------------------------------------------- |
| Frontend           | Next.js (App Router) + Tailwind CSS — see stack discrepancy above |
| Backend / Database | Supabase (Postgres + Auth)                                        |
| Permissions        | Row Level Security, based on the person's active role             |
| Hosting            | Vercel                                                            |

### Data model (planned)

- `Person` — single unified registry for both students and instructors
- `AssignedRole` — role history per person (student / assistant / instructor / head coach), with start/end dates
- `RoleThreshold` — configured suggested belt thresholds per role
- `Attendance` — present/absent per person/date, with a reference to who led the session
- `PromotionCriteria` — configurable hour thresholds and minimum time-at-rank per belt/stripe

`Person` is intentionally one entity for both students and instructors rather than separate tables, since the same individual can hold both roles simultaneously as their rank grows. Role assignment is always manual — suggested thresholds inform instructors but never trigger automatic promotions.

### Planned roadmap

1. Project setup and database schema
2. Person registry + role management
3. Attendance log + hour count
4. Promotion criteria + eligibility alerts
5. Dashboards (person view, instructor view, gym-wide view)
6. Free pilot with a real gym

## Working within the AGENT.md architecture

- Read `AGENT.md` in full before starting non-trivial work — it defines the directive/orchestration/execution split this repo follows.
- Don't create or overwrite files in `directives/` speculatively; they document real, validated workflows, written or approved by the user.
- Prefer a script in `execution/` over one-off manual work for anything deterministic and repeatable (data processing, API calls, file operations).
- `.tmp/` is disposable — never rely on its contents surviving, and never commit anything from it.
