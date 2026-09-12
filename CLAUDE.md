# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Early scaffolding stage. The repository follows the 3-tier agent architecture defined in [`AGENT.md`](AGENT.md) (directives / orchestration / execution). The `frontend/` app has been bootstrapped with `create-next-app` (Next.js App Router + Tailwind CSS); it now has a branded, mobile-first shell and IA (see "Frontend UI" below) and a working admin login gate (see "Authentication" below), `/registro` (member overview with filters and pagination), `/corsi` (recurring course definitions) and `/presenze` (lesson calendar, roll call and student check-in) are wired to real data. `/dashboard` is still a `ComingSoon` placeholder past the login check.

`backend/` (FastAPI) from the `AGENT.md` template has **not** been created. It's marked "se necessario" (if necessary) there, and per the README's architecture Supabase (Postgres + Auth + Row Level Security) is the backend — no separate API layer is needed unless/until logic emerges that can't live in Supabase (RLS policies, Postgres functions/triggers) or client-side. Add `backend/` only when a concrete need for a server-side API shows up.

**Stack discrepancy to be aware of:** the root `README.md` states "React + Vite + Tailwind" for the frontend, but `AGENT.md`'s web-app directive (which this structure follows, per explicit instruction) specifies **Next.js + React + Tailwind CSS**. The actual scaffolded app in `frontend/` is Next.js. Treat `AGENT.md` + this file as authoritative for the frontend framework; the README's tech-stack table is stale on this point and should be updated to match when convenient.

Note: the README also references a full project document at `bjj-progress-tracker-project.md`, which does not exist in this repository (never committed). Rely on `README.md` for the product spec until/unless that file is added.

## Repository structure

```
faixabjj/
├── frontend/       # Next.js app (App Router) + Tailwind — npm workspace, run commands from here
├── supabase/
│   └── migrations/  # SQL migrations (schema, RLS policies) — see "Database" below
├── directives/     # SOPs in Markdown (Level 1 — see AGENT.md). Empty until real workflows are defined.
├── execution/       # Deterministic Python scripts (Level 3 — see AGENT.md). Empty until needed.
├── .tmp/            # Intermediate/scratch files only — gitignored, never committed, safe to delete
├── AGENT.md         # Operating instructions for the agent (3-tier architecture, web app conventions)
└── README.md        # Product spec / project overview
```

## Database

Schema lives as plain SQL migrations in `supabase/migrations/` (standard Supabase CLI layout).

- `20260910000000_init_schema.sql` — the five tables from the planned data model (`person`, `assigned_role`, `role_threshold`, `attendance`, `promotion_criteria`), two enums (`belt_rank`, `person_role`), a `person_hours` view for the automatic hour count, and RLS enabled on every table with zero policies (default-deny).
- `20260910120000_admin_rls_policies.sql` — the original flat policies: every `authenticated` user got full CRUD on all five tables. **Largely superseded** — see the two migrations below. Kept as history; do not use it as a description of current behaviour.
- `20260911000000_account_management.sql` — profile provisioning (`on auth.users insert` trigger + backfill), the first `can_manage_users()`, and the anti-self-promotion guards.
- `20260911120000_role_based_access.sql` — **the current permission model.** Adds the `admin` role to the `person_role` enum and replaces the flat policies with per-role ones. Read this one first when reasoning about who can see or change what.

