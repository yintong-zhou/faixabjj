# Attendance, courses, hours and dashboard

`/courses` = recurring class definitions; `/attendance` = the calendar they generate, roll call, and member check-in.

## Tables (`20260912000000_class_schedule.sql`)

- **`course`** — recurring rule: `weekdays` (ISO `smallint[]`, 1 = Monday), one `start_time`/`end_time`, optional `starts_on`/`ends_on`, two check-in margins. Different times on different days = **two courses** (avoids a `course_slot` table).
  - **`instructor_id` is the default instructor — do not remove it again** (commit `2da3e44` did; reversed). `sync_course_sessions()` copies it to new sessions and **fills future sessions that have none** (`20260913000000_session_instructor_backfill.sql`). A non-null per-lesson instructor is a substitution and never overwritten. Consequence: null = "not set", so clearing one lesson's instructor is re-filled on the next course save.
  - Dropdown offers `instructor` and `head_coach`, **not** `admin`. A course pointing at someone who lost their technical role keeps them as an option, or the browser would silently reassign on save.
- **`class_session`** — the lesson. Times **copied** at generation, so editing a course never rewrites past lessons.
- **`attendance`** — keyed `unique (person_id, session_id)`. `class_date`, `led_by`, `duration_hours` are gone.

**One attendance = one hour.** `duration_hours` was *removed*, not defaulted (a default lets a crafted write store 2). Cost: a 4h seminar can't be one row. `person_hours` = `count(*) filter (where present)`; `member_overview` depends on it, so drop/recreate both in the same migration.

## Hours

- **Opening balance + recorded.** `frontend/utils/hours.ts` is the single definition: before `TRACKING_STARTED_ON`, `LESSONS_PER_WEEK` (3) per week since `joined_at` (pro rata for partial weeks); from that date on, counted. The estimate is **frozen** from go-live (unit-tested).
- **`TRACKING_STARTED_ON` must be the real go-live date** — without the cutoff every week double-counts. The code clamps at today, but that's a guard.
- One constant for everybody: it's a declared estimate, not a measurement.
- **Every estimated total must say so**: Registro "(stima)" + `title`; member detail splits *Ore totali / registrate / stimate* with the method; `/account` same caveat.
- After go-live, hours arrive **only** via member check-in or instructor roll call (RLS-enforced). **This module must never become a second way of adding an hour.**
- Gym-wide totals go through `hoursFor()` too.

## Permissions (`20260912010000_class_schedule_access.sql`)

`can_manage_classes()` = instructor + head_coach + admin → `canManageClasses`, guard `requireClassManager()`. Not `can_edit_registry()` (see access doc).

**`/attendance` is open to every signed-in member** (check-in lives where lessons are listed). Page calls `requireAdmin()` and branches: staff get roll-call link + presence count; members get a self check-in button.

## Calendar views

Server-rendered, state in the URL: `v=griglia` = month grid (default weekly list), `da` = anchor date, `g` = day opened under the grid.
- `da` is read as week or month — toggling keeps your place; no second param.
- Grid queries `monthGridRange()` (whole Mon–Sun weeks). Month helpers (`monthStart`, `shiftMonth`, `monthGridRange`, `formatMonthHeading`) in `utils/schedule.ts`, unit-tested incl. 31-January.
- **No check-in button in the grid** (explicit): shows a tick/"presente"; action stays in the list. Staff keep roll-call link in both.
- Cell link: staff + one lesson → straight to roll call; several lessons, or any member → opens the panel with a `#giorno` anchor. The whole cell is the link (no nested anchors).
- Grid can't shrink below ~34rem: it scrolls inside its container; **the page never scrolls sideways**.

## Roll call

