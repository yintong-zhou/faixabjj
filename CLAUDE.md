# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Early scaffolding stage. The repository follows the 3-tier agent architecture defined in [`AGENT.md`](AGENT.md) (directives / orchestration / execution). The `frontend/` app has been bootstrapped with `create-next-app` (Next.js App Router + Tailwind CSS); it now has a branded, mobile-first shell and IA (see "Frontend UI" below) and a working admin login gate (see "Authentication" below), but `/registro`, `/presenze`, `/dashboard` are still placeholders past the login check — they show `ComingSoon`, not real data, because the RLS policies that would let a logged-in user read/write the tables haven't been applied to the live database yet (see "Database" — this is the actual current blocker, not auth).

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
- `20260910120000_admin_rls_policies.sql` — grants the `authenticated` Postgres role full `select`/`insert`/`update`/`delete` on all five tables. Deliberately **not** ownership-scoped: every logged-in user is trusted staff (there's no "instructor sees only their own students" split), matching what was actually asked for. Revisit only if a real per-role restriction is requested.

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
- `frontend/utils/supabase/proxy.ts` redirects logged-out visitors away from `/registro`, `/presenze`, `/dashboard` to `/login?next=<path>`, and redirects logged-in visitors away from `/login` to `/dashboard`. `PROTECTED_PREFIXES` in that file is the single source of truth for which routes are gated — update it there, not per-page, when adding a new protected section.
- Every protected page **also** calls `frontend/utils/supabase/require-admin.ts`'s `requireAdmin()` itself (defense in depth per Supabase's own Next.js SSR auth guide: proxy-only cookie checks are spoofable, so protected pages must verify independently too, not rely solely on the proxy).
- Uses `supabase.auth.getClaims()`, not the older `getUser()`, to check identity — current Supabase guidance, verifies the JWT locally (WebCrypto/JWKS) instead of a network round-trip when the project uses asymmetric signing keys (the default for new projects).
- The home page (`/`) is intentionally never gated — it's the public landing page.

## Frontend UI

- Design tokens (colors, fonts) come from `brand-guidelines.md` at the repo root — implemented as CSS variables in `frontend/app/globals.css` (Tailwind v4 `@theme inline`, not a `tailwind.config.js`). Headings use Sora (`font-heading`), body text uses Work Sans (`font-body`), both loaded via `next/font/google` in `frontend/app/layout.tsx`.
- `frontend/components/nav-shell.tsx` is the app shell: a sticky header with horizontal nav on `sm:` and up, a fixed bottom tab bar below `sm:`. It wraps `{children}` in the root layout — don't duplicate navigation inside individual pages.
- `frontend/components/icons.tsx` — small hand-rolled inline SVG icons (no icon library dependency). Add new icons here rather than pulling in a package.
- `frontend/components/coming-soon.tsx` — shared placeholder used by `/registro`, `/presenze`, `/dashboard` until each is wired to real Supabase data. Replace a route's `ComingSoon` usage with real content rather than adding a parallel page.
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

There is no test runner configured yet — add one (and this section) when tests are introduced. There are no Python dependencies yet in `execution/` — add a `requirements.txt` there when the first script is written.

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
