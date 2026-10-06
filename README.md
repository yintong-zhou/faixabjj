<div align="center">
  <img src="frontend/public/logo/faixabjj_logo.png" alt="Faixa BJJ" width="320">
  <p><strong>Track class hours, stripes and belt promotions in a Brazilian Jiu-Jitsu school.</strong></p>
  <p>
    <a href="#features">Features</a> ·
    <a href="#getting-started">Getting started</a> ·
    <a href="#how-access-works">How access works</a> ·
    <a href="#project-layout">Project layout</a>
  </p>
</div>

Faixa BJJ keeps one registry for everybody who trains at the gym — students and
instructors alike — counts the hours they put on the mat, and tells the head
coach who is getting close to their next stripe or belt. It does that one thing
and stops there.

It is not a gym management system. No payments, no online enrollment, no
competition management. It is meant to sit **alongside** whatever software the
gym already uses for the business side, and cover the part those tools handle
badly: technical progression, with as little extra work for the instructor as
possible. One deployment hosts many gyms, each isolated from the others.

## Why

Generic gym software treats belt rank as a text field. Promotions end up decided
by feel, or tracked in a notebook that lives in one person's bag. Faixa BJJ gives
the instructor an objective baseline — accumulated hours, time at the current
belt, attendance over the last weeks — and then gets out of the way.

> [!IMPORTANT]
> Eligibility is always a **suggestion**. The app flags who has met the
> thresholds; the promotion itself is recorded by the head coach, never
> automatically, and a member can never change their own belt. A member never
> sees remaining hours, their next grade or a verdict.

## Features

### Registry and promotions

- **One registry for everyone.** A single person record covers students and
  instructors, because in BJJ the same person is often both. Search by name
  (accent-insensitive), filter by role, belt and status.
- **Roles with history.** Student, assistant, instructor, head coach and admin,
  each with start and end dates, so "who taught what, when" survives.
- **Eligibility in the registry.** Per-gym promotion criteria (hours and time at
  belt, editable on `/members/criteria`) drive a count of eligible members, an
  eligibility filter and a marker on each row — one computation, seen three ways.
- **Promotions by the head coach only**, with a full history per person. Belt and
  stripe dates can be corrected by head coaches and instructors; the join date
  by registry editors. Nobody edits their own.

### Lessons, attendance and hours

- **Courses and a lesson calendar.** A course is a recurring rule (weekdays,
  times, default instructor, check-in window); the lessons are generated from
  it, as a weekly list or a month grid, with per-lesson substitutions.
- **Roll call and self check-in.** Instructors mark the class present or absent.
  Members check themselves in from their phone — only inside the lesson's window,
  only for themselves, and, when the gym has set its position, only within 50 m
  of it. Coordinates are compared and discarded, never stored.
- **Printable QR code.** Each gym prints one QR pointing at `/check-in`; members
  scan it with the phone camera or with the in-app scanner on their dashboard.
- **Hour count with an opening balance.** Hours before the gym's go-live date
  are estimated from the join date and always labelled as estimates; every hour
  after is recorded by check-in or roll call, never typed in.
- **Dashboards.** Gym-wide figures and attendance charts for staff, personal
  figures for a member.

### Accounts and sign-in

- **Accounts created by staff.** Adding a person creates their account on a
  temporary password of its own, shown once, which must be replaced before
  anything else opens. No emails sent, no public signup.
- **Invite link per gym.** A gym can share one registration link; athletes
  register with their declared belt and wait on a pending page until a manager
  approves or rejects them on `/members/requests`.
- **Email or username login**, password recovery by email, and Cloudflare
  Turnstile on every form a signed-out visitor can reach. Login and recovery
  errors stay generic, so nobody can probe which accounts exist.

### Platform

- **Multi-gym tenancy.** Every row belongs to a gym; Row Level Security keeps
  gyms from seeing each other. Each gym has its own timezone, go-live date,
  lesson length, lessons per week, location and promotion criteria.
- **Platform superadmin.** Creates, suspends and deletes gyms and their
  managers, and sees a platform dashboard built from aggregates only — never a
  member, an attendance row or a promotion.
- **Self-pruning app log.** Server errors and key events (accounts, promotions,
  gyms) are kept for 7 days, at most 2000 rows, and are readable only by the
  superadmin on `/logs`. Ids only, no names or emails.

### Everywhere

- **Three languages.** English (default), Italian and Brazilian Portuguese —
  because a BJJ gym in Italy has Brazilian coaches and international students.
- **Light and dark theme**, mobile first. The gym reads this on a phone, at the
  edge of the mat.
- **Public pages:** a landing page, a demo request page and a privacy page with
  a cookie notice.

## Tech stack

| Layer      | Choice                                                         |
| ---------- | -------------------------------------------------------------- |
| Frontend   | Next.js 16 (App Router), React 19, Tailwind CSS v4             |
| Database   | Supabase (Postgres + Auth)                                     |
| Permission | Postgres Row Level Security, driven by the active role and gym |
| Bot check  | Cloudflare Turnstile, verified by Supabase Auth                |
| Tests      | Vitest (pure functions in `frontend/utils/`), SQL replay in Docker |
| Hosting    | Vercel                                                         |