**⚠️ Neither migration has been confirmed applied to the live project yet, and this needs a human to resolve:** the Supabase MCP connection available in this environment authenticates to a *different* Supabase account/project (`ICPN_Main`, ref `szxiviyiavzdkaxasvic`) than the one this app actually points to (`frontend/.env.local`'s `NEXT_PUBLIC_SUPABASE_URL`, ref `poksgledkecwviypspmi`). Do not run schema/RLS changes against whatever project the connected MCP happens to show — verify the project ref matches `poksgledkecwviypspmi` first. Until that's sorted out, apply migrations by pasting them into the SQL Editor of the **correct** project's dashboard, or by connecting the right MCP/CLI and re-checking `list_migrations`.

### Connecting the frontend to Supabase

The frontend talks to Supabase directly via the client library (`@supabase/supabase-js` + `@supabase/ssr`) rather than through a custom API layer — this is what makes the RLS-based permission model above actually work, since the user's JWT has to reach Postgres. Setup:

- `frontend/utils/supabase/client.ts` — browser client, for Client Components
- `frontend/utils/supabase/server.ts` — server client (cookie-based), takes `createClient(await cookies())`, for Server Components/Actions/Route Handlers
- `frontend/utils/supabase/proxy.ts` + `frontend/proxy.ts` — refreshes the auth session cookie on every request **and** gates `/registro`, `/presenze`, `/dashboard` behind login (see "Authentication"). Next.js renamed the `middleware.ts` file convention to `proxy.ts`; don't recreate the old filename.
- `frontend/.env.example` — template; `frontend/.env.local` (gitignored) has this project's real values filled in already. Note: this project uses Supabase's newer **publishable** key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), not the legacy `anon` key — don't rename it back.

## Authentication

Single-tier admin login — no self-serve signup, no per-role permissions yet. Anyone who can sign in is treated as trusted staff (matches the RLS policies above).

- **No signup page exists on purpose** (confirmed explicitly with the user, not just assumed). Admin accounts are created directly in the Supabase Dashboard (Authentication → Users → Add user) for the `poksgledkecwviypspmi` project, not through the app — the RLS policies grant any `authenticated` user full access, so a public signup form would hand out full admin access to anyone who finds the URL. Don't add one without checking with the user first.
- `frontend/app/login/page.tsx` + `frontend/app/login/actions.ts` — email/password form posting to a `"use server"` action (`supabase.auth.signInWithPassword`). On failure it redirects back to `/login?error=...` with a deliberately generic message ("Email o password non corrette") — never surface the raw Supabase error, it would let someone enumerate registered emails.
- **Password recovery:** `/forgot-password` (`page.tsx` + `actions.ts`) calls `resetPasswordForEmail(email, { redirectTo: "<origin>/reset-password" })` and always redirects to the same `?sent=1` confirmation regardless of outcome — same anti-enumeration reasoning as login. `/reset-password` is a **Client Component** (not Server) because the recovery link redirects with the session tokens in the URL **hash fragment** (`#access_token=...&type=recovery`), which never reaches the server — only `@supabase/ssr`'s browser client can see it. That client auto-detects the fragment and fires an `onAuthStateChange` `"PASSWORD_RECOVERY"` event; the page listens for that (plus a `getSession()` fallback in case the event fired before the listener attached) before showing the new-password form, and falls back to an "invalid link" state after a 2s timeout if neither fires.
- `frontend/app/auth/signout/route.ts` — POST route handler, signs out and redirects to `/login`. The "Esci"/"Accedi" control in `frontend/components/nav-shell.tsx` posts here; `isLoggedIn` is computed server-side in `frontend/app/layout.tsx` (via `getClaims()`) and passed down as a prop, not read client-side.
- `frontend/utils/supabase/proxy.ts` redirects logged-out visitors away from `/registro`, `/presenze`, `/dashboard`, `/account` to `/login?next=<path>`, and redirects logged-in visitors away from `/login` to `/dashboard`. `PROTECTED_PREFIXES` in that file is the single source of truth for which routes are gated — update it there, not per-page, when adding a new protected section.
- Every protected page **also** calls `frontend/utils/supabase/require-admin.ts`'s `requireAdmin()` itself (defense in depth per Supabase's own Next.js SSR auth guide: proxy-only cookie checks are spoofable, so protected pages must verify independently too, not rely solely on the proxy).
- Uses `supabase.auth.getClaims()`, not the older `getUser()`, to check identity — current Supabase guidance, verifies the JWT locally (WebCrypto/JWKS) instead of a network round-trip when the project uses asymmetric signing keys (the default for new projects).
- The home page (`/`) is the landing page for **signed-out visitors only**. It stays publicly reachable, but `VISITOR_ONLY` in `frontend/utils/supabase/proxy.ts` redirects an authenticated visitor to `/dashboard`, exactly like `/login` — once there is a session it has nothing left to show. The nav drops the Home item for every signed-in user (staff included) and the header logo points at `/dashboard` instead, so the redirect is a safety net rather than the normal path.

