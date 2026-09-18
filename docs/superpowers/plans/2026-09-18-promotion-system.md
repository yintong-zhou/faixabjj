# Promotion System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give FAIXABJJ configurable promotion criteria, an eligibility queue for staff, and a recorded promotion with history — the system suggests and records, it never promotes by itself.

**Architecture:** `promotion_criteria` holds the numbers; a new view `person_rank_hours` counts attendance since the current belt and since the last stripe; a pure, unit-tested `frontend/utils/promotion.ts` decides eligibility; a Postgres function `record_promotion()` writes the person row and the history row in one transaction. Nothing a student can open ever states how far they are from the next grade.

**Tech Stack:** Next.js App Router (Server Components + server actions), Supabase Postgres with RLS, Tailwind v4, Vitest for the pure utilities.

**Spec:** `docs/superpowers/specs/2026-09-18-promotion-system-design.md` — read it before Task 1; it carries the reasoning this plan only applies.

## Global Constraints

- **Migrations are applied by hand**, pasted into the SQL Editor of Supabase project **`poksgledkecwviypspmi`**. Never apply them through whatever project an MCP happens to show. Each migration task ends by telling the user to apply it and by running the verification query.
- **Every view carries `security_invoker = on`.** Without it a view bypasses the RLS of the tables it reads.
- **No user-facing string is hardcoded.** Every visible word comes from `frontend/utils/i18n/dictionaries/{it,en,pt-BR}.ts`; `it.ts` defines the `Dictionary` type and the other two are typed as it, so a missing key is a compile error.
- **Dates read dd/mm/yyyy** through `formatDate()`; only an `<input type="date">` value stays ISO. All date arithmetic normalises to UTC midnight.
- **Staff-only pages answer 404, not 403** (`notFound()`), through the guards in `frontend/utils/supabase/require-admin.ts`. Never re-implement a privilege check inline.
- **A student is never shown how much is missing, nor whether they are eligible.** No progress bar, no countdown, no verdict, no name of the next grade — in any screen, and not through the API either (Task 1 restricts the criteria to registry viewers).
- **One attendance is one hour in this app**; the criteria are in clock hours. `SESSION_LENGTH_HOURS = 1.5` is the only place the two meet.
- Run commands from `frontend/`. Tests: `npm test`. Types: `npx tsc --noEmit`. Lint: `npm run lint`.
- Commit subjects follow the repo's Conventional Commits in English; bodies may be Italian.

---

### Task 1: Migration — promotion criteria

**Files:**
- Create: `supabase/migrations/20260918100000_promotion_criteria.sql`

**Interfaces:**
- Consumes: the existing `promotion_criteria` table from `20260910000000_init_schema.sql` and `can_view_registry()` from `20260911120000_role_based_access.sql`.
- Produces: column `promotion_criteria.min_age_years smallint null`; 20 seeded rows — `(blue|purple|brown|black, 0)` and `(white|blue|purple|brown, 1..4)`; the select policy narrowed to `can_view_registry()`.

- [ ] **Step 1: Write the migration**

```sql
-- FAIXABJJ — promotion criteria: the numbers behind the eligibility alerts
--
-- Source: belt-criteria.md, at three sessions a week — the same frequency the
-- app already assumes in frontend/utils/hours.ts (LESSONS_PER_WEEK). Where the
-- document gives an IBJJF minimum it is used; where it gives only a practical
-- range, the lower bound is used, because this table answers "from when may an
-- instructor consider it", not "when should it happen".
--
-- A row means: WHAT IS REQUIRED TO REACH THIS GRADE.
--   (blue, 0)    = what it takes to be given the blue belt
--   (blue, 1..4) = what it takes to be given the n-th stripe on blue
--
-- The time column is anchored differently in the two cases, and this is the
-- one thing to get right when reading it:
--   stripe = 0 → measured from person.rank_since   (the belt date)
--   stripe > 0 → measured from person.stripe_since (the last stripe date)
--
-- There is deliberately no (black, 1..4): the black belt has no stripes but
-- degrees, which are out of scope. No row means no modelled next step, which
-- is exactly what should be shown for someone already at black.
--
-- min_hours is in CLOCK HOURS, like the document. The app counts attendance
-- and calls each row an "hour"; frontend/utils/hours.ts converts with
-- SESSION_LENGTH_HOURS = 1.5. Do not "fix" these numbers into attendance
-- counts — the conversion has a single home, and it is not this table.

alter table public.promotion_criteria
  add column if not exists min_age_years smallint
  check (min_age_years is null or min_age_years between 0 and 99);

comment on column public.promotion_criteria.min_age_years is
  'Minimum age in whole years, null when the grade has none. Only brown->black has one (IBJJF: 19).';

comment on column public.promotion_criteria.min_hours is
  'Clock hours required at the current grade. Converted from attendance counts by SESSION_LENGTH_HOURS in the app, never stored as attendance counts.';

comment on column public.promotion_criteria.min_time_at_rank_days is
  'Days at the current grade. Measured from person.rank_since when stripe = 0, from person.stripe_since otherwise.';

-- ---------------------------------------------------------------------------
-- Belt transitions — from belt-criteria.md "transitions" and "hours_by_transition"
-- ---------------------------------------------------------------------------
-- `on conflict do nothing` on purpose: re-running this migration must never
-- overwrite numbers the gym has since tuned from the app.
insert into public.promotion_criteria
  (belt, stripe, min_hours, min_time_at_rank_days, min_age_years, notes)
values
  ('blue',   0, 108, 183, null, 'white_to_blue: practical minimum 0.5 years, 108 h at 3x/week'),
  ('purple', 0, 432, 730, null, 'blue_to_purple: IBJJF minimum 2 years, 432 h at 3x/week'),
  ('brown',  0, 324, 548, null, 'purple_to_brown: IBJJF minimum 1.5 years, 324 h at 3x/week'),
  ('black',  0, 216, 365,   19, 'brown_to_black: IBJJF minimum 1 year and 19 years of age, 216 h at 3x/week')
on conflict (belt, stripe) do nothing;

-- ---------------------------------------------------------------------------
-- Stripes — NOT from the document
-- ---------------------------------------------------------------------------
-- belt-criteria.md gives only an interval ("stripe_interval_months: [2, 4],
-- shorter at white/blue, longer at higher belts") and no hours at all. The
-- numbers below are therefore an informed guess, not a source: 2 months on
-- white and blue, 3 on purple, 4 on brown, with the hours those intervals
-- imply at three 1.5 h lessons a week. They are seeded so the feature works on
-- day one; the criteria page exists so the gym can correct them.
insert into public.promotion_criteria
  (belt, stripe, min_hours, min_time_at_rank_days, notes)
select
  b.belt,
  s.stripe::smallint,
  b.hours,
  b.days,
  'stripe interval: not in belt-criteria.md, seeded as an estimate and meant to be tuned'
from (values
  ('white'::belt_rank,  40,  61),
  ('blue'::belt_rank,   40,  61),
  ('purple'::belt_rank, 60,  91),
  ('brown'::belt_rank,  80, 122)
) as b(belt, hours, days)
cross join generate_series(1, 4) as s(stripe)
on conflict (belt, stripe) do nothing;

-- ---------------------------------------------------------------------------
-- Reading the criteria is staff business
-- ---------------------------------------------------------------------------
-- Until now this table was readable by every authenticated user, which was
-- harmless while it was empty. Filled, it is exactly the table that tells a
-- student how far they are from the next grade — the one thing the app has
-- decided not to show them. Hiding it in the UI would leave two API calls
-- between a student and the number, so the rule is enforced here instead.
drop policy if exists "authenticated can select promotion_criteria" on public.promotion_criteria;
create policy "registry viewers can select promotion_criteria" on public.promotion_criteria
  for select to authenticated
  using (public.can_view_registry());
```

- [ ] **Step 2: Apply it by hand**

Tell the user: open the SQL Editor of project `poksgledkecwviypspmi`, paste the file, run it. Do not use an MCP for this.

- [ ] **Step 3: Verify in the SQL Editor**

```sql
select belt, stripe, min_hours, min_time_at_rank_days, min_age_years
from public.promotion_criteria
order by belt, stripe;
```
Expected: 20 rows. `(black, 0)` has `min_age_years = 19`; every other row has null. No `(black, 1)`–`(black, 4)`. No `(white, 0)`.

