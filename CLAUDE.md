# CLAUDE.md

Guidance for Claude Code working in this repository. Details live in `docs/claude/` — **read the relevant file before touching that area**.

| Working on…                                                                 | Read                                     |
| --------------------------------------------------------------------------- | ---------------------------------------- |
| Migrations, RLS, views, Supabase clients, env keys                          | `docs/claude/database.md`                |
| Login, password recovery, Turnstile, roles/permissions, `/account`, forced password change | `docs/claude/auth-and-access.md` |
| `/members` (Registro), account actions, promotions, criteria, belt ladders  | `docs/claude/members-and-promotions.md`  |
| `/courses`, `/attendance`, roll call, check-in, hours, `/dashboard`         | `docs/claude/attendance-and-dashboard.md`|
| i18n, privacy/cookies, theme, nav, belts, icons, SEO                        | `docs/claude/frontend-ui.md`             |

## What this project is

Faixa BJJ: a lightweight web app tracking class hours, stripes and belt promotions in a BJJ school, with one unified registry for students and instructors. **Not** a gym management system — no payments, online enrollment or competitions. Eligibility is always a suggestion; the instructor decides, never automated. `README.md` is the product spec (`bjj-progress-tracker-project.md` was never committed).

## Status and stack

Follows the 3-tier architecture in [`AGENT.md`](AGENT.md) (directives / orchestration / execution) — read it in full before non-trivial work. Stack: **Next.js App Router + Tailwind v4** (`frontend/`), **Supabase** (Postgres + Auth + RLS) as backend, Vercel hosting. The README's "React + Vite" is stale; `AGENT.md` + this file are authoritative.

`backend/` (FastAPI) deliberately does **not** exist. Add it only for logic that fits neither Supabase (RLS, functions, triggers) nor the client.

Real data on `/members`, `/courses`, `/attendance`, `/dashboard`, `/account`; public `/`, `/login`, `/forgot-password`, `/reset-password`, `/privacy`.

```
faixabjj/
├── frontend/          # Next.js — npm workspace, run commands from here
├── supabase/
│   ├── migrations/    # SQL history (must be replay-safe)
│   └── scripts/       # hand-run SQL, not part of history
├── directives/        # SOPs (AGENT.md Level 1) — don't write speculatively
├── execution/         # deterministic Python scripts (Level 3); add requirements.txt with the first one
├── docs/claude/       # detailed guidance split from this file
├── docs/handoff/      # session handoffs
├── .tmp/              # scratch, gitignored, never committed
├── belt-criteria.md   # promotion criteria source (IBJJF + academy practice)
└── brand-guidelines.md
```

## Commands (from `frontend/`)

```bash
npm run dev      # Turbopack dev server, http://localhost:3000
npm run build
npm run start
npm run lint
npm test         # Vitest single run (npm run test:watch)
```

Vitest covers pure functions in `frontend/utils/` only — no jsdom, no component or e2e tests; everything else is verified by running the app. To preview, use the `frontend` launch configuration in `.claude/launch.json`, not a manual `npm run dev`.

## Cross-cutting rules (always apply)

- **Migrations are applied by hand** to project `poksgledkecwviypspmi`, never via whatever project the MCP shows. Every migration must be **safe to run twice**; objects redefined across files (`current_access()`, `member_overview`, `person_hours`) are changed only in a **new** migration. Verify history changes by replaying in Docker. → `database.md`
- **`security_invoker = on` on every view.**
- **Permissions come from SQL predicates** (`current_access()` → `getAccess()` + `require*` guards); never re-implement them. `getAccess()` fails closed. Guards answer **404, not 403**. Hiding a nav link is never access control. Every protected page calls `requireAdmin()` (or `requireSession()` on `/change-password` only). `PROTECTED_PREFIXES` in `utils/supabase/proxy.ts` is the single list of gated routes.
- **No signup page, ever, without asking.** Login/reset errors stay generic (anti-enumeration).
- **One list of people.** Anything enumerating members lives in `/members`; no `/promotions` route.
- **Portal-only admin** (active roles exactly `{admin}`, `isPortalOnly()` in `utils/members.ts`) appears in no people list and shows no belt anywhere.
- **Promotion is never self-service**, and **a member never sees remaining hours, next grade or a verdict**. Eligibility is decided only in `promotionStatus()` (`utils/promotion.ts`).
- **Hours are added only by check-in or roll call.** One attendance = one hour. Estimated hours are labelled as estimates. `utils/hours.ts` is the single definition.
- **Service-role client** (`utils/supabase/admin.ts`, `server-only`) bypasses RLS: every action using it re-checks its guard.
- **No user-facing string hardcoded**; three languages (en default, it authoring, pt-BR). URL paths in English.
- **Dates dd/mm/yyyy** via `formatDate()`, formatted in UTC; never render a raw date column.
- **Belts shown as the `Belt` graphic**, never colour + stripe count.
- **Colours must work in light and dark**: use semantic tokens (`--background`, `--foreground`, `--surface`, `--border`, `--muted`), not brand colours.
- DB error text never reaches the screen; log it with `logDbError()`.
- Next.js uses `proxy.ts`, not `middleware.ts`. Use `getClaims()`, not `getUser()`. Publishable key, not legacy anon.
- `.tmp/` is disposable; prefer an `execution/` script for repeatable deterministic work.