## Account management

Two areas, both under `/account`, both in `PROTECTED_PREFIXES`.

- **`/account`** — the signed-in user's own profile. There is deliberately **no
  "delete my account"** action (the user cut it from scope); removing an account
  happens only from the user management area below. Editable: `full_name`,
  `email`, `phone`, `birth_date`, `notes`, plus password. `current_belt`,
  `current_stripes` and `rank_since` are **read-only on purpose** — promotion is
  an instructor decision, never self-service. Email changes go through
  `auth.updateUser({ email })` and only take effect after the confirmation link
  is opened.
- **`/registro`** — where accounts are managed, together with the member
  overview. There is deliberately no separate user-management page: one list of
  people, not two showing the same names. See "Registro" below.

The profile is the `person` row linked by `person.auth_user_id`, not a separate
table — the unified registry already models "a person who logs in".
`20260911000000_account_management.sql` adds an `on auth.users insert` trigger
that creates the row (plus a backfill), and `getOrCreateProfile()` in
`frontend/utils/supabase/profile.ts` creates it on demand as a fallback.

**Permission model.** This app is **not** flat — the early "every authenticated
user is trusted staff" design is gone. Roles come from an *active*
`assigned_role` (`end_date is null`) and map onto four SQL predicates:

| Role | Registro | Corsi / Presenze | Write registry | Manage accounts |
|---|---|---|---|---|
| `student` | not visible | Presenze only, check-in for self | no | no |
| `assistant` | not visible | Presenze only, check-in for self | no | no |
| `instructor` | read-only | full | no | no |
| `head_coach` | full | full | yes | yes |
| `admin` | full | full | yes | yes |

`assistant` sitting with `student` rather than with the technical staff was an
explicit decision, not an oversight. `admin` is a role for whoever runs the
portal without teaching.

The predicates are `can_view_registry()`, `can_edit_registry()`,
`can_manage_users()` and `can_manage_classes()`; `current_access()` returns all
four as JSON in one RPC.
The frontend calls them (`getAccess()`, `requireRegistryViewer()`,
`requireUserManager()`, `requireClassManager()` in
`utils/supabase/require-admin.ts`) rather than
re-implementing the rules — keep it that way, one definition per privilege.
`getAccess()` **fails closed**: an RPC error yields no access, never full access.
Note the consequence — before `20260911120000` is applied to a project the RPC
does not exist, so *everyone* is treated as an allievo.

A user with no active role is an allievo. Enforcement is layered: the nav hides
links, the page calls `requireRegistryViewer()` / `requireUserManager()`
(answering **404**, not 403 — a student should not learn the staff sections
exist), and RLS enforces it again in the database. **Hiding a nav link is never
the access control.**

Three things that look simplifiable but are not:

- Writes to `assigned_role` are manager-only. Otherwise any authenticated user
  could insert an active `head_coach` row for themselves and self-promote,
  making every restriction above decorative.
- `guard_person_auth_link` (a trigger on `person`) freezes `auth_user_id` against
  non-managers, and `current_belt` / `current_stripes` / `rank_since` against
  non-editors. Both are escalation paths RLS alone cannot close, because a
  member legitimately holds UPDATE on their own row: repointing the head coach's
  profile at your own account inherits their privileges, and self-editing your
  belt would make promotion self-service. The trigger skips when `auth.uid()` is
  null (service role, and the FK's own `ON DELETE SET NULL` cascade — without
  that escape, deleting a user would fail).
- The `admin` enum value is never written as a literal in migration SQL
  (`role::text = any(...)` is used instead). Postgres forbids using a freshly
  added enum value in the same transaction that adds it, so a literal would
  break replaying the migration from scratch.

**Bootstrap.** Nobody has a role after the migrations, so everyone is an allievo
and no one can reach user management. The first `head_coach` must be inserted by
hand; the statement sits at the bottom of both migrations, commented out on
purpose — a migration that silently grants privileges is a privilege grant
hiding in a schema change.

