# Presenze — class schedule, attendance and student check-in

Status: approved design, not yet implemented.
Date: 2026-09-12

## Problem

`/presenze` is a `ComingSoon` placeholder. The gym needs three things from it:
staff must be able to describe the recurring classes they teach, someone must be
able to record who actually showed up, and students must be able to check
themselves in so that recording is not entirely the instructor's job. Every
recorded attendance counts as one hour toward the hour totals that promotion
eligibility is built on.

The existing `attendance` table was designed before any of this existed and
cannot express it: `unique (person_id, class_date)` allows one attendance per
person per day, so a member who trains twice in one evening loses an hour, and
`duration_hours` defaults to 1.5 rather than 1.

## Scope

In scope: a `/corsi` section where staff define recurring courses, generation of
concrete class sessions from those courses, a `/presenze` calendar that serves
both staff (roll call) and students (check-in), and the permission model that
separates the two.

Out of scope, deliberately: enrolling members in specific courses (any member
may check in to any class), waiting lists, capacity limits, recurring exceptions
beyond cancelling a single session, and any automatic promotion behaviour.

## Data model

Three new tables and one modified.

### `course` — the recurring rule

| Column | Notes |
|---|---|
| `id` | uuid pk |
| `name` | not null |
| `description` | nullable |
| `weekdays` | `smallint[]`, ISO weekday numbers (1 = Monday) |
| `start_time`, `end_time` | `time`, wall-clock |
| `starts_on` | `date`, default today — generation never runs before this |
| `ends_on` | `date`, nullable — a term that ends, e.g. a summer course |
| `instructor_id` | to `person`, `on delete set null` |
| `is_active` | boolean, default true |
| `checkin_opens_minutes_before` | int, default 60 |
| `checkin_closes_minutes_after` | int, default 30 |

One course carries a single time slot across several weekdays. A course that
runs at different times on different days is modelled as two courses. This
removes a `course_slot` join table at the cost of that one case, which the gym
does not currently have.

The check-in window lives on the course rather than in a global settings table:
it is the only per-course policy the design needs, and a one-row settings table
to hold two integers is more structure than the problem deserves.

### `class_session` — the concrete lesson

| Column | Notes |
|---|---|
| `id` | uuid pk |
| `course_id` | to `course` |
| `session_date` | `date` |
| `start_time`, `end_time` | copied from the course at generation, editable |
| `instructor_id` | to `person`, defaults from the course, overridable per session |
| `status` | `scheduled` or `cancelled` |
| `notes` | nullable |

`unique (course_id, session_date, start_time)` — this is what makes generation
idempotent.

Times are copied onto the session rather than read through the course, so
editing a course never silently rewrites lessons that already happened.

### `attendance` — modified

Added: `session_id` to `class_session`, not null, `on delete cascade`; and
`checked_in_by` (`self` or `staff`, default `staff`), which records who created
the row.

Removed: `class_date` (it lives on the session), `duration_hours`, and the
`unique (person_id, class_date)` constraint. Replaced by
`unique (person_id, session_id)`.

`present` stays. An explicit absence is a row with `present = false` worth zero
hours; a member with no row for a session is simply not recorded, which is a
different fact from "was absent".

`duration_hours` is dropped rather than defaulted to 1. With a default, a
crafted write can still store 2 and the "one attendance is one hour" rule
becomes a convention instead of a guarantee. The cost is that a four-hour
seminar cannot be recorded as a single row; it would be four sessions, or a
future column added deliberately.

`person_hours` is redefined as `count(*) filter (where present)` and keeps
`security_invoker = on`. Views run with their owner's privileges unless told
otherwise, so omitting that option would let any student read the whole gym.

### Migration of existing rows

Existing `attendance` rows have no session. The migration creates a course named
"Lezioni storiche" (inactive, no weekdays) and one session per distinct
`(class_date, led_by)`, then points the old rows at them. If the table is empty
— likely, since no attendance UI has ever shipped — it does nothing.

## Permissions

A new predicate joins the three existing ones:

```sql
can_manage_classes()  -- instructor, head_coach, admin
```

`can_edit_registry()` is not reused. That predicate means "may change a person's
belt and record", which an instructor must not do. Two different privileges need
two functions. `current_access()` returns a fourth flag, `canManageClasses`.

| Role | `course` / `class_session` | `attendance` |
|---|---|---|
| student, assistant | read | check in for self, inside the window |
| instructor | full write | full write |
| head_coach, admin | full write | full write |

Student check-in is an `insert` policy requiring all four of: the row is theirs
(`person_id = current_person_id()`), `present = true`, `checked_in_by = 'self'`,
and `session_checkin_open(session_id)`. A student may delete their own `self`
row while the window is open, and nothing else: they cannot mark another member,
cannot mark anyone absent, and cannot alter a row created by staff.

