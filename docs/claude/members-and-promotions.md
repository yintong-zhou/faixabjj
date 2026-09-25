# Members (Registro) and promotions

**One list of people, not two.** Anything that enumerates members lives in `/members`. Forms and reference tables may have sub-routes (`/members/new`, `/members/criteria`, `/members/[id]`).

## `/members`

Lists every person (active roles, belt, hours, join date) and manages accounts (invite, password reset, revoke). Visible to instructor, head_coach, admin; **instructor is read-only** (no action controls, `access.canEditRegistry`; RLS refuses writes anyway).

- **Data source:** view `member_overview` (`20260911140000`): one row per person with `active_roles` (text[]), `is_active`, `total_hours`. Needed so role filters paginate and count correctly.
- **Filters and paging in the URL** (`q`, `ruolo`, `cintura`, `attivi`, `idonei`, `p`) via a plain `method="get"` form, no client JS. Row actions carry the query back in a `_query` hidden field.
- **Search = name only**, never email (explicit). Strip `%`, `,`, `(`, `)`, `\` before `ilike` (they break PostgREST syntax).
- **Row shows no email.** Two day counters under the name: days since `joined_at` and since `rank_since`. `daysSince()` (`utils/dates.ts`) normalises both ends to UTC midnight; future clamps to 0.
- **Every row action is behind a kebab** (`components/row-menu.tsx`, Client Component; action forms server-rendered, passed as `children`). Closes on Escape/outside press; no close-on-submit needed (actions navigate). No available action → no kebab. **Dettagli** is available to instructors too; only account actions gate on `canEditRegistry`.
- `auth_user_id = null` shows **"senza account"**.

### Portal-only admin

Single home for the rule: **`frontend/utils/members.ts`** (`PORTAL_ONLY_ROLE`, `PORTAL_ONLY_ROLES`, `TECHNICAL_ROLES`, `isPortalOnly()`) — import, don't redeclare.
- **Excluded from every "which of our people" list**: Registro, roll calls, instructor dropdowns, staff dashboard counts. Selectable only on `/members/new`. Filter is array **equality** (`not active_roles eq {admin}`), not "contains": maestro+admin still trains. The view coalesces and sorts `active_roles` so `{admin}` matches exactly. Role filter has no "Admin" option. Query-level visibility, not RLS.
- **Holds no belt; UI never shows or asks for one.** `/account` shows only roles (no belt, grade dates, join date, hours); `/dashboard` offers no "mia" view and ignores `v=mia`; `/members/[id]` hides belt chip, Percorso, promotion panel and history; `/members/new` doesn't require a belt and `addPerson` leaves belt/stripes/grade dates at column defaults for admin.
- Test is `isPortalOnly()` (active roles exactly `{admin}`, unit-tested), **never an access flag** (head coach has the same flags). `person.current_belt` stays `not null default 'white'` — UI rule, not schema.

### Account actions (`app/members/actions.ts`)

- **Adding a person also creates their account** (requirement reversed once; trust this). `addPerson`: auth user with a temporary password drawn for it alone (`generateTemporaryPassword()`, `utils/temporary-password.ts`), shown once via the flash cookie, `email_confirm: true` (**no email**, works immediately), `app_metadata.must_change_password`; then fills the trigger-created `person` row and assigns the role. Required, validated server-side: name, email, role, join date, belt (not for admin). Optional: phone, birth date, stripes, rank date, notes. **Auth user first** (fails on duplicate email, avoids a stranded person row). It runs on the user's client, not the service-role one, so RLS enforces it and no secret key is needed.
- **"Reimposta password"** (`setTemporaryPassword`): confirmed kebab button drawing a fresh temporary password, shown once on the list; no email. **Re-arms `must_change_password`**.
- **"Invita al portale"** (`inviteToPortal`): for a member without an account; emails them to choose their own password (no default, no forced change). The only action that sends mail.
- `20260911160000_link_invited_person.sql`: the `auth.users` trigger **links** a new account to an account-less row with the same email (case-insensitive) instead of duplicating. Lives in the trigger so every path is covered.

### `/members/[id]`

Reads `person` (+ `person_hours`), not `member_overview` (carries `notes`). Shows **full role history** including closed assignments, promotion history above the panel. Kebab passes the list filters in `from` so back returns to the exact list.

- **`rank_since` vs `stripe_since`**: belt date ("Cambio cintura da") vs last stripe ("Ultima tacca", added `20260911220000`, correcting `20260911200000`'s `belt_since`). Different rates; eligibility hangs on time at belt — never infer it from the stripe date. Both frozen by `guard_person_auth_link`.
- **Correcting the two dates**: collapsed panel in Percorso, editors only (`correctRankDates`). **Not a promotion**, writes no history (`record_promotion()` stays the only way a grade changes). Refuses future dates and `stripe_since < rank_since`, re-checked server-side. Revalidates `/members` too (dates feed `promotionStatus()`).

## Promotions

**No `/promotions` route** — it was built and dismantled. The queue is folded into the Registro as one fact seen three ways: a **summary line** with the eligible count (links to `idonei=1`), the **`idonei` filter**, and the **green dot** per row. The staff dashboard card runs the same computation and links to `/members?idonei=1` — the numbers must agree.

- **`/members/criteria`** (criteria editor) and **`/members/new`** are sub-routes because of size (~60 number rows / a nine-field form buried the list). Both `requireRegistryEditor()` (404), reached only from the Registro chip strip, carry `from`. `addPerson`/`updateCriterion` stay in `app/members/actions.ts`; `updateCriterion` redirects back to criteria via `backToCriteria()` and revalidates both paths.
- **Eligibility computed over every active member, not the page**: one query on `member_overview` (active, `PORTAL_ONLY_ROLES` excluded, only needed columns), one on `person_rank_hours`, one on `promotion_criteria`. `idonei` applies `.in("id", eligibleIds)` **before** count and range; with nobody eligible, no query.
- **`promotionStatus()` in `frontend/utils/promotion.ts`** is the one place eligibility is decided (pure, unit-tested). The DB doesn't know eligibility. Don't duplicate it in SQL; the scaling path is moving the hour *estimate* into the DB.
- **Criteria row = what is required to REACH that grade**: `(blue,0)` = get blue; `(blue,3)` = blue's 3rd stripe. `min_time_at_rank_days` anchors on `rank_since` for `stripe = 0`, on `stripe_since` for `stripe > 0` (`20260918100000`). Backwards = everything reads wrong.
- **No `(black,1..4)` rows** (degrees out of scope); `nextStep()` returns `null`.
- **`min_hours` is clock hours**; `SESSION_LENGTH_HOURS` (`utils/hours.ts`) is the only conversion point. Lessons are 1h so it's `1`; the document, seeds and constant were divided by 1.5 together when this was confirmed. Time/age minimums untouched (IBJJF). Never convert elsewhere.
- **Hours counted from the current grade** (`person_rank_hours`, `lessons_since_rank`/`lessons_since_stripe`), not lifetime. Estimated opening balance anchored at `max(joined_at, anchor)`.
- **`promotion_criteria` readable by registry viewers only** (`can_view_registry()`) — DB policy, because the table tells a student how far they are.
- **Product rule: nothing a member can open states a remaining amount, a next-grade name, or a verdict.** Member dashboard adds only "ore al grado attuale" — a fact about the present.
- **`record_promotion()` is `security invoker`, never definer** (`20260918130000`); re-checks `can_edit_registry()`. Rejects future-dated, sideways/backward, stripes outside `0..4` (kids: `KID_MAX_STRIPES` = 3); accepts backdated. Belt change resets stripes to target and moves both dates; stripe alone moves only `stripe_since`.
- **Promotion can be deleted, never updated** (`20260918120000`, no update policy). `promoted_by` is `on delete set null`.
- **Suggestion follows a ladder** (next stripe under 4, belt at 4, nothing at black); the panel and `record_promotion()` accept any forward jump. Four-stripes-first is academy practice, binds only `nextStep()`.
- Panel's technical/behavioural reminders are **text from the `promotions` dictionary**, never a saved checklist.
- `t.promotions.hoursNote` stays visible text (tooltips don't exist on phones). Criteria and lesson counts coerced with `Number(...)` — PostgREST returns `numeric`/`bigint` as strings.
- Kebab has "Promuovi" for registry editors.

### Ladders, ages, children

- **IBJJF outranks community practice.** Black min age corrected 19→18 (`20260919000000`). 16 blue / 16 purple / 18 brown seeded by `20260919110000_kid_belt_promotion.sql`. **Missing birth date = failed check**, so blank birth dates now matter.
- **Two ladders sharing white**: `ADULT_BELTS`, `KID_BELTS` in `utils/supabase/profile.ts`. `BELT_ORDER` is **display order** (17 belts; roll call, belt chart) — never walk it to find a next grade. White is the only belt needing age to disambiguate; unknown age = adult.
- Kid belts have 3 degrees (DB-enforced); panel select still offers 0–4 (server-rendered, DB refuses).
- **Children are never in the queue — by design.** No criteria rows for kid belts (IBJJF sets no time/hours) → `no-criterion`; still promotable from the panel. **Don't seed them.** Nothing suggested past green/black (transition at 16 is the professor's call); `nextStep()` → `null`.
- **IBJJF reductions are not modelled** (schema lacks juvenile grades/competition results); app is stricter, instructor promotes manually. Don't special-case in `promotionStatus()`.
- **`promotion_criteria.notes` is the gym's field**, starts empty (`20260919120000` cleared provenance notes). Don't re-seed.
- Seeded stripe numbers are an **estimate** from a 2–4 month interval at 3 lessons/week, not from `belt-criteria.md`; the editor exists to correct them.
