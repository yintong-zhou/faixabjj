<div align="center">
  <img src="frontend/public/logo/faixabjj_logo.png" alt="FAIXABJJ" width="320">
  <p><strong>Track class hours, stripes and belt promotions in a Brazilian Jiu-Jitsu school.</strong></p>
</div>

FAIXABJJ keeps one registry for everybody who trains at the gym — students and
instructors alike — counts the hours they put on the mat, and tells the head
coach who is getting close to their next stripe or belt. It does that one thing
and stops there.

It is not a gym management system. No payments, no online enrollment, no
competition management. It is meant to sit **alongside** whatever software the
gym already uses for the business side, and cover the part those tools handle
badly: technical progression, with as little extra work for the instructor as
possible.

## Why

Generic gym software treats belt rank as a text field. Promotions end up decided
by feel, or tracked in a notebook that lives in one person's bag. FAIXABJJ gives
the instructor an objective baseline — accumulated hours, time at the current
belt, attendance over the last weeks — and then gets out of the way.

> [!IMPORTANT]
> Eligibility is always a **suggestion**. The app flags who has met the
> thresholds; the promotion itself is never automatic, and a member can never
> change their own belt.

## Features

- **One registry for everyone.** A single person record covers students and
  instructors, because in BJJ the same person is often both — an assistant
  instructor is still somebody's student.
- **Roles with history.** Student, assistant, instructor, head coach and admin,
  each with start and end dates, so "who taught what, when" survives.
- **Courses and a lesson calendar.** A course is a recurring rule (weekdays,
  times, check-in window); the calendar of actual lessons is generated from it,
  as a weekly list or a month grid.
- **Roll call and self check-in.** Instructors mark the class present or absent;
  members check themselves in from their phone, but only inside the lesson's
  check-in window and only for themselves.
- **Hour count with an opening balance.** Hours before the app existed are
  estimated from the join date; every hour after go-live is recorded, never
  typed in.
- **Dashboards.** Gym-wide figures for staff, personal figures for a member —
  two different pages behind one route.
- **Account management.** Adding a person creates their account, on a shared
  default password the app forces them to replace before anything else opens.
- **Three languages.** English (default), Italian and Brazilian Portuguese —
  because a BJJ gym in Italy has Brazilian coaches and international students.
- **Light and dark theme**, mobile first. The gym reads this on a phone, at the
  edge of the mat.

## Tech stack

| Layer      | Choice                                                  |
| ---------- | ------------------------------------------------------- |
| Frontend   | Next.js 16 (App Router), React 19, Tailwind CSS v4       |
| Database   | Supabase (Postgres + Auth)                              |
| Permission | Postgres Row Level Security, driven by the active role  |
| Tests      | Vitest, over the pure functions in `frontend/utils/`     |
| Hosting    | Vercel                                                  |

There is no API layer on purpose. The browser talks to Supabase directly, so the
user's JWT reaches Postgres and RLS is what actually enforces the rules — the UI
only hides what the database would refuse anyway.

## Getting started

Requirements: Node.js 20+ and a Supabase project.

```bash
git clone <repo-url>
cd faixabjj/frontend
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

| Variable                                | Required | What it is                                                              |
| --------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`              | yes      | Project URL                                                             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  | yes      | Publishable key (the newer key, not the legacy `anon` one)              |
| `SUPABASE_SECRET_KEY`                   | yes      | Service-role key, server-only — creating and deleting accounts needs it |
| `NEXT_PUBLIC_SITE_URL`                  | yes      | Absolute deployment URL, no trailing slash — canonical links, sitemap   |

> [!WARNING]
> `SUPABASE_SECRET_KEY` bypasses Row Level Security. It carries no
> `NEXT_PUBLIC_` prefix on purpose and must never reach the browser.

### Database

Apply the SQL in `supabase/migrations/` in filename order, either with the
Supabase CLI or by pasting each file into the project's SQL Editor.

Then promote yourself. After the migrations **nobody has a role**, and an account
with no role is treated as a student — so the staff sections are invisible to
everyone, including you. The statement sits commented at the bottom of
`20260911120000_role_based_access.sql`:

```sql
insert into public.assigned_role (person_id, role)
select p.id, 'head_coach'::public.person_role
from public.person p
where p.email = 'you@example.com'
on conflict do nothing;
```

> [!NOTE]
> It is left commented deliberately. A migration that silently grants privileges
> is a privilege grant hiding inside a schema change.

### Before the first real gym uses it

Set `TRACKING_STARTED_ON` in `frontend/utils/hours.ts` to the date the gym
actually started recording attendance. Hours before that date are estimated from
the join date; hours from it on are counted. Leave it in the future and every
total is inflated, because the same weeks get estimated and counted both.

## Commands

All of these run from `frontend/`:

```bash
npm run dev      # dev server (Turbopack)
npm run build    # production build
npm run start    # serve the production build
npm run lint     # ESLint
npm test         # Vitest, single run
npm run test:watch
```

## How access works

Roles come from an active `assigned_role` row and decide what a person can
reach. Five roles, four privileges:

| Role         | Members list | Courses / Attendance             | Edit registry | Manage accounts |
| ------------ | ------------ | -------------------------------- | ------------- | --------------- |
| `student`    | —            | Attendance only, check-in for self | —           | —               |
| `assistant`  | —            | Attendance only, check-in for self | —           | —               |
| `instructor` | read-only    | full                             | —             | —               |
| `head_coach` | full         | full                             | yes           | yes             |
| `admin`      | full         | full                             | yes           | yes             |

`admin` means "runs the portal without teaching", so a portal-only admin is
excluded everywhere the app asks *which of our people is this* — the members
list, a roll call, an instructor dropdown.

Each privilege is one SQL predicate, called by the frontend rather than
reimplemented in it, and enforced three times over: the nav hides the link, the
page checks the predicate and answers 404, and RLS refuses the query. Hiding a
nav link is never the access control.

## Project layout

```
faixabjj/
├── frontend/              # Next.js app (App Router) — run every command from here
│   ├── app/               # routes: /members, /attendance, /courses, /dashboard, /account
│   ├── components/        # shell, belt graphics, hand-rolled icons, no UI dependency
│   └── utils/             # pure helpers (unit-tested), Supabase clients, i18n dictionaries
├── supabase/migrations/   # schema, RLS policies, views — plain SQL, applied in order
├── docs/handoff/          # session handoffs: what was decided and why
├── directives/            # SOPs (see AGENT.md)
├── execution/             # deterministic scripts (see AGENT.md)
├── AGENT.md               # the 3-tier agent architecture this repo follows
├── CLAUDE.md              # working notes for contributors and coding agents
└── brand-guidelines.md    # colours and typography
```

## Status

The app is in use-testable shape: registry, courses, attendance with check-in,
dashboards, account management and three languages all run against real data.
What is missing before a gym relies on it is the pilot itself — and the
go-live date mentioned above.

Roadmap, in order:

1. ~~Project setup and database schema~~
2. ~~Person registry and role management~~
3. ~~Attendance log and hour count~~
4. Promotion criteria and eligibility alerts
5. ~~Dashboards~~
6. Free pilot with a real gym
