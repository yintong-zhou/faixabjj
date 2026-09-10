# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Early scaffolding stage. The repository follows the 3-tier agent architecture defined in [`AGENT.md`](AGENT.md) (directives / orchestration / execution). The `frontend/` app has been bootstrapped with `create-next-app` (Next.js App Router + Tailwind CSS) but has no product features yet — it's still the default starter page.

`backend/` (FastAPI) from the `AGENT.md` template has **not** been created. It's marked "se necessario" (if necessary) there, and per the README's architecture Supabase (Postgres + Auth + Row Level Security) is the backend — no separate API layer is needed unless/until logic emerges that can't live in Supabase (RLS policies, Postgres functions/triggers) or client-side. Add `backend/` only when a concrete need for a server-side API shows up.

**Stack discrepancy to be aware of:** the root `README.md` states "React + Vite + Tailwind" for the frontend, but `AGENT.md`'s web-app directive (which this structure follows, per explicit instruction) specifies **Next.js + React + Tailwind CSS**. The actual scaffolded app in `frontend/` is Next.js. Treat `AGENT.md` + this file as authoritative for the frontend framework; the README's tech-stack table is stale on this point and should be updated to match when convenient.

Note: the README also references a full project document at `bjj-progress-tracker-project.md`, which does not exist in this repository (never committed). Rely on `README.md` for the product spec until/unless that file is added.

## Repository structure

```
faixabjj/
├── frontend/       # Next.js app (App Router) + Tailwind — npm workspace, run commands from here
├── directives/     # SOPs in Markdown (Level 1 — see AGENT.md). Empty until real workflows are defined.
├── execution/       # Deterministic Python scripts (Level 3 — see AGENT.md). Empty until needed.
├── .tmp/            # Intermediate/scratch files only — gitignored, never committed, safe to delete
├── AGENT.md         # Operating instructions for the agent (3-tier architecture, web app conventions)
└── README.md        # Product spec / project overview
```

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