`session_checkin_open()` also returns false for a cancelled session.

### Consequence: `/presenze` opens to students

`/presenze` is staff-only today — a student gets a 404, like on `/registro`.
Check-in has nowhere else to live, so:

- `/presenze` moves from `requireRegistryViewer()` to `requireAdmin()`, and
  renders by role: roll call for staff, lesson list with a check-in button for
  students.
- **Presenze** appears in the nav for students and assistants.
- `/registro` stays staff-only. `/corsi` is staff-only.

This is the first section a student can reach that was previously reserved.

## Interface

### `/corsi` — staff only

Same shape as `/registro`, so nothing new has to be learned: a `<details>`
panel "Aggiungi corso" on top, the list below, a kebab menu per row.

Form fields: name, description, weekdays (checkboxes), start and end time,
instructor (select over members holding a technical role), check-in window (the
two integers, pre-filled 60 / 30), active.

Kebab: Modifica, Estendi calendario, Sospendi/Riattiva, Elimina.

### `/presenze` — everyone

A chronological list grouped by day, with week navigation in the URL
(`?da=2026-09-14`). Like the registry filters, this makes the view shareable,
reload-proof and free of client JS.

Staff see a presence count per row and open a row to take the roll call.
Students see the same list with a check-in control: a button while the window is
open, a "Presente" state once done (revocable until the window closes), and a
disabled state otherwise.

### `/presenze/[id]` — roll call, staff only

One form with a tri-state control per member and a single save. With thirty
members, one request per tap is worse than one button.

The three states are "not recorded" (no row), present, and absent. A badge marks
members who checked themselves in, so the instructor can see what they did not
enter themselves. The header carries the session's instructor (editable) and a
"Annulla lezione" action.

### Navigation

**Corsi** is added. Staff reach five items — Dashboard, Presenze, Corsi,
Registro, Account — which is the practical limit for a mobile tab bar before
labels have to be truncated. Students see three.

## Generation and lifecycle

`generate_sessions(course_id, until)` expands the course's weekdays from
`greatest(starts_on, current_date)` to `least(until, coalesce(ends_on, until))`
and inserts with `on conflict do nothing`, so it is idempotent. Starting at
`current_date` rather than `starts_on` is what keeps it from back-filling
lessons that never happened when an old course is edited. It is called on course creation, on course edit, and by the
"Estendi calendario" button. Default horizon: 8 weeks.

Editing a course must not rewrite history:

| Session | Behaviour |
|---|---|
| past | never touched |
| future, no attendance | deleted and regenerated at the new time |
| future, with attendance | left as it is — someone already checked in |

**Cancelling a session** sets `status = 'cancelled'`. Check-in closes, the row
stays struck through in the list, and attendance already recorded survives. With
attendance present, the action confirms first.

**Deleting a course** is allowed only when no attendance was ever recorded
against any of its sessions; otherwise the only option is Sospendi. This mirrors
"revoca accesso" in the registry: the gym's records are not erased to tidy up a
menu. The rule is enforced by a `before delete` trigger, not only in the server
action, because the service-role key bypasses RLS.

## Time zone

`session_date` + `start_time` are wall-clock; `now()` is `timestamptz`.
Comparing them directly opens check-in an hour early under DST. The window is
computed as `(session_date + start_time) at time zone 'Europe/Rome'`, with the
zone written once in a SQL constant. This is the same class of bug `daysSince()`
already guards against on the date side of the registry.

## Errors

Server actions follow the existing pattern: redirect back with `?ok=` or
`?error=`, rendered by the banner components that already carry a check or alert
icon. Failures that matter and their messages:

- check-in outside the window (the UI should not offer it, but a crafted POST
  can try): "Il check-in per questa lezione non è aperto."
- check-in on a cancelled session: "Questa lezione è stata annullata."
- deleting a course with attendance: "Il corso ha presenze registrate: puoi solo
  sospenderlo."
- a member with no `person` row attempting check-in: falls back to
  `getOrCreateProfile()`, as `/account` does.

## Testing

Vitest is added to `frontend/` for pure functions only — no end-to-end tests.
Two things are tested before they are written:

1. **Weekday expansion**: weeks spanning a month boundary, a DST transition, an
   empty `weekdays` array, a course whose end date precedes its start.
2. **Check-in window**: open, not yet open, expired, cancelled session, and a
   session whose window crosses midnight.

Both are the kind of error that stays invisible until a student cannot check in
on a Thursday evening.

## Open questions

None blocking. Enrollment per course, capacity limits and multi-slot courses are
deliberately deferred and none of them require a schema change that this design
prevents.