**Service-role key.** `frontend/utils/supabase/admin.ts` reads
`SUPABASE_SECRET_KEY` (no `NEXT_PUBLIC_` prefix) and is marked `server-only`, so
importing it from a Client Component is a build error. This key **bypasses RLS**,
so every server action in `frontend/app/registro/actions.ts` re-checks `requireUserManager()`
itself — the database will not enforce the privilege on those calls. Without the
key the page still renders but the destructive controls are disabled.

Revoking access deletes the `auth` user only. `person.auth_user_id` is
`ON DELETE SET NULL`, so the registry row and its attendance history survive as
an account-less person — revoking must not erase the gym's records.

## Forced password change

Every account `addPerson` creates starts on the same published default
password, so the app opens nothing else until that password is replaced.

- The obligation lives in **`app_metadata.must_change_password`**, not
  `user_metadata`. That is the whole point: `user_metadata` is writable by the
  user it describes, so a member could clear their own obligation; `app_metadata`
  is writable only by the service role and still rides in the verified JWT,
  where both the proxy and `requireSession()` can read it with no extra query.
- Enforced in two places, the usual defense in depth: `frontend/utils/supabase/proxy.ts`
  redirects every path to `/cambia-password`, and `requireAdmin()` does the same
  per page. `/auth/*` is exempt, or signing out would be unreachable and the only
  escape would be clearing cookies.
- `requireSession()` vs `requireAdmin()`: identical except that `requireAdmin`
  enforces the pending change. `/cambia-password` is the one page that must use
  `requireSession`, or it would redirect to itself forever. Every other protected
  page uses `requireAdmin`.
- The action **refuses the default password** as the new one — without that check
  the whole flow would be theatre — then clears the flag with the admin client
  and calls `refreshSession()`. That refresh is not optional: the old JWT still
  carries `must_change_password: true`, so without it the proxy bounces the user
  straight back to the form.

## Registro

`/registro` is the member overview: every person in the gym with their active
roles, belt, accumulated hours and join date. It is also where accounts are
managed — invite, password reset, revoke access — because splitting the two
would mean two lists of the same people.

Visible to instructors, maestri and admin. An **instructor sees it read-only**:
the page renders no action controls for them (`access.canEditRegistry`), and RLS
refuses the writes anyway.

- **Data source:** the `member_overview` view
  (`20260911140000_member_overview.sql`), one row per person with
  `active_roles` (a text array), `is_active` and `total_hours` pre-joined.
  Without it, filtering by role could not be paginated or counted correctly —
  the roles live in another table, so the database has to do the flattening.
- **Filters and paging live in the URL** (`q`, `ruolo`, `cintura`, `attivi`,
  `p`), submitted by a plain `method="get"` form. The list is therefore
  shareable, survives a reload, and the page needs no client JS. Row actions
  carry the current query back in a `_query` hidden field so acting on a row
  does not reset the list you were looking at.
- **Search matches the name only**, never the email — an explicit decision.
  User input is stripped of `%`, `,`, `(`, `)` and backslashes before reaching
  `ilike`, since those characters break PostgREST's filter syntax.
- **Adding a person also creates their account.** (This requirement was
  reversed once mid-development — the two used to be separate. Trust this
  description, not any older comment.)
  `addPerson` creates the auth user with the shared default password from
  `frontend/utils/default-password.ts`, `email_confirm: true` (so **no email is
  sent** and the account works immediately) and `app_metadata.must_change_password`,
  then fills in the `person` row the trigger just created and assigns the role.
  Required: name, email, role, join date and belt — validated in the server
  action, not only through the form's `required` attributes, which a crafted
  POST skips. Optional: phone, birth date, stripes, rank date, notes.
  **Order matters:** the auth user is created *first*, because that is the step
  that fails on a duplicate email; doing it after the registry write would strand
  a person row with no account every time the address is already taken. Most people in a gym are records to
  track, not portal users. It runs on the *user's* Supabase client, not the
  service-role one, so RLS does the enforcing; it needs no secret key.
