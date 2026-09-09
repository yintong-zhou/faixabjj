# FAIXABJJ - BJJ Progress Tracker

A lightweight web app for tracking class hours, stripes, and belt promotions in a Brazilian Jiu-Jitsu school, with a unified registry for students and instructors.

> Status: in design / MVP not yet developed. Full reference document: [`bjj-progress-tracker-project.md`](./bjj-progress-tracker-project.md).

## What it is

Not a full gym management system: no payments, no online enrollment. It's meant to **sit alongside** the gym's existing management software, covering the part that most generic management tools handle poorly — tracking students' technical progression toward stripes and belts — with a simple data model designed to add minimal workload for instructors.

## Why

Generic gym management software treats belt rank as a text field. Instructors end up deciding promotions "by feel" or on a spreadsheet/notebook. This project exists to provide an objective baseline (accumulated hours, time at rank) without adding per-student bureaucracy.

## Key features

- **Unified registry (member management)**: a single "Person" profile for both students and instructors — because in BJJ the same person can be a student and, as their belt rank grows, also an assistant or instructor, often at the same time.
- **Role management with history**: manual assignment of roles (student / assistant / instructor / head coach), with suggested belt thresholds that are never automatic.
- **Attendance log**: present/absent per date, noting who led the session.
- **Automatic hour count** for each person.
- **Configurable promotion criteria**: hour thresholds and minimum time at rank.
- **Eligibility alerts**: flags who's ready for their next stripe or grading — the decision always stays with the instructor.
- **Dashboards**: individual view, instructor view (own students), and gym-wide view (aggregate stats).

## What it deliberately doesn't do

- Payments, subscriptions, billing
- Online enrollment / lead management
- Competition/tournament management
- Curriculum/technique tracking by positional category (deferred to a possible future phase)

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite + Tailwind |
| Backend / Database | Supabase (Postgres + Auth) |
| Permissions | Row Level Security on Supabase, based on the person's active role |
| Hosting | Vercel |

## Data model (summary)

- `Person` — single registry for students and instructors
- `AssignedRole` — role history per person, with start/end dates
- `RoleThreshold` — configuration of suggested belt thresholds per role
- `Attendance` — present/absent per person/date, with a reference to who led the session
- `PromotionCriteria` — configurable hour and time-at-rank thresholds per belt/stripe

Full schema details in [`bjj-progress-tracker-project.md`](./bjj-progress-tracker-project.md).

## Roadmap

1. Project setup and database schema
2. Person registry + role management
3. Attendance log + hour count
4. Promotion criteria + eligibility alerts
5. Dashboards (person, instructor, gym)
6. Free pilot with a real gym

## Local setup

*To be completed once development starts.* Indicatively:

```bash
git clone <repo-url>
cd bjj-progress-tracker
npm install
cp .env.example .env   # configure Supabase keys
npm run dev
```

## Documentation

- [`bjj-progress-tracker-project.md`](./bjj-progress-tracker-project.md) — full project document: detailed feature set, data model, architecture, resources, validation metrics, and risks

## License

*To be defined.*