```sql
select polname from pg_policy
where polrelid = 'public.promotion_criteria'::regclass and polcmd = 'r';
```
Expected: exactly `registry viewers can select promotion_criteria`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260918100000_promotion_criteria.sql
git commit -m "feat(promotions): seed promotion criteria and restrict them to staff"
```

---

### Task 2: Migration — hours at the current grade

**Files:**
- Create: `supabase/migrations/20260918110000_person_rank_hours.sql`

**Interfaces:**
- Consumes: `person.rank_since`, `person.stripe_since`, `attendance.present`, `attendance.session_id`, `class_session.session_date`.
- Produces: view `public.person_rank_hours(person_id uuid, lessons_since_rank bigint, lessons_since_stripe bigint)`.

- [ ] **Step 1: Write the migration**

```sql
-- FAIXABJJ — attendance counted from the current grade, not from day one
--
-- The criteria measure the hours trained *inside* a transition (432 h during
-- the blue belt), not a lifetime total. Comparing a lifetime total would look
-- simpler and would get two ordinary cases wrong: somebody who arrives already
-- graded from another academy would start from zero here, and somebody who has
-- not trained for a year would stay just as close to the threshold as the day
-- they stopped, because a total never falls.
--
-- The columns count ATTENDANCE ROWS, not hours, and are named so. One
-- attendance is one hour in this app; the criteria are in clock hours; the
-- single place the two meet is SESSION_LENGTH_HOURS in frontend/utils/hours.ts.
--
-- The hours a member trained before the gym switched tracking on are not here
-- and must not be: that opening balance is estimated, it lives in
-- estimatedHours() in TypeScript, and duplicating the formula in SQL is exactly
-- the drift this project has avoided everywhere else. The caller adds it,
-- passing max(joined_at, the anchor date).
--
-- security_invoker = on, like every view in this project: without it the view
-- would run with its owner's privileges and hand a student everybody's
-- attendance. With it, a student querying this view sees only their own row,
-- because the `attendance` policies say so.
create or replace view public.person_rank_hours
with (security_invoker = on)
as
select
  p.id as person_id,
  count(*) filter (
    where a.present and s.session_date >= p.rank_since
  ) as lessons_since_rank,
  count(*) filter (
    where a.present and s.session_date >= p.stripe_since
  ) as lessons_since_stripe
from public.person p
left join public.attendance a on a.person_id = p.id
left join public.class_session s on s.id = a.session_id
group by p.id;

grant select on public.person_rank_hours to authenticated;
```

- [ ] **Step 2: Apply it by hand**

Same instruction as Task 1: SQL Editor of `poksgledkecwviypspmi`.

- [ ] **Step 3: Verify in the SQL Editor**

```sql
select p.full_name, p.rank_since, r.lessons_since_rank, r.lessons_since_stripe
from public.person_rank_hours r
join public.person p on p.id = r.person_id
order by r.lessons_since_rank desc
limit 10;
```
Expected: one row per person, never null (a member with no attendance reads 0), and `lessons_since_stripe >= lessons_since_rank` is false in general — `stripe_since` is usually later than `rank_since`, so the stripe count is the smaller one.

```sql
select reloptions from pg_class where relname = 'person_rank_hours';
```
Expected: contains `security_invoker=on`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260918110000_person_rank_hours.sql
git commit -m "feat(promotions): count attendance since the current belt and stripe"
```

---

### Task 3: Migration — promotion history table

**Files:**
- Create: `supabase/migrations/20260918120000_promotion_history.sql`

**Interfaces:**
- Consumes: `can_view_registry()`, `can_edit_registry()`, `current_person_id()`.
- Produces: table `public.promotion(id, person_id, from_belt, from_stripes, to_belt, to_stripes, promoted_on, promoted_by, notes, created_at)` with RLS.

- [ ] **Step 1: Write the migration**

```sql
-- FAIXABJJ — promotion history
--
-- What was decided, when, by whom, and from what to what. This is the record a
-- promotion has to leave behind: six months later nobody remembers whether a
-- purple belt was given in March or in June, and "how long at this belt" is the
-- figure the next promotion hangs on.
create table if not exists public.promotion (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.person (id) on delete cascade,
  from_belt belt_rank not null,
  from_stripes smallint not null check (from_stripes between 0 and 4),
  to_belt belt_rank not null,
  to_stripes smallint not null check (to_stripes between 0 and 4),
  promoted_on date not null default current_date,
  -- The gym's record outlives the account of whoever signed it, exactly as a
  -- member's attendance outlives their login. Same reasoning as "revoca accesso".
  promoted_by uuid references public.person (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists promotion_person_id_idx
  on public.promotion (person_id, promoted_on desc);

alter table public.promotion enable row level security;

-- A member reads their own history: it is a record about them, and the member
-- detail page shows it back to them nowhere else.
drop policy if exists "staff or self can select promotion" on public.promotion;
create policy "staff or self can select promotion" on public.promotion
  for select to authenticated
  using (public.can_view_registry() or person_id = public.current_person_id());

-- Writing is registry-editor business: an instructor runs the classes and must
-- never change anybody's belt. Same split as can_manage_classes vs
-- can_edit_registry everywhere else.
drop policy if exists "editors can insert promotion" on public.promotion;
create policy "editors can insert promotion" on public.promotion
  for insert to authenticated
  with check (public.can_edit_registry());

-- Delete but no update: a promotion entered by mistake is removed and redone.
-- Rewriting one in place would erase the only trace of what was decided, which
-- is the single thing this table exists to keep.
drop policy if exists "editors can delete promotion" on public.promotion;
create policy "editors can delete promotion" on public.promotion
  for delete to authenticated
  using (public.can_edit_registry());

grant select, insert, delete on public.promotion to authenticated;
```

- [ ] **Step 2: Apply it by hand**

SQL Editor of `poksgledkecwviypspmi`.

- [ ] **Step 3: Verify in the SQL Editor**

```sql
select polname, polcmd from pg_policy
where polrelid = 'public.promotion'::regclass order by polcmd;
```
Expected: three policies — select, insert, delete. **No update policy.**

```sql
select relrowsecurity from pg_class where relname = 'promotion';
```
Expected: `true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260918120000_promotion_history.sql
git commit -m "feat(promotions): add the promotion history table"
```

---

### Task 4: Migration — `record_promotion()`

**Files:**
- Create: `supabase/migrations/20260918130000_record_promotion.sql`

**Interfaces:**
- Consumes: `public.promotion` (Task 3), `can_edit_registry()`, `current_person_id()`, the `guard_person_auth_link` trigger on `person`.
- Produces: `public.record_promotion(p_person_id uuid, p_to_belt belt_rank, p_to_stripes smallint, p_promoted_on date, p_notes text) returns uuid`, executable by `authenticated`.

- [ ] **Step 1: Write the migration**

```sql
-- FAIXABJJ — recording a promotion
--
-- Updating `person` and inserting the history row must happen together or not
-- at all, and from the client they would be two separate writes. This is the
-- case where the project already puts the logic in SQL (sync_course_sessions).
--
-- SECURITY INVOKER — the default, and it matters. A definer function would
-- bypass the policies and the guard trigger that freeze belt columns, which are
-- the whole reason promotion is not self-service. The privilege is re-checked
-- at the top instead, so the failure is a clear message rather than a policy
-- violation halfway through.
create or replace function public.record_promotion(
  p_person_id uuid,
  p_to_belt belt_rank,
  p_to_stripes smallint,
  p_promoted_on date default current_date,
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_person public.person%rowtype;
  v_order text[] := array['white', 'blue', 'purple', 'brown', 'black'];
  v_from int;
  v_to int;
  v_id uuid;
begin
  if not public.can_edit_registry() then
    raise exception 'only a registry editor can record a promotion'
      using errcode = '42501';
  end if;

  select * into v_person from public.person where id = p_person_id;
  if not found then
    raise exception 'person not found' using errcode = 'P0002';
  end if;

  -- Backdating is legitimate (the belt was given on the mat last Saturday);
  -- forward-dating is not, and it would hand somebody free time at rank.
  if p_promoted_on > current_date then
    raise exception 'a promotion cannot be dated in the future'
      using errcode = '22007';
  end if;

  if p_to_stripes < 0 or p_to_stripes > 4 then
    raise exception 'stripes must be between 0 and 4' using errcode = '23514';
  end if;

  -- The black belt has degrees, not stripes.
  if p_to_belt = 'black' and p_to_stripes <> 0 then
    raise exception 'the black belt has no stripes' using errcode = '23514';
  end if;

  v_from := array_position(v_order, v_person.current_belt::text);
  v_to := array_position(v_order, p_to_belt::text);

  -- Forward only. Correcting a wrong grade is a different act from promoting,
  -- and it is deliberately not offered here.
  if v_to < v_from or (v_to = v_from and p_to_stripes <= v_person.current_stripes) then
    raise exception 'a promotion must move forward' using errcode = '23514';
  end if;

  insert into public.promotion (
    person_id, from_belt, from_stripes, to_belt, to_stripes,
    promoted_on, promoted_by, notes
  )
  values (
    p_person_id, v_person.current_belt, v_person.current_stripes,
    p_to_belt, p_to_stripes, p_promoted_on, public.current_person_id(), p_notes
  )
  returning id into v_id;

  if v_to > v_from then
    -- A new belt resets the stripe clock too: the stripes on it start over.
    update public.person
       set current_belt = p_to_belt,
           current_stripes = p_to_stripes,
           rank_since = p_promoted_on,
           stripe_since = p_promoted_on
     where id = p_person_id;
  else
    -- A stripe leaves the belt date alone — "how long at this belt" is what the
    -- next belt hangs on, and a stripe must not reset it.
    update public.person
       set current_stripes = p_to_stripes,
           stripe_since = p_promoted_on
     where id = p_person_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.record_promotion(uuid, belt_rank, smallint, date, text)
  to authenticated;
```

- [ ] **Step 2: Apply it by hand**

SQL Editor of `poksgledkecwviypspmi`.

- [ ] **Step 3: Verify in the SQL Editor**

Pick a test person id first (`select id, full_name, current_belt, current_stripes from public.person limit 5;`), then, signed in as a head coach through the app's SQL Editor session is not possible — so verify the shape only:

```sql
select prosecdef, pronargs from pg_proc where proname = 'record_promotion';
```
Expected: `prosecdef = false` (invoker, **not** definer) and `pronargs = 5`.

The behaviour is verified end-to-end in Task 12, from the app, signed in as a head coach.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260918130000_record_promotion.sql
git commit -m "feat(promotions): add record_promotion() as one atomic write"
```

---

### Task 5: Date helpers — a testable `today` and whole-year age

**Files:**
- Modify: `frontend/utils/dates.ts`
- Test: `frontend/utils/dates.test.ts`

**Interfaces:**
- Produces: `daysSince(isoDate: string | null, today?: string): number | null` (the second parameter is new and optional, so every existing call keeps working) and `ageOn(birthDate: string | null, onDate: string): number | null`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/utils/dates.test.ts`:

```ts
describe("daysSince with an explicit today", () => {
  it("counts whole days between two dates", () => {
    expect(daysSince("2026-09-01", "2026-09-15")).toBe(14);
  });

  it("clamps a future date to zero rather than going negative", () => {
    expect(daysSince("2026-10-01", "2026-09-15")).toBe(0);
  });

  it("is null without a date", () => {
    expect(daysSince(null, "2026-09-15")).toBeNull();
  });
});

describe("ageOn", () => {
  it("counts whole years", () => {
    expect(ageOn("2000-09-15", "2026-09-15")).toBe(26);
  });

  it("does not count a birthday that has not arrived yet", () => {
    expect(ageOn("2000-09-16", "2026-09-15")).toBe(25);
  });

  it("is null without a birth date", () => {
    expect(ageOn(null, "2026-09-15")).toBeNull();
  });
});
```

Add `ageOn` to the existing import at the top of the file: `import { ageOn, daysSince, formatDate, formatDays } from "./dates";` (keep whatever is already imported there and add the missing names).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run utils/dates.test.ts`
Expected: FAIL — `ageOn is not a function`, and the two-argument `daysSince` ignores its second argument.

- [ ] **Step 3: Implement**

In `frontend/utils/dates.ts`, replace the body of `daysSince` and add `ageOn` after it:

```ts
// Whole days between a `date` column (always "YYYY-MM-DD") and today.
//
// Both ends are normalised to UTC midnight on purpose: comparing a UTC-parsed
// date against a local-time "now" would drift by a day depending on the
// viewer's timezone and the hour of the request.
//
// `today` is optional and exists so callers that must be deterministic — the
// promotion maths and its tests — can pin it. Omitted, it means now.
export function daysSince(isoDate: string | null, today?: string): number | null {
  if (!isoDate) {
    return null;
  }

  const then = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(then)) {
    return null;
  }

  let now: number;
  if (today) {
    now = Date.parse(`${today}T00:00:00Z`);
    if (Number.isNaN(now)) {
      return null;
    }
  } else {
    const current = new Date();
    now = Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate(),
    );
  }

  // A future date (a join date typed ahead of time) reads as 0, not negative.
  return Math.max(0, Math.round((now - then) / 86_400_000));
}