There is no API layer on purpose. The browser talks to Supabase directly, so the
user's JWT reaches Postgres and RLS is what actually enforces the rules — the UI
only hides what the database would refuse anyway.

## Getting started

Requirements: Node.js 20+, a Supabase project, and Docker if you want to replay
the migrations locally.

```bash
git clone <repo-url>
cd faixabjj/frontend
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

| Variable                               | Required | What it is                                                                |
| -------------------------------------- | -------- | ------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | yes      | Project URL                                                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes      | Publishable key (the newer key, not the legacy `anon` one)                |
| `SUPABASE_SECRET_KEY`                  | yes      | Service-role key, server-only — account management and the app log need it |
| `NEXT_PUBLIC_SITE_URL`                 | yes      | Absolute deployment URL, no trailing slash — canonical links, sitemap, QR  |
| `NEXT_PUBLIC_TURNSTILE_SITEKEY`        | yes      | Turnstile sitekey; its secret lives in Supabase Auth → Attack Protection  |
| `TURNSTILE_SECRET_KEY`                 | for `/join` | Server-only; the invite registration verifies its challenge itself     |

> [!WARNING]
> `SUPABASE_SECRET_KEY` bypasses Row Level Security. It carries no
> `NEXT_PUBLIC_` prefix on purpose and must never reach the browser.

### Database

Apply the SQL in `supabase/migrations/` in filename order, either with the
Supabase CLI or by pasting each file into the project's SQL Editor. Every
migration is safe to run twice. Some must be applied before or after deploying
the matching app version — `docs/claude/database.md` says which.

To check the whole history locally, in a throwaway Postgres:

```bash
bash supabase/tests/replay.sh --isolation   # from the repo root, Docker running
```

It applies every migration twice and runs the tenant-isolation checks. Never
point anything in `supabase/tests/` at a real project.

### First accounts

After the migrations **nobody has a privilege**. Grants are made by hand, on
purpose:

1. Create the superadmin's account in the Supabase Dashboard, then run
   `supabase/scripts/bootstrap-platform-admin.sql` in the SQL Editor (adjust the
   email inside).
2. Sign in as the superadmin, create a gym on `/gyms` — timezone, go-live date
   and location included — and add its manager.
3. The manager signs in, replaces the temporary password and adds the gym's
   people, assigning the head coach role on `/members`.

> [!NOTE]
> Set each gym's go-live date to the day it really starts recording attendance.
> Hours before it are estimated, hours from it on are counted; a date in the
> future counts the same weeks twice.

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
reach inside their gym:

| Role         | Members list | Courses / Attendance               | Edit registry | Manage accounts | Promote |
| ------------ | ------------ | ---------------------------------- | ------------- | --------------- | ------- |
| `student`    | —            | Attendance only, check-in for self | —             | —               | —       |
| `assistant`  | —            | Attendance only, check-in for self | —             | —               | —       |
| `instructor` | read-only    | full                               | —             | —               | —       |
| `head_coach` | full         | full                               | yes           | yes             | yes     |
| `admin`      | full         | full                               | yes           | yes             | —       |

`admin` means "runs the portal without teaching": a portal-only admin appears in
no people list and shows no belt. The **platform superadmin** sits outside every
gym: it reaches only the platform dashboard, `/gyms`, `/logs` and its own
account.

Each privilege is one SQL predicate, called by the frontend rather than
reimplemented in it, and enforced three times over: the nav hides the link, the
page checks the predicate and answers 404, and RLS refuses the query. Hiding a
nav link is never the access control.

## Project layout

```
faixabjj/
├── frontend/              # Next.js app (App Router) — run every command from here
│   ├── app/               # routes: /members, /courses, /attendance, /check-in, /dashboard,
│   │                      #   /account, /gym, /gyms, /logs, /join, public pages
│   ├── components/        # shell, belt graphics, hand-rolled icons, no UI dependency
│   └── utils/             # pure helpers (unit-tested), Supabase clients, i18n dictionaries
├── supabase/
│   ├── migrations/        # schema, RLS policies, views, functions — plain SQL, in order
│   ├── scripts/           # hand-run SQL (bootstrap, diagnostics), not part of history
│   └── tests/             # Docker replay and tenant-isolation checks
├── docs/
│   ├── claude/            # detailed guidance per area (database, access, members, …)
│   ├── superpowers/       # design specs and implementation plans
│   └── handoff/           # session handoffs: what was decided and why
├── directives/            # SOPs (see AGENT.md)
├── execution/             # deterministic scripts (see AGENT.md)
├── AGENT.md               # the 3-tier agent architecture this repo follows
├── CLAUDE.md              # working notes for contributors and coding agents
├── belt-criteria.md       # promotion criteria source (IBJJF + academy practice)
└── brand-guidelines.md    # colours and typography
```

## Status

The app runs against real data end to end: registry, promotions and
eligibility, courses, attendance with geofenced and QR check-in, invite
registration, dashboards, multi-gym administration and three languages. What is
missing before a gym relies on it is the pilot itself.

Roadmap, in order:

1. ~~Project setup and database schema~~
2. ~~Person registry and role management~~
3. ~~Attendance log and hour count~~
4. ~~Promotion criteria and eligibility~~
5. ~~Dashboards~~
6. ~~Multi-gym platform~~
7. Free pilot with a real gym