- **"Reimposta password"** (`setTemporaryPassword`) does *not* email a recovery link, and shows no password on screen. It is a single confirmed button in the kebab that restores the account to the shared default from `frontend/utils/default-password.ts` — the one `addPerson` starts every account on, and the only one that needs no reading back off the screen because it is already printed in the "Aggiungi persona" panel. The action **re-arms `must_change_password`**; without that flag the account would be left sitting on a password everybody knows.
- **"Invita al portale"** (`inviteToPortal`) covers the member who has *no*
  account — in practice someone whose access was revoked. It sends an email and
  lets them choose their own password, so no default password and no forced
  change are involved. It is the only action in the app that sends mail.
- **`rank_since` vs `stripe_since`.** `rank_since` means *belt promotion date* (label "Cambio cintura da"); `stripe_since`, added in `20260911220000`, means *last stripe awarded* (label "Ultima tacca"). They move at different rates — a belt lasts years, stripes come every few months — and "how long at this belt" is what promotion eligibility hangs on, so it must not be inferred from the stripe date. `20260911200000` split them the other way round (a `belt_since` column) and `20260911220000` corrects it; that correction is a follow-up rather than an edit because the first one had already been applied. Existing rows were backfilled from `rank_since`, the closest approximation available; outliers need correcting by hand. Both dates are frozen by `guard_person_auth_link`, because backdating either is how you would fake eligibility for the next promotion.
- **Each row shows two day counters** under the name: days since `joined_at` (how long they have trained at all) and days since `rank_since` (how long at the current belt — the figure promotion eligibility actually hangs on). `daysSince()` in `frontend/utils/dates.ts` normalises **both ends to UTC midnight**: comparing a UTC-parsed `date` column against a local-time `now` drifts by a day depending on the viewer's timezone and the hour of the request. A future date clamps to 0 rather than going negative.
- **The list row shows no email** — it was removed to keep the row scannable. Everything recorded about a person lives on the detail page, `/registro/[id]`, reached from the kebab's **Dettagli** item. That page reads from `person` (plus `person_hours`) rather than from `member_overview`: a single record needs no pre-joined roles array, and the table carries `notes`, which the list view leaves out. It also lists the **full role history**, closed assignments included. The kebab carries the list's current filters in a `from` param so the back link returns to the exact list you opened it from.
- **Dettagli is available to instructors too**, so the kebab now renders for every viewer; only the account actions inside it are gated on `canEditRegistry`.
- **Every row action sits behind a kebab menu** (`frontend/components/row-menu.tsx`), pinned to the right of the row, so a destructive control is never one stray tap away while scrolling. The menu is a Client Component; the action forms are server-rendered and passed in as `children`, which is what keeps the server actions working inside it. It closes on Escape and on an outside pointer press, and needs no explicit close-on-submit because every action navigates and remounts the row. Rows with no available action render no kebab at all.
- A member with `auth_user_id = null` shows as **"senza account"**: either
  someone never invited, or someone whose access was revoked. Revocation keeps
  the registry row and the attendance history on purpose.
- `20260911160000_link_invited_person.sql` makes the `auth.users` trigger **link**
  a new account to an existing account-less registry row with the same email
  (case-insensitive) instead of inserting a second row. Without it, inviting
  someone already in the registry would duplicate them. The fix lives in the
  trigger rather than in the server action so that every path that creates an
  auth user — the invite button, the Supabase Dashboard, anything added later —
  is covered.

**Views bypass RLS unless you say otherwise.** A Postgres view runs with its
owner's privileges, so `security_invoker = on` is mandatory on every view in
this project — without it an allievo could read the whole gym through the view
even though the table policies forbid it. `person_hours` was created in
`20260910000000` without the option and was readable by everyone; the Registro
migration fixes it. Check this on any new view.

## Presenze e corsi

Two sections, one data model. `/corsi` is where staff describe the recurring
classes; `/presenze` is the calendar those definitions generate, the roll call
behind each lesson, and the place a member checks themselves in.

**Three tables** (`20260912000000_class_schedule.sql`):