- **Order: present first, then belt white→black, fewer stripes first, then name.** `beltRank()` (`utils/supabase/profile.ts`) is the single definition (belt chart uses it too); unknown belt sorts last. Computed on load so rows don't jump under the finger; settles after "Salva appello".
- **The lesson's instructor (`class_session.instructor_id`) starts ticked present**, tagged "istruttore". A default, changeable; nothing written until submit.
- **Snapshot, must not delete what it never saw:** hidden `loaded_at`; a member left "non registrato" whose `self` row was created after it is kept, and the confirmation says how many.
- **Provenance kept:** `saveRollCall` writes only changed rows, so a `self` row left present stays `self` (keeps the member's undo).
- Three-state control uses `--success`/`--danger` on icon + 10% tint; "non registrato" neutral grey; visible legend (no tooltips on phones).

## Check-in

- **A member checks in only through `check_in(session, lat, lng, accuracy)`** (`20260926000000`), `security definer`, returning jsonb `{result, distance_m}`: `closed` (no profile, window shut, other/suspended gym) → `already` → only if the gym has a position: `location_needed`, `imprecise` (accuracy missing or > 100 m), `too_far` (> 50 m, haversine `gym_distance_m`). Otherwise inserts own row, `present`, `'self'`. The direct-insert policy "members can check themselves in" is dropped by `20260926010000`. The coordinates are compared and discarded — never stored or logged. Undo is unchanged (own `self` row while the window is open).
- **The position is asked only when the gym has one** (`CheckinButton`, `app/attendance/checkin-button.tsx`: `enableHighAccuracy`, 10 s timeout, `maximumAge 0`). Browser position is spoofable: this stops the lazy check-in from home, not a determined cheat; roll call stays authoritative.
- **`/check-in`** is the fixed address printed on every gym's QR (the gym is the member's own): lists lessons open now (today and yesterday, for windows past midnight), checks in automatically when exactly one is open and nothing is recorded yet, never retries by itself after an answer. Staff see the roll-call notice.
- **An error is not a closed window.** `checkIn` shows `check_in`'s outcome via `checkinMessage()` (`utils/checkin.ts`; `already` counts as success); an RPC error or an unknown shape is logged with `logDbError()` and shown as the generic failure. `undoCheckIn`: a refusal deletes zero rows silently; an error is different. DB text never reaches the screen.

## Course lifecycle

- **Suspending stops it** (`20260918010000_suspended_course_checkin.sql`): `session_checkin_open()` requires `c.is_active`; `session_overview.course_active` lets the calendar drop a suspended course **from today on**, keeping past lessons. Authoritative, not destructive (reactivating restores). `/attendance/[id]` stays reachable for past lessons, with a notice. The view exposes the flag rather than filtering.
- **A course with attendance can only be suspended, never deleted** — `before delete` trigger `guard_course_delete` (service role bypasses RLS; cascades would take the hours).
- **Cancelling a lesson** = `status = 'cancelled'`: check-in closes, struck through, attendance survives.

## Not duplication

- **Weekday expansion** in TypeScript (`utils/schedule.ts`, `schedule.test.ts`); SQL `sync_course_sessions(course_id, dates[])` atomically drops superseded future sessions **without attendance** and inserts the rest. Past sessions untouched.
- **Timezone maths only in SQL**: `gym_timezone()` (`Europe/Rome`) applied once; `session_overview` exposes `checkin_opens_at`/`checkin_closes_at` as instants; `checkinState()` in TS only compares timestamps (naive comparison opens an hour early under DST).
- `session_overview` and `course_overview` have `security_invoker = on`; so `present_count` respects the caller's policy (a student counts only themselves) — shown to staff only.

## Dashboard

`/dashboard` = two pages behind one route, chosen by `canManageClasses`.
- `app/dashboard/staff-dashboard.tsx` — members (active, new in 30 days, without account, total gym hours), the month's lessons (scheduled, held, cancelled, attendances, average turnout, today's lessons → roll call), belt distribution (`Belt` + plain CSS bar, no chart lib), eligible-count card.
- `app/dashboard/member-dashboard.tsx` — own belt, hours, lessons in last 28 days, weekly average, next lessons. Nothing about anyone else. Bounded to **90 days** ("last time" = "—" beyond).
- **Staff can switch to their own view** (`v=mia`, segmented control); gym view is default. **Members see no control.** Portal-only admin gets no "mia" view.
- **The split is in which queries run**, not which cards render; RLS would refuse anyway.
- Staff counts exclude `PORTAL_ONLY_ROLES`.