// Whole years old on a given day. Used only where a promotion criterion states
// a minimum age — today that is brown to black, which IBJJF puts at 19.
//
// Compared field by field rather than by subtracting milliseconds: a year is
// not a fixed number of days, and "has the birthday happened yet" is exactly
// the question.
export function ageOn(
  birthDate: string | null,
  onDate: string,
): number | null {
  if (!birthDate) {
    return null;
  }

  const born = birthDate.split("-").map(Number);
  const on = onDate.split("-").map(Number);
  if (born.length !== 3 || on.length !== 3) {
    return null;
  }
  if (born.some(Number.isNaN) || on.some(Number.isNaN)) {
    return null;
  }

  const [by, bm, bd] = born;
  const [oy, om, od] = on;
  const beforeBirthday = om < bm || (om === bm && od < bd);
  return oy - by - (beforeBirthday ? 1 : 0);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS, including every pre-existing test — `daysSince` gained an optional parameter and no call site changed.

- [ ] **Step 5: Commit**

```bash
git add frontend/utils/dates.ts frontend/utils/dates.test.ts
git commit -m "feat(dates): add ageOn and a pinnable today for daysSince"
```

---

### Task 6: The lesson-length constant

**Files:**
- Modify: `frontend/utils/hours.ts`
- Test: `frontend/utils/hours.test.ts`

**Interfaces:**
- Produces: `SESSION_LENGTH_HOURS = 1.5` and `clockHours(lessons: number): number`.

- [ ] **Step 1: Write the failing test**

Append to `frontend/utils/hours.test.ts` (and add `clockHours` and `SESSION_LENGTH_HOURS` to the existing import from `./hours`):

```ts
describe("clockHours", () => {
  // The promotion criteria are stated in clock hours; the app counts
  // attendance and calls each row an hour. This is the only conversion.
  it("turns counted lessons into the clock hours the criteria use", () => {
    expect(clockHours(100)).toBe(150);
    expect(SESSION_LENGTH_HOURS).toBe(1.5);
  });

  it("keeps one decimal, like every other hour figure in the app", () => {
    expect(clockHours(4.3)).toBe(6.5);
  });

  it("is zero for zero", () => {
    expect(clockHours(0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run utils/hours.test.ts`
Expected: FAIL — `clockHours is not a function`.

- [ ] **Step 3: Implement**

Append to `frontend/utils/hours.ts`:

```ts
/**
 * How long one lesson lasts on the mat.
 *
 * This app counts attendance and calls each row an hour (HOURS_PER_LESSON), a
 * rule the database enforces by having no duration column at all. The
 * promotion criteria in belt-criteria.md are stated in real clock hours,
 * assuming a 1.5 h lesson. This constant is the only place the two units meet:
 * change it if the gym's lesson length changes, and nothing else moves.
 */
export const SESSION_LENGTH_HOURS = 1.5;

/**
 * Counted (or estimated) lessons expressed in the clock hours the promotion
 * criteria use. Rounded to one decimal, like every other hour figure shown.
 */
export function clockHours(lessons: number): number {
  return Math.round(lessons * SESSION_LENGTH_HOURS * 10) / 10;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/utils/hours.ts frontend/utils/hours.test.ts
git commit -m "feat(hours): add the lesson-length conversion for promotion criteria"
```

---

### Task 7: The ladder — `nextStep()`

**Files:**
- Create: `frontend/utils/promotion.ts`
- Test: `frontend/utils/promotion.test.ts`

**Interfaces:**
- Produces: `BELT_ORDER`, `type Belt`, `MAX_STRIPES`, `type Step = { belt: Belt; stripe: number }`, `nextStep(belt: string, stripes: number): Step | null`.

- [ ] **Step 1: Write the failing test**

Create `frontend/utils/promotion.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { nextStep } from "./promotion";

describe("nextStep", () => {
  it("proposes the next stripe while there is room for one", () => {
    expect(nextStep("blue", 0)).toEqual({ belt: "blue", stripe: 1 });
    expect(nextStep("blue", 3)).toEqual({ belt: "blue", stripe: 4 });
  });

  it("proposes the next belt once the fourth stripe is there", () => {
    expect(nextStep("blue", 4)).toEqual({ belt: "purple", stripe: 0 });
    expect(nextStep("brown", 4)).toEqual({ belt: "black", stripe: 0 });
  });

  // The black belt has degrees, not stripes, and they are out of scope.
  it("proposes nothing at black", () => {
    expect(nextStep("black", 0)).toBeNull();
    expect(nextStep("black", 4)).toBeNull();
  });

  it("proposes nothing for a belt it does not know", () => {
    expect(nextStep("coral", 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run utils/promotion.test.ts`
Expected: FAIL — cannot resolve `./promotion`.

- [ ] **Step 3: Implement**

Create `frontend/utils/promotion.ts`:

```ts
// Promotion eligibility: what the next grade is, and what is still missing.
//
// Pure on purpose, like schedule.ts and hours.ts. It reads no cookie and makes
// no query: the caller passes the person, the criteria rows and — in tests —
// a fixed "today". The database holds the numbers; this module holds the rule.
//
// It never decides a promotion. Reaching the minimums is necessary and never
// sufficient: belt-criteria.md puts the instructor's discretion above the
// arithmetic, and the app says so wherever a result is shown.

export const BELT_ORDER = ["white", "blue", "purple", "brown", "black"] as const;

export type Belt = (typeof BELT_ORDER)[number];

/** Four stripes to a belt. The black belt is the exception: it has degrees. */
export const MAX_STRIPES = 4;

export type Step = { belt: Belt; stripe: number };

function isBelt(value: string): value is Belt {
  return (BELT_ORDER as readonly string[]).includes(value);
}

/**
 * The next grade on the ladder: the following stripe while the belt has room
 * for one, the following belt once the fourth stripe is there, nothing at
 * black.
 *
 * Requiring four stripes before a belt is common academy practice rather than
 * a rule in belt-criteria.md, and it binds only the *suggestion*: the promotion
 * panel still lets an instructor pick any forward grade directly.
 */
export function nextStep(belt: string, stripes: number): Step | null {
  if (!isBelt(belt)) return null;
  if (belt === "black") return null;

  if (stripes < MAX_STRIPES) {
    return { belt, stripe: stripes + 1 };
  }

  const next = BELT_ORDER[BELT_ORDER.indexOf(belt) + 1];
  return next ? { belt: next, stripe: 0 } : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run utils/promotion.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/utils/promotion.ts frontend/utils/promotion.test.ts
git commit -m "feat(promotions): add the grade ladder"
```

---

### Task 8: Eligibility — `promotionStatus()`

**Files:**
- Modify: `frontend/utils/promotion.ts`
- Test: `frontend/utils/promotion.test.ts`

**Interfaces:**
- Consumes: `nextStep()` (Task 7), `clockHours`/`estimatedHours` (Task 6 and `hours.ts`), `daysSince`/`ageOn` (Task 5).
- Produces: `type Criterion`, `type Blocker`, `type PromotionInput`, `type PromotionStatus`, `promotionStatus(person, criteria, options?)`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/utils/promotion.test.ts`, and extend the import to `import { nextStep, promotionStatus, type Criterion, type PromotionInput } from "./promotion";`:

```ts
// Fixed dates everywhere, so nothing drifts with the clock.
const opts = { today: "2026-09-18", trackingStartedOn: "2026-09-13" };

const CRITERIA: Criterion[] = [
  { belt: "blue", stripe: 0, min_hours: 108, min_time_at_rank_days: 183, min_age_years: null },
  { belt: "white", stripe: 1, min_hours: 40, min_time_at_rank_days: 61, min_age_years: null },
  { belt: "black", stripe: 0, min_hours: 216, min_time_at_rank_days: 365, min_age_years: 19 },
];

function person(overrides: Partial<PromotionInput> = {}): PromotionInput {
  return {
    current_belt: "white",
    current_stripes: 0,
    rank_since: "2026-01-01",
    stripe_since: "2026-01-01",
    joined_at: "2026-09-13",
    birth_date: null,
    lessons_since_rank: 0,
    lessons_since_stripe: 0,
    ...overrides,
  };
}

describe("promotionStatus", () => {
  it("measures a stripe against stripe_since and the stripe's own counter", () => {
    // 2026-06-01 to 2026-09-18 is 109 days, past the 61 required.
    // 30 lessons * 1.5 = 45 clock hours, past the 40 required.
    const status = promotionStatus(
      person({
        stripe_since: "2026-06-01",
        lessons_since_stripe: 30,
        lessons_since_rank: 99,
      }),
      CRITERIA,
      opts,
    );

    expect(status.next).toEqual({ belt: "white", stripe: 1 });
    expect(status.currentHours).toBe(45);
    expect(status.currentDays).toBe(109);
    expect(status.eligible).toBe(true);
    expect(status.blockers).toEqual([]);
  });

  it("measures a belt against rank_since and the belt's own counter", () => {
    const status = promotionStatus(
      person({
        current_stripes: 4,
        rank_since: "2025-01-01",
        lessons_since_rank: 80,
        lessons_since_stripe: 2,
      }),
      CRITERIA,
      opts,
    );

    expect(status.next).toEqual({ belt: "blue", stripe: 0 });
    expect(status.currentHours).toBe(120); // 80 * 1.5
    expect(status.requiredHours).toBe(108);
  });

  it("is eligible exactly at the threshold, not only past it", () => {
    // 61 days to the day, and 40 clock hours to the decimal.
    const status = promotionStatus(
      person({
        stripe_since: "2026-07-19",
        lessons_since_stripe: 40 / 1.5,
      }),
      CRITERIA,
      opts,
    );

    expect(status.currentDays).toBe(61);
    expect(status.currentHours).toBe(40);
    expect(status.eligible).toBe(true);
  });

  it("names what is missing rather than just saying no", () => {
    const status = promotionStatus(
      person({ stripe_since: "2026-09-01", lessons_since_stripe: 1 }),
      CRITERIA,
      opts,
    );

    expect(status.eligible).toBe(false);
    expect(status.blockers).toEqual(["hours", "time"]);
  });

  it("adds the estimated opening balance, anchored at the later of joining and the grade", () => {
    // Joined 2026-08-30, tracking from 2026-09-13: 14 days at 3 lessons a week
    // is 6 estimated lessons, and the grade dates back before joining, so the
    // anchor is the join date.
    const status = promotionStatus(
      person({
        joined_at: "2026-08-30",
        stripe_since: "2026-01-01",
        lessons_since_stripe: 0,
      }),
      CRITERIA,
      opts,
    );

    expect(status.currentHours).toBe(9); // 6 estimated lessons * 1.5
  });

  it("refuses to call somebody eligible when the age is unknown", () => {
    const status = promotionStatus(
      person({
        current_belt: "brown",
        current_stripes: 4,
        rank_since: "2020-01-01",
        lessons_since_rank: 500,
        birth_date: null,
      }),
      CRITERIA,
      opts,
    );

    expect(status.next).toEqual({ belt: "black", stripe: 0 });
    expect(status.eligible).toBe(false);
    expect(status.blockers).toEqual(["missing-birth-date"]);
  });

  it("blocks somebody under the minimum age", () => {
    const status = promotionStatus(
      person({
        current_belt: "brown",
        current_stripes: 4,
        rank_since: "2020-01-01",
        lessons_since_rank: 500,
        birth_date: "2010-01-01",
      }),
      CRITERIA,
      opts,
    );

    expect(status.blockers).toEqual(["age"]);
  });

  it("proposes nothing at black, and is never eligible there", () => {
    const status = promotionStatus(
      person({ current_belt: "black", current_stripes: 0 }),
      CRITERIA,
      opts,
    );

    expect(status.next).toBeNull();
    expect(status.eligible).toBe(false);
  });

  it("is never eligible for a grade no criterion describes", () => {
    const status = promotionStatus(
      person({ current_belt: "purple", current_stripes: 0 }),
      CRITERIA,
      opts,
    );

    expect(status.next).toEqual({ belt: "purple", stripe: 1 });
    expect(status.eligible).toBe(false);
    expect(status.blockers).toEqual(["no-criterion"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run utils/promotion.test.ts`
Expected: FAIL — `promotionStatus is not a function`.

- [ ] **Step 3: Implement**

Append to `frontend/utils/promotion.ts`:

```ts
import { ageOn, daysSince } from "./dates";
import { clockHours, estimatedHours } from "./hours";

/** One row of `promotion_criteria`: what it takes to reach that grade. */
export type Criterion = {
  belt: string;
  stripe: number;
  min_hours: number;
  min_time_at_rank_days: number;
  min_age_years: number | null;
};

export type Blocker =
  | "hours"
  | "time"
  | "age"
  | "missing-birth-date"
  | "no-criterion";

export type PromotionInput = {
  current_belt: string;
  current_stripes: number;
  rank_since: string;
  stripe_since: string;
  joined_at: string;
  birth_date: string | null;
  lessons_since_rank: number;
  lessons_since_stripe: number;
};

export type PromotionStatus = {
  /** The grade being measured against, or null when none is modelled. */
  next: Step | null;
  /** Clock hours, both sides — see SESSION_LENGTH_HOURS. */
  requiredHours: number;
  currentHours: number;
  requiredDays: number;
  currentDays: number;
  eligible: boolean;
  /** Empty exactly when eligible; never a reason the UI has to guess. */
  blockers: Blocker[];
};

const NOTHING: PromotionStatus = {
  next: null,
  requiredHours: 0,
  currentHours: 0,
  requiredDays: 0,
  currentDays: 0,
  eligible: false,
  blockers: [],
};

/** The later of two "YYYY-MM-DD" days; string comparison is enough for ISO. */
function laterOf(a: string, b: string): string {
  return a > b ? a : b;
}

/**
 * Where somebody stands against the criteria for their next grade.
 *
 * Two anchors, one rule: a stripe is measured from `stripe_since` and counts
 * the attendance since then; a belt is measured from `rank_since` and counts
 * the attendance since then. The hours a member trained before the gym started
 * recording are added as the estimated opening balance, anchored at the later
 * of their join date and the grade date — the estimate is not attendance, and
 * it must not be credited to a grade held before they even joined.
 *
 * Comparisons are `>=`: somebody exactly at the threshold has reached it.
 */
export function promotionStatus(
  person: PromotionInput,
  criteria: Criterion[],
  options: { today?: string; trackingStartedOn?: string } = {},
): PromotionStatus {
  const today =
    options.today ?? new Date(Date.now()).toISOString().slice(0, 10);

  const step = nextStep(person.current_belt, person.current_stripes);
  if (!step) return NOTHING;

  const criterion = criteria.find(
    (c) => c.belt === step.belt && c.stripe === step.stripe,
  );
  // A grade with no row is not modelled, so nobody is eligible for it. Saying
  // so out loud beats defaulting to zero thresholds, which would make everyone
  // eligible for a grade the gym never described.
  if (!criterion) {
    return { ...NOTHING, next: step, blockers: ["no-criterion"] };
  }

  const isBeltStep = step.stripe === 0;
  const anchor = isBeltStep ? person.rank_since : person.stripe_since;
  const lessons = isBeltStep
    ? person.lessons_since_rank
    : person.lessons_since_stripe;

  const estimated = estimatedHours(laterOf(person.joined_at, anchor), {
    trackingStartedOn: options.trackingStartedOn,
    today,
  });

  const currentHours = clockHours(lessons + estimated);
  const currentDays = daysSince(anchor, today) ?? 0;

  const blockers: Blocker[] = [];
  if (currentHours < criterion.min_hours) blockers.push("hours");
  if (currentDays < criterion.min_time_at_rank_days) blockers.push("time");

  if (criterion.min_age_years !== null) {
    const age = ageOn(person.birth_date, today);
    // Never eligible for a missing date: an unknown age is not a passed check.
    if (age === null) blockers.push("missing-birth-date");
    else if (age < criterion.min_age_years) blockers.push("age");
  }

  return {
    next: step,
    requiredHours: criterion.min_hours,
    currentHours,
    requiredDays: criterion.min_time_at_rank_days,
    currentDays,
    eligible: blockers.length === 0,
    blockers,
  };
}
```

Move the two `import` lines to the top of the file, above the existing comment block's code — TypeScript requires imports before other statements at module scope.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS — all of `promotion.test.ts`, plus every pre-existing suite.

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add frontend/utils/promotion.ts frontend/utils/promotion.test.ts
git commit -m "feat(promotions): decide eligibility from criteria, hours and time at rank"
```

---

### Task 9: Translations

**Files:**
- Modify: `frontend/utils/i18n/dictionaries/it.ts` (defines the type)
- Modify: `frontend/utils/i18n/dictionaries/en.ts`
- Modify: `frontend/utils/i18n/dictionaries/pt-BR.ts`

**Interfaces:**
- Produces: `t.promotions.*` and four new `t.msg.*` keys, used by every task after this one.

- [ ] **Step 1: Add the Italian section**

In `it.ts`, add a `promotions` section after `hours` and four keys inside the existing `msg` section:

```ts
  promotions: {
    title: "Promozioni",
    nav: "Promozioni",
    queueTitle: "Minimi raggiunti",
    queueIntro:
      "Chi ha raggiunto i minimi di tempo e di ore per il grado successivo. È un suggerimento: la valutazione resta dell'istruttore.",
    queueEmpty: "Nessuno ha raggiunto i minimi al momento.",
    eligibleCount: (n: number) => (n === 1 ? "1 persona" : `${n} persone`),
    proposedStep: "Passo proposto",
    stripeStep: (n: number) => `${n}ª tacca`,
    beltStep: (belt: string) => `Cintura ${belt}`,
    hoursNote: "Ore di lezione, calcolate a 1,5 ore per lezione",
    atCurrentRank: "Ore al grado attuale",
    criteriaTitle: "Criteri",
    criteriaIntro:
      "Ore e tempo minimi per ogni grado. I valori delle cinture vengono dai minimi IBJJF e dalla pratica comune; quelli delle tacche sono una stima iniziale, da tarare sulla palestra.",
    grade: "Grado",
    minHours: "Ore minime",
    minDays: "Giorni minimi",
    minAge: "Età minima",
    criterionNotes: "Note",
    save: "Salva",
    promote: "Promuovi",
    promoteTitle: (name: string) => `Promuovi ${name}`,
    targetBelt: "Nuova cintura",
    targetStripes: "Tacche",
    promotedOn: "Data della promozione",
    promotionNotes: "Note",
    confirm: "Registra promozione",
    history: "Storico promozioni",
    historyEmpty: "Nessuna promozione registrata.",
    historyEntry: (from: string, to: string) => `Da ${from} a ${to}`,
    promotedBy: (name: string) => `Registrata da ${name}`,
    remindersTitle: "Da valutare sul tappeto",
    remindersNote:
      "Promemoria, non una checklist: niente di quanto segue viene salvato.",
    reminders: {
      blue: [
        "Attacco e difesa di base in guardia, montata, cento chili e controllo della schiena",
        "Sopravvive nello sparring senza farsi sottomettere facilmente",
        "Rispetta le regole di sicurezza: batte in tempo, controlla le sottomissioni",
        "Etichetta di base sul tappeto",
        "Rispetto per i compagni di allenamento",
      ],
      purple: [
        "Gioco personale riconoscibile, con posizioni e sequenze preferite",
        "Passaggi di guardia, sottomissioni e transizioni solide",
        "Tiene il confronto con pari grado e con cinture superiori",
        "Costanza negli allenamenti",
        "Affidabilità in palestra",
      ],
      brown: [
        "Gioco tecnico maturo",
        "Concatena le tecniche in modo fluido",
        "Controllo posizionale avanzato",
        "Sa correggere e aiutare le cinture più basse",
        "Contributo attivo alla vita della palestra",
        "Fa da mentore o assiste nell'insegnamento",
      ],
      black: [
        "Adatta il proprio gioco a stili di avversario diversi",
        "È in grado di insegnare l'intero programma",
        "Maturità marziale complessiva",
        "Capacità di guida dimostrata nel tempo",
        "Umiltà e rispetto per la tradizione",
        "Dedizione di lungo periodo all'arte e alla palestra",
      ],
    },
  },
```

Inside the existing `msg` section of `it.ts`, add:

```ts
    promotionRecorded: "Promozione registrata",
    promotionFailed: "Non è stato possibile registrare la promozione",
    promotionNotForward: "Una promozione deve andare avanti, non indietro",
    criterionSaved: "Criterio aggiornato",
```

- [ ] **Step 2: Add the English section**

Same shape in `en.ts`:

```ts
  promotions: {
    title: "Promotions",
    nav: "Promotions",
    queueTitle: "Minimums met",
    queueIntro:
      "Who has met the time and hour minimums for their next grade. It is a suggestion: the assessment stays with the instructor.",
    queueEmpty: "Nobody has met the minimums right now.",
    eligibleCount: (n: number) => (n === 1 ? "1 person" : `${n} people`),
    proposedStep: "Proposed step",
    stripeStep: (n: number) => `Stripe ${n}`,
    beltStep: (belt: string) => `${belt} belt`,
    hoursNote: "Mat hours, counted at 1.5 hours a lesson",
    atCurrentRank: "Hours at the current grade",
    criteriaTitle: "Criteria",
    criteriaIntro:
      "Minimum hours and time for each grade. The belt figures come from the IBJJF minimums and common practice; the stripe figures are a starting estimate, meant to be tuned for this gym.",
    grade: "Grade",
    minHours: "Minimum hours",
    minDays: "Minimum days",
    minAge: "Minimum age",
    criterionNotes: "Notes",
    save: "Save",
    promote: "Promote",
    promoteTitle: (name: string) => `Promote ${name}`,
    targetBelt: "New belt",
    targetStripes: "Stripes",
    promotedOn: "Promotion date",
    promotionNotes: "Notes",
    confirm: "Record promotion",
    history: "Promotion history",
    historyEmpty: "No promotion recorded.",
    historyEntry: (from: string, to: string) => `From ${from} to ${to}`,
    promotedBy: (name: string) => `Recorded by ${name}`,
    remindersTitle: "To assess on the mat",
    remindersNote: "A reminder, not a checklist: none of this is saved.",
    reminders: {
      blue: [
        "Basic offence and defence from guard, mount, side control and back control",
        "Survives sparring without being submitted easily",
        "Follows the safety rules: taps in time, controls submissions",
        "Basic mat etiquette",
        "Respect for training partners",
      ],
      purple: [
        "A recognisable personal game, with preferred positions and sequences",
        "Solid guard passing, submissions and transitions",
        "Holds their own against equal and higher belts",
        "Consistent training",
        "Reliable around the academy",
      ],
      brown: [
        "A mature technical game",
        "Chains techniques fluidly",
        "Advanced positional control",
        "Can correct and help lower belts",
        "Contributes actively to the academy",
        "Mentors or assists with teaching",
      ],
      black: [
        "Adapts their game to different opponent styles",
        "Able to teach the full curriculum",
        "Overall martial maturity",
        "Leadership sustained over time",
        "Humility and respect for the tradition",
        "Long-term dedication to the art and the academy",
      ],
    },
  },
```

And in `msg`:

```ts
    promotionRecorded: "Promotion recorded",
    promotionFailed: "The promotion could not be recorded",
    promotionNotForward: "A promotion has to move forward, not back",
    criterionSaved: "Criterion updated",
```

- [ ] **Step 3: Add the Brazilian Portuguese section**

Same shape in `pt-BR.ts`:

```ts
  promotions: {
    title: "Promoções",
    nav: "Promoções",
    queueTitle: "Mínimos atingidos",
    queueIntro:
      "Quem atingiu os mínimos de tempo e de horas para a próxima graduação. É uma sugestão: a avaliação continua sendo do professor.",
    queueEmpty: "Ninguém atingiu os mínimos no momento.",
    eligibleCount: (n: number) => (n === 1 ? "1 pessoa" : `${n} pessoas`),
    proposedStep: "Próximo passo",
    stripeStep: (n: number) => `${n}º grau`,
    beltStep: (belt: string) => `Faixa ${belt}`,
    hoursNote: "Horas de aula, calculadas a 1,5 hora por aula",
    atCurrentRank: "Horas na graduação atual",
    criteriaTitle: "Critérios",
    criteriaIntro:
      "Horas e tempo mínimos para cada graduação. Os valores das faixas vêm dos mínimos da IBJJF e da prática comum; os dos graus são uma estimativa inicial, para ajustar à academia.",
    grade: "Graduação",
    minHours: "Horas mínimas",
    minDays: "Dias mínimos",
    minAge: "Idade mínima",
    criterionNotes: "Observações",
    save: "Salvar",
    promote: "Promover",
    promoteTitle: (name: string) => `Promover ${name}`,
    targetBelt: "Nova faixa",
    targetStripes: "Graus",
    promotedOn: "Data da promoção",
    promotionNotes: "Observações",
    confirm: "Registrar promoção",
    history: "Histórico de promoções",
    historyEmpty: "Nenhuma promoção registrada.",
    historyEntry: (from: string, to: string) => `De ${from} para ${to}`,
    promotedBy: (name: string) => `Registrada por ${name}`,
    remindersTitle: "Para avaliar no tatame",
    remindersNote: "Um lembrete, não uma checklist: nada disso é salvo.",
    reminders: {
      blue: [
        "Ataque e defesa básicos na guarda, montada, cem quilos e controle das costas",
        "Sobrevive no sparring sem ser finalizado com facilidade",
        "Segue as regras de segurança: bate a tempo, controla as finalizações",
        "Etiqueta básica no tatame",
        "Respeito pelos companheiros de treino",
      ],
      purple: [
        "Jogo pessoal reconhecível, com posições e sequências preferidas",
        "Passagens de guarda, finalizações e transições sólidas",
        "Se mantém contra faixas iguais e superiores",
        "Constância nos treinos",
        "Confiabilidade na academia",
      ],
      brown: [
        "Jogo técnico maduro",
        "Encadeia técnicas com fluidez",
        "Controle posicional avançado",
        "Sabe corrigir e ajudar as faixas menores",
        "Contribui ativamente com a academia",
        "Orienta ou auxilia no ensino",
      ],
      black: [
        "Adapta o jogo a estilos de oponente diferentes",
        "Capaz de ensinar o programa completo",
        "Maturidade marcial geral",
        "Liderança sustentada ao longo do tempo",
        "Humildade e respeito pela tradição",
        "Dedicação de longo prazo à arte e à academia",
      ],
    },
  },
```

And in `msg`:

```ts
    promotionRecorded: "Promoção registrada",
    promotionFailed: "Não foi possível registrar a promoção",
    promotionNotForward: "Uma promoção precisa avançar, não retroceder",
    criterionSaved: "Critério atualizado",
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no output. A key present in `it.ts` and missing from one of the other two is a compile error here — that is the point of the type.

- [ ] **Step 5: Commit**

```bash
git add frontend/utils/i18n/dictionaries
git commit -m "feat(i18n): add the promotions vocabulary in three languages"
```

---

### Task 10: The promotions page — eligibility queue

**Files:**
- Create: `frontend/app/promotions/page.tsx`
- Modify: `frontend/utils/supabase/proxy.ts` (add `/promotions` to `PROTECTED_PREFIXES`)
- Modify: `frontend/components/nav-shell.tsx` (nav item for registry viewers)
- Modify: `frontend/app/layout.tsx` only if the nav labels object needs the new string — check how `labels` is built and add `promotions: t.promotions.nav` alongside the others.

**Interfaces:**
- Consumes: `promotionStatus`, `Criterion`, `PromotionInput` (Task 8); `t.promotions.*` (Task 9); `person_rank_hours` (Task 2); `requireRegistryViewer()`.
- Produces: the route `/promotions`, and the shape `EligibleRow = { id, full_name, current_belt, current_stripes, status }` reused by Task 11's section on the same page.

- [ ] **Step 1: Add the route to the proxy and the nav**

In `frontend/utils/supabase/proxy.ts`, add `"/promotions"` to `PROTECTED_PREFIXES`.

In `frontend/components/nav-shell.tsx`, define the item next to the existing ones and push it inside the `canViewRegistry` branch of `navItemsFor`, after `REGISTRO_ITEM`:

```tsx
  if (canViewRegistry) {
    items.push(REGISTRO_ITEM);
    items.push(PROMOZIONI_ITEM);
  }
```

Follow the shape of `REGISTRO_ITEM` exactly (same object keys, `href: "/promotions"`, the label taken from the `labels` prop, an icon from `@/components/icons` — reuse `TrendingUpIcon`, already used by the dashboard for rank).

- [ ] **Step 2: Write the page**

Create `frontend/app/promotions/page.tsx`:

```tsx
import Link from "next/link";

import { Belt } from "@/components/belt";
import { TrendingUpIcon } from "@/components/icons";
import { beltLabel } from "@/utils/supabase/profile";
import { formatDays } from "@/utils/dates";
import { formatHours } from "@/utils/hours";
import { getDictionary } from "@/utils/i18n/server";
import { PORTAL_ONLY_ROLES } from "@/utils/members";
import {
  promotionStatus,
  type Criterion,
  type PromotionInput,
  type PromotionStatus,
} from "@/utils/promotion";
import { requireRegistryViewer } from "@/utils/supabase/require-admin";

const PATH = "/promotions";

type MemberRow = PromotionInput & {
  id: string;
  full_name: string;
};

type RankHours = {
  person_id: string;
  lessons_since_rank: number;
  lessons_since_stripe: number;
};

export default async function PromotionsPage() {
  const { t } = await getDictionary();
  const { supabase, access } = await requireRegistryViewer(PATH);

  // Three small queries rather than one view: the eligibility rule lives in
  // TypeScript, where it is unit-tested, so the database is not asked to know
  // who is eligible. A gym is a few hundred rows; this is one round trip each.
  const [{ data: memberRows }, { data: rankRows }, { data: criteriaRows }] =
    await Promise.all([
      supabase
        .from("member_overview")
        .select(
          "id, full_name, current_belt, current_stripes, rank_since, stripe_since, joined_at, birth_date",
        )
        .eq("is_active", true)
        // A portal-only admin runs the portal and does not train here.
        .not("active_roles", "eq", PORTAL_ONLY_ROLES)
        .order("full_name"),
      supabase
        .from("person_rank_hours")
        .select("person_id, lessons_since_rank, lessons_since_stripe"),
      supabase
        .from("promotion_criteria")
        .select("belt, stripe, min_hours, min_time_at_rank_days, min_age_years, notes")
        .order("belt")
        .order("stripe"),
    ]);

  const criteria = (criteriaRows ?? []) as (Criterion & { notes: string | null })[];
  const hoursById = new Map(
    ((rankRows ?? []) as RankHours[]).map((row) => [row.person_id, row]),
  );

  const evaluated = ((memberRows ?? []) as Omit<
    MemberRow,
    "lessons_since_rank" | "lessons_since_stripe"
  >[]).map((member) => {
    const counted = hoursById.get(member.id);
    const status = promotionStatus(
      {
        ...member,
        lessons_since_rank: Number(counted?.lessons_since_rank ?? 0),
        lessons_since_stripe: Number(counted?.lessons_since_stripe ?? 0),
      },
      criteria,
    );
    return { ...member, status };
  });

  const eligible = evaluated.filter((row) => row.status.eligible);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">{t.promotions.title}</h1>
        <p className="text-sm text-foreground/65">{t.promotions.queueIntro}</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <TrendingUpIcon className="h-4 w-4" />
          {t.promotions.queueTitle}
        </h2>

        {eligible.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 text-sm text-foreground/60">
            {t.promotions.queueEmpty}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {eligible.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 px-3 py-3 sm:p-4"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <Link href={`/members/${row.id}`} className="hover:underline">
                      {row.full_name}
                    </Link>
                    <Belt belt={row.current_belt} stripes={row.current_stripes} />
                  </span>
                  <span className="text-xs text-foreground/70">
                    {t.promotions.proposedStep}
                    {": "}
                    {stepLabel(row.status, t)}
                  </span>
                  <span
                    className="text-xs text-foreground/55"
                    title={t.promotions.hoursNote}
                  >
                    {formatHours(row.status.currentHours, t)}
                    {" · "}
                    {formatDays(row.status.currentDays, t)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// A stripe reads "3ª tacca", a belt reads "Cintura blu" — the belt name comes
// from the dictionary like everywhere else, never from the enum value.
function stepLabel(
  status: PromotionStatus,
  t: Awaited<ReturnType<typeof getDictionary>>["t"],
): string {
  if (!status.next) return "—";
  return status.next.stripe === 0
    ? t.promotions.beltStep(beltLabel(status.next.belt, t))
    : t.promotions.stripeStep(status.next.stripe);
}
```

If `beltLabel` is not exported from `@/utils/supabase/profile`, find where the Registro filter builds its belt options (`beltLabels(t)` in `frontend/app/members/page.tsx`) and import from the same module it uses — do not write a second mapping.

- [ ] **Step 3: Check it renders**

Run the app with the `frontend` launch configuration in `.claude/launch.json`, sign in as a head coach, open `/promotions`.
Expected: the page renders, either with the empty state or with rows. Then sign in as a student and open `/promotions`: **404**, not 403, and no "Promozioni" item in the nav.

- [ ] **Step 4: Lint and type-check**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/promotions frontend/components/nav-shell.tsx frontend/utils/supabase/proxy.ts frontend/app/layout.tsx
git commit -m "feat(promotions): add the eligibility queue page"
```

---

### Task 11: The criteria editor

**Files:**
- Create: `frontend/app/promotions/actions.ts`
- Modify: `frontend/app/promotions/page.tsx` (second section, editors only)

**Interfaces:**
- Consumes: `requireRegistryEditor()`, `t.promotions.*`, `t.msg.criterionSaved`, the `criteria` array already fetched in Task 10.
- Produces: server action `updateCriterion(formData: FormData)`.

- [ ] **Step 1: Write the action**

Create `frontend/app/promotions/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDictionary } from "@/utils/i18n/server";
import { requireRegistryEditor } from "@/utils/supabase/require-admin";

const PATH = "/promotions";

function logDbError(
  where: string,
  error: { code?: string | null; message?: string | null; details?: string | null },
) {
  console.error(
    `[promotions] ${where} failed: ${error.code ?? "no code"} ${error.message ?? ""} ${
      error.details ?? ""
    }`.trim(),
  );
}

function back(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  redirect(`${PATH}?${search.toString()}`);
}

const number = (formData: FormData, key: string): number | null => {
  const raw = (formData.get(key) as string | null)?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

// Tunes one row of promotion_criteria. The grade itself is never editable:
// the ladder is fixed, only its numbers are the gym's business — so belt and
// stripe arrive as hidden fields and are used to address the row, never to
// create one.
export async function updateCriterion(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireRegistryEditor(PATH);

  const belt = (formData.get("belt") as string | null)?.trim();
  const stripe = number(formData, "stripe");
  if (!belt || stripe === null) {
    back({ error: t.msg.promotionFailed });
    return;
  }

  const minHours = number(formData, "min_hours");
  const minDays = number(formData, "min_time_at_rank_days");
  if (minHours === null || minHours < 0 || minDays === null || minDays < 0) {
    back({ error: t.msg.promotionFailed });
    return;
  }

  const minAge = number(formData, "min_age_years");
  const notes = (formData.get("notes") as string | null)?.trim() || null;

  const { error } = await supabase
    .from("promotion_criteria")
    .update({
      min_hours: minHours,
      min_time_at_rank_days: Math.round(minDays),
      min_age_years: minAge === null ? null : Math.round(minAge),
      notes,
    })
    .eq("belt", belt)
    .eq("stripe", stripe);

  if (error) {
    // The database's own text never reaches the screen: codes and constraint
    // names describe the schema, which is not the reader's business.
    logDbError("updateCriterion", error);
    back({ error: t.msg.promotionFailed });
    return;
  }

  revalidatePath(PATH);
  back({ ok: t.msg.criterionSaved });
}
```

- [ ] **Step 2: Render the editor on the page**

In `frontend/app/promotions/page.tsx`, accept the search params so the confirmation and error banners can be shown, and add the second section **only when `access.canEditRegistry`**:

```tsx
export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const params = await searchParams;
  // ...existing body...
```

Render the banners above the queue (follow the markup the Registro already uses for `ok` / `error`), then after the queue section:

```tsx
      {access.canEditRegistry ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">
            {t.promotions.criteriaTitle}
          </h2>
          <p className="text-sm text-foreground/65">{t.promotions.criteriaIntro}</p>

          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {criteria.map((criterion) => (
              <li key={`${criterion.belt}-${criterion.stripe}`} className="p-3 sm:p-4">
                <form
                  action={updateCriterion}
                  className="flex flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="belt" value={criterion.belt} />
                  <input type="hidden" name="stripe" value={criterion.stripe} />

                  <span className="flex min-w-[9rem] items-center gap-2 text-sm font-medium">
                    <Belt belt={criterion.belt} stripes={criterion.stripe} />
                  </span>

                  <label className="flex flex-col gap-1 text-xs text-foreground/65">
                    {t.promotions.minHours}
                    <input
                      type="number"
                      name="min_hours"
                      min={0}
                      step="0.5"
                      defaultValue={criterion.min_hours}
                      required
                      className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-foreground/65">
                    {t.promotions.minDays}
                    <input
                      type="number"
                      name="min_time_at_rank_days"
                      min={0}
                      step="1"
                      defaultValue={criterion.min_time_at_rank_days}
                      required
                      className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-foreground/65">
                    {t.promotions.minAge}
                    <input
                      type="number"
                      name="min_age_years"
                      min={0}
                      max={99}
                      step="1"
                      defaultValue={criterion.min_age_years ?? ""}
                      className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </label>

                  <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-foreground/65">
                    {t.promotions.criterionNotes}
                    <input
                      type="text"
                      name="notes"
                      defaultValue={criterion.notes ?? ""}
                      className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </label>

                  <button
                    type="submit"
                    className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
                  >
                    {t.promotions.save}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
```

Add `import { updateCriterion } from "./actions";` at the top.

- [ ] **Step 3: Check it works**

In the running app, signed in as a head coach: change `(white, 1)` minimum days from 61 to 70, submit.
Expected: the confirmation banner appears and the field shows 70 after the reload. Sign in as an **instructor**: the queue renders, the criteria section does not.

- [ ] **Step 4: Lint and type-check**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/promotions
git commit -m "feat(promotions): let maestri tune the criteria from the app"
```

---

### Task 12: Recording a promotion

**Files:**
- Create: `frontend/app/members/[id]/promote-panel.tsx` (server component, rendered inside the detail page)
- Modify: `frontend/app/members/actions.ts` (add `recordPromotion`)
- Modify: `frontend/app/members/[id]/page.tsx` (render the panel, the history and the reminders)

**Interfaces:**
- Consumes: `record_promotion()` (Task 4), `promotionStatus` (Task 8), `t.promotions.*` and `t.msg.promotion*` (Task 9).
- Produces: server action `recordPromotion(formData: FormData)` reading `person_id`, `to_belt`, `to_stripes`, `promoted_on`, `notes`.

- [ ] **Step 1: Write the action**

Append to `frontend/app/members/actions.ts`:

```ts
// Recording a promotion is one RPC, not two writes: updating the person row
// and inserting the history row have to happen together, and record_promotion()
// does both in one transaction. The function is security *invoker*, so RLS and
// the guard trigger still apply — requireRegistryEditor here is the early, clear
// refusal, not the security boundary.
export async function recordPromotion(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireRegistryEditor(PATH);

  const personId = text(formData, "person_id");
  const toBelt = text(formData, "to_belt");
  const promotedOn = text(formData, "promoted_on");
  const toStripes = Number.parseInt(
    (formData.get("to_stripes") as string) ?? "0",
    10,
  );

  if (!personId || !toBelt || !BELTS.includes(toBelt as (typeof BELTS)[number])) {
    redirect(`/members/${personId ?? ""}?error=${encodeURIComponent(t.msg.promotionFailed)}`);
  }

  const { error } = await supabase.rpc("record_promotion", {
    p_person_id: personId,
    p_to_belt: toBelt,
    p_to_stripes: Number.isFinite(toStripes) ? toStripes : 0,
    p_promoted_on: promotedOn ?? undefined,
    p_notes: text(formData, "notes"),
  });

  if (error) {
    // 23514 is the function's own check violations — forward-only, stripes out
    // of range, stripes on a black belt. They are the one case the user can act
    // on, so they get their own message; everything else is generic and the
    // real reason goes to the server log.
    const message =
      error.code === "23514" ? t.msg.promotionNotForward : t.msg.promotionFailed;
    console.error(
      `[members] recordPromotion failed: ${error.code ?? "no code"} ${error.message ?? ""}`.trim(),
    );
    redirect(`/members/${personId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/members/${personId}`);
  revalidatePath("/promotions");
  redirect(`/members/${personId}?ok=${encodeURIComponent(t.msg.promotionRecorded)}`);
}
```

- [ ] **Step 2: Write the panel**

Create `frontend/app/members/[id]/promote-panel.tsx`:

```tsx
import { recordPromotion } from "../actions";
import { Belt } from "@/components/belt";
import { BELT_ORDER, type PromotionStatus } from "@/utils/promotion";
import { beltLabel } from "@/utils/supabase/profile";
import type { Dictionary } from "@/utils/i18n/dictionaries/it";

// The reminders are keyed by the belt being awarded, and are text only: the
// spec is explicit that nothing here is saved. A tick box would promise a
// record the app does not keep.
const REMINDER_KEYS = ["blue", "purple", "brown", "black"] as const;

export function PromotePanel({
  personId,
  personName,
  status,
  today,
  t,
}: {
  personId: string;
  personName: string;
  status: PromotionStatus;
  today: string;
  t: Dictionary;
}) {
  const proposed = status.next;
  const reminderKey = REMINDER_KEYS.find((k) => k === proposed?.belt);

  return (
    <details className="rounded-xl border border-border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        {t.promotions.promoteTitle(personName)}
      </summary>

      <div className="flex flex-col gap-4 border-t border-border p-4">
        <form action={recordPromotion} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="person_id" value={personId} />

          <label className="flex flex-col gap-1 text-xs text-foreground/65">
            {t.promotions.targetBelt}
            <select
              name="to_belt"
              defaultValue={proposed?.belt ?? ""}
              required
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              {BELT_ORDER.map((belt) => (
                <option key={belt} value={belt}>
                  {beltLabel(belt, t)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-foreground/65">
            {t.promotions.targetStripes}
            <select
              name="to_stripes"
              defaultValue={String(proposed?.stripe ?? 0)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-foreground/65">
            {t.promotions.promotedOn}
            {/* ISO on purpose: it is what the element accepts and posts back. */}
            <input
              type="date"
              name="promoted_on"
              defaultValue={today}
              max={today}
              required
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>

          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-foreground/65">
            {t.promotions.promotionNotes}
            <input
              type="text"
              name="notes"
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>

          <button
            type="submit"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            {t.promotions.confirm}
          </button>
        </form>

        {reminderKey ? (
          <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Belt belt={reminderKey} stripes={0} />
              {t.promotions.remindersTitle}
            </p>
            <ul className="list-disc pl-5 text-xs leading-relaxed text-foreground/70">
              {t.promotions.reminders[reminderKey].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="text-xs text-foreground/55">{t.promotions.remindersNote}</p>
          </div>
        ) : null}
      </div>
    </details>
  );
}
```

- [ ] **Step 3: Render the panel and the history on the detail page**

In `frontend/app/members/[id]/page.tsx`:

1. Fetch the counted lessons and the criteria alongside the existing person query, and compute `promotionStatus(...)`.
2. Fetch the history:

```tsx
  const { data: promotionRows } = await supabase
    .from("promotion")
    .select("id, from_belt, from_stripes, to_belt, to_stripes, promoted_on, notes")
    .eq("person_id", id)
    .order("promoted_on", { ascending: false });
```
3. Render `<PromotePanel ... />` only when `access.canEditRegistry`.
4. Render the history for everyone who can see the page, each row as
   `t.promotions.historyEntry(...)` with `formatDate(row.promoted_on)` — never the raw column.

- [ ] **Step 4: Verify end to end**

In the running app, signed in as a head coach, on a white belt with 0 stripes:
- promote to white / 1 stripe dated today → confirmation banner, the belt graphic gains a stripe, `stripe_since` becomes today, the history shows one row;
- try to promote the same person back to white / 0 → the "must move forward" message, and nothing changes;
- try a date in the future → the browser's `max` blocks it; remove the attribute in devtools and submit to confirm the function refuses it too.

Signed in as an **instructor**, the panel is absent; the history is visible.

- [ ] **Step 5: Lint and type-check**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/members
git commit -m "feat(promotions): record a promotion with its history"
```

---

### Task 13: Eligibility where staff already look

**Files:**
- Modify: `frontend/app/members/page.tsx` (a dot on an eligible row, and "Promuovi" in the kebab)
- Modify: `frontend/app/dashboard/staff-dashboard.tsx` (a card with the count)

**Interfaces:**
- Consumes: `promotionStatus` (Task 8), `person_rank_hours` (Task 2), `t.promotions.*` (Task 9).

- [ ] **Step 1: Registro — mark the eligible rows**

In `frontend/app/members/page.tsx`, after the existing `member_overview` query, fetch the counters and the criteria for the rows on this page only:

```tsx
  const ids = members.map((m) => m.id);
  const [{ data: rankRows }, { data: criteriaRows }] = await Promise.all([
    ids.length
      ? supabase
          .from("person_rank_hours")
          .select("person_id, lessons_since_rank, lessons_since_stripe")
          .in("person_id", ids)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("promotion_criteria")
      .select("belt, stripe, min_hours, min_time_at_rank_days, min_age_years"),
  ]);
```

Build the same `Map` as in Task 10, compute `promotionStatus` per row, and render a dot next to the belt when `status.eligible`:

```tsx
                  {status.eligible ? (
                    <span
                      className="inline-block h-2 w-2 rounded-full bg-[var(--success)]"
                      title={t.promotions.queueTitle}
                      aria-label={t.promotions.queueTitle}
                    />
                  ) : null}
```

In the kebab, after the Dettagli link, add for editors only:

```tsx
                {access.canEditRegistry ? (
                  <Link
                    href={`/members/${member.id}?from=${encodeURIComponent(currentQuery)}#promote`}
                    className={menuItemClass}
                  >
                    <TrendingUpIcon className={menuIconClass} />
                    {t.promotions.promote}
                  </Link>
                ) : null}
```

Give the `<details>` in `PromotePanel` `id="promote"` so the anchor lands on it.

- [ ] **Step 2: Staff dashboard — the count**

In `frontend/app/dashboard/staff-dashboard.tsx`, the active members are already fetched. Add the two queries (`person_rank_hours`, `promotion_criteria`), compute the eligible count with `promotionStatus`, and render a `Stat` inside the members `Section`, linking to `/promotions`:

```tsx
        <Link href="/promotions" className="block">
          <Stat
            label={t.promotions.queueTitle}
            value={t.promotions.eligibleCount(eligibleCount)}
          />
        </Link>
```

Match the props `Stat` actually takes in `frontend/app/dashboard/stat.tsx` — read it first rather than assuming.

- [ ] **Step 3: Check it renders**

Signed in as a head coach: the Registro shows a dot on the rows the `/promotions` queue lists — the two must agree, because they run the same function. The dashboard count equals the number of rows in the queue.

- [ ] **Step 4: Lint and type-check**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/members/page.tsx frontend/app/dashboard/staff-dashboard.tsx
git commit -m "feat(promotions): surface eligibility in the registry and the dashboard"
```

---

### Task 14: The member's own view — facts only

**Files:**
- Modify: `frontend/app/dashboard/member-dashboard.tsx`

**Interfaces:**
- Consumes: `person_rank_hours` (Task 2), `clockHours` (Task 6), `t.promotions.atCurrentRank` and `t.promotions.hoursNote` (Task 9).

- [ ] **Step 1: Fetch the counter**

Add to the existing `Promise.all` in `MemberDashboard`:

```tsx
      supabase
        .from("person_rank_hours")
        .select("lessons_since_rank")
        .eq("person_id", profile.id)
        .maybeSingle(),
```

- [ ] **Step 2: Show it**

Add one more `<div>` inside the `<dl>` of the `t.dashboard.yourRank` section, next to "atThisBelt" and "sinceLastStripe":

```tsx
            <div>
              <dt className="text-xs uppercase tracking-wide text-foreground/55">
                {t.promotions.atCurrentRank}
              </dt>
              <dd className="text-sm font-medium" title={t.promotions.hoursNote}>
                {formatHours(clockHours(Number(rankRow?.lessons_since_rank ?? 0)), t)}
              </dd>
            </div>
```

Import `clockHours` alongside the existing `hoursFor` import.

**Nothing else changes here.** No threshold, no remaining hours, no remaining days, no name of the next grade, no bar, no verdict — this is a rule of the product, not a layout preference. The existing `t.dashboard.promotionNote` line below the card already says the decision belongs to the instructor, and it stays.

- [ ] **Step 3: Verify**

Signed in as a student: the rank card shows belt, time at belt, time since the last stripe, join date and hours at the current grade. Nothing states a target or an entitlement. Open devtools' network tab and confirm the page issues **no** request to `promotion_criteria`; querying it directly as a student returns an empty result, because of Task 1's policy.

- [ ] **Step 4: Lint, type-check and full test run**

Run: `cd frontend && npm test && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/dashboard/member-dashboard.tsx
git commit -m "feat(dashboard): show a member the hours at their current grade"
```

---

### Task 15: Document the subsystem

**Files:**
- Modify: `CLAUDE.md` (new section after "Attendance and courses")

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the section**

Add a `## Promotions` section to `CLAUDE.md` covering, in the compressed style the rest of the file now uses: the meaning of a `promotion_criteria` row and its two time anchors; why there are no `(black, 1..4)` rows; that `min_hours` is in clock hours and `SESSION_LENGTH_HOURS` is the only conversion; why hours are counted from the current grade rather than from joining; that the criteria are readable by staff only *because* a student must never be able to compute how far they are; that `record_promotion()` is security invoker and why; that a promotion can be deleted but never updated; that the seeded stripe numbers are an estimate, not from `belt-criteria.md`; and the rule that no member-facing screen shows a remaining amount or a verdict.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe the promotion subsystem"
```

---

## Self-review notes

- **Spec coverage.** Criteria table and `min_age_years` → Task 1. `person_rank_hours` → Task 2. `promotion` table and its RLS → Task 3. `record_promotion()` → Task 4. `promotion.ts` and its tests → Tasks 5-8. Translations → Task 9. `/promotions` queue and the nav item → Task 10. Criteria editor → Task 11. Promotion panel, history and reminders → Task 12. Registro dot and staff dashboard card → Task 13. Member view → Task 14. The spec's restriction of the criteria read policy is inside Task 1, and the documentation duty is Task 15.
- **The "no filter for eligibility in the Registro"** decision is honoured by construction: no task adds one, and Task 13 computes the dot over the rows already on the page.
- **Names used consistently across tasks:** `nextStep`, `promotionStatus`, `Criterion`, `PromotionInput`, `PromotionStatus`, `Blocker`, `clockHours`, `SESSION_LENGTH_HOURS`, `ageOn`, `record_promotion`, `person_rank_hours`, `promotion`.
- **One addition the spec did not name:** the `no-criterion` blocker in Task 8. A grade with no row must not read as eligible with zero thresholds, and the UI needs a reason to show. It is additive and breaks nothing in the spec.