- `course` — the recurring *rule*, not a lesson: `weekdays` (an ISO
  `smallint[]`, 1 = Monday), one `start_time`/`end_time` pair, an optional
  `starts_on`/`ends_on` range, and the two check-in margins. A course that runs
  at different times on different days is modelled as **two courses** — that
  trade buys one table instead of a `course_slot` join table.
- `class_session` — the lesson that actually happens. Its times are **copied**
  from the course at generation rather than joined through it, so editing a
  course never silently rewrites lessons that already took place.
- `attendance` — rewired onto `session_id`. `class_date`, `led_by`,
  `duration_hours` and `unique (person_id, class_date)` are gone; the key is
  now `unique (person_id, session_id)`.

**One attendance is one hour**, and `duration_hours` was *removed* rather than
defaulted to 1: with a default, a crafted write can still store 2 and the rule
becomes a convention. The cost is that a four-hour seminar cannot be one row.
`person_hours` is therefore `count(*) filter (where present)`, not a sum — and
because `member_overview` reads it, that view has to be dropped and recreated
in the same migration or the `drop view` is refused.

**Permissions** (`20260912010000_class_schedule_access.sql`) add a fourth
predicate, `can_manage_classes()` = instructor + head_coach + admin, exposed by
`current_access()` as `canManageClasses` and guarded in the app by
`requireClassManager()`. It is deliberately **not** `can_edit_registry()`: an
instructor runs the classes but must never change anybody's belt. Two
privileges, two predicates — do not collapse them.

**`/presenze` is open to every signed-in member**, unlike `/registro`. This is
the one previously staff-only section a student reaches, and it has to be:
check-in must live where the lessons are listed, and there is only one such
list. The page calls `requireAdmin()` and branches on `canManageClasses` —
staff get the roll call link and the presence count, a member gets a check-in
button for themselves.

**Student check-in** is an RLS `insert` policy requiring four things together:
the row is theirs, `present` is true, `checked_in_by = 'self'`, and
`session_checkin_open(session_id)`. Undo is allowed only on their own `'self'`
row and only while the window is open. `checked_in_by` is what makes a row the
staff created un-undoable by the member it describes.

**Two things that look like duplication but are not:**

- The **weekday expansion** lives in TypeScript (`frontend/utils/schedule.ts`,
  covered by `schedule.test.ts`) and Postgres only receives the resulting list
  of dates, through `sync_course_sessions(course_id, dates[])`. SQL does the
  part only SQL can do atomically: drop the future sessions the new schedule
  supersedes **but only where no attendance exists**, then insert the rest.
  Past sessions are never touched.
- The **timezone maths** lives only in SQL. `session_date + start_time` is
  wall-clock and `now()` is `timestamptz`; comparing them directly opens
  check-in an hour early under DST. `gym_timezone()` (`Europe/Rome`) is applied
  once, and `session_overview` exposes `checkin_opens_at`/`checkin_closes_at` as
  instants so `checkinState()` in TypeScript only ever compares two timestamps.

**A course with attendance can only be suspended, never deleted.** The rule is
a `before delete` trigger (`guard_course_delete`), not a check in the server
action, because the service-role key bypasses RLS — and because `class_session`
cascades from `course` and `attendance` cascades from `class_session`, a plain
delete would take the gym's hours with it. Same reasoning as "revoca accesso"
in the Registro.

**Cancelling a lesson** sets `status = 'cancelled'`: check-in closes, the row
shows struck through, and attendance already recorded survives.

Both views here — `session_overview` and `course_overview` — carry
`security_invoker = on`, like every view in this project. Note the consequence
on `session_overview.present_count`: it respects the caller's own attendance
policy, so a student would see only their own row counted. The UI shows that
count to staff only.

## Frontend UI

- Design tokens (colors, fonts) come from `brand-guidelines.md` at the repo root — implemented as CSS variables in `frontend/app/globals.css` (Tailwind v4 `@theme inline`, not a `tailwind.config.js`). Headings use Sora (`font-heading`), body text uses Work Sans (`font-body`), both loaded via `next/font/google` in `frontend/app/layout.tsx`.
- `frontend/components/nav-shell.tsx` is the app shell: a sticky header with horizontal nav on `sm:` and up, a fixed bottom tab bar below `sm:`. It wraps `{children}` in the root layout — don't duplicate navigation inside individual pages.
- The nav is **role-aware**: `navItemsFor()` in that file renders only Home for a visitor, Dashboard + Account for an allievo, and the full set for staff. `canViewRegistry` is computed server-side in `frontend/app/layout.tsx` (via `getAccess()`) and passed down as a prop, like `isLoggedIn`. This only hides links — see the permission model above for the real enforcement.
- `frontend/components/icons.tsx` — small hand-rolled inline SVG icons (no icon library dependency). Add new icons here rather than pulling in a package.
- `frontend/components/coming-soon.tsx` — shared placeholder, now used only by `/dashboard` until it is wired to real Supabase data. Replace a route's `ComingSoon` usage with real content rather than adding a parallel page.
- All copy in the UI is in Italian.
- **Theme (light/dark):** manual toggle in the header (`frontend/components/theme-toggle.tsx`), not just OS `prefers-color-scheme`. State is `localStorage["theme"]` (`"light"` \| `"dark"`, absent = follow system) applied as `data-theme` on `<html>`. Three pieces make this work together — keep them in sync if you touch theming:
  - `frontend/app/globals.css` defines light tokens on `:root`, a `prefers-color-scheme: dark` override guarded by `:not([data-theme="light"])`, and unconditional `:root[data-theme="dark"]` / `:root[data-theme="light"]` blocks so an explicit choice always wins over system preference in both directions.
  - A blocking inline script in `frontend/app/layout.tsx`'s `<head>` applies any stored theme before first paint (prevents a flash of the wrong theme). Don't move theme-reading logic into a React effect — that runs after paint.
  - `theme-toggle.tsx` reads state via `useSyncExternalStore` (not `useEffect` + `useState`) so it renders `null` on the server without triggering the `react-hooks/set-state-in-effect` lint rule; a custom `faixabjj-theme-change` event re-syncs other instances of the toggle after a click.

## Commands

All frontend commands run from `frontend/`:

```bash
cd frontend
npm run dev      # start dev server (Turbopack) at http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm run lint     # ESLint (eslint-config-next)
```

Vitest covers the pure functions in `frontend/utils/` and nothing else — no jsdom, no component tests, no end-to-end. Anything needing a browser or a database is verified by running the app.

```bash
npm test         # Vitest, single run
npm run test:watch
```

There are no Python dependencies yet in `execution/` — add a `requirements.txt` there when the first script is written.

To preview the app in this environment, use the `frontend` launch configuration in `.claude/launch.json` (drives the Browser pane) rather than running `npm run dev` manually in a shell.

## What this project is

FAIXABJJ is a lightweight web app for tracking class hours, stripes, and belt promotions in a Brazilian Jiu-Jitsu school, with a unified registry for students and instructors.

It deliberately is **not** a full gym management system — no payments, no online enrollment, no competition management. It's meant to sit alongside existing gym management software and cover one thing well: tracking technical progression toward stripes/belts, with minimal added workload for instructors. Promotion eligibility is always surfaced as a suggestion/alert — the actual promotion decision always stays with the instructor, never automated.

## Planned architecture

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + Tailwind CSS — see stack discrepancy note above |
| Backend / Database | Supabase (Postgres + Auth) |
| Permissions | Row Level Security on Supabase, based on the person's active role |
| Hosting | Vercel |

### Data model (planned)

- `Person` — single unified registry for both students and instructors (a person's role can change over time, e.g. a student becomes an assistant instructor)
- `AssignedRole` — role history per person (student / assistant / instructor / head coach), with start/end dates
- `RoleThreshold` — configured suggested belt thresholds per role
- `Attendance` — present/absent per person/date, with a reference to who led the session
- `PromotionCriteria` — configurable hour thresholds and minimum time-at-rank per belt/stripe

Key design point: `Person` is intentionally a single entity for both students and instructors rather than separate tables, since the same individual can hold both roles simultaneously as their rank grows. Role assignment is always manual — suggested belt thresholds inform instructors but never trigger automatic promotions.

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
