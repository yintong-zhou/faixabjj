# Check-in near the gym — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member's self check-in succeeds only within 50 m of the gym's stored position, reached from the `/attendance` button or from a fixed printed QR that opens `/check-in`.

**Architecture:** The rule lives in Postgres: a `security definer` RPC `check_in()` computes the haversine distance and returns an outcome as jsonb; the direct-insert RLS policy is dropped in a second, separately applied migration. The browser reads the position only at the moment of check-in and sends it in the server-action request; nothing stores it. A manager page `/gym` sets the location through `set_gym_location()` and renders the printable QR as an SVG on the server.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), Next.js 16 App Router server actions + one client component per interaction, Tailwind v4, Vitest for pure `utils/`, npm package `qrcode`.

**Spec:** `docs/superpowers/specs/2026-09-25-gym-location-checkin-design.md`

## Global Constraints

- Radius **50 m**; accuracy worse than **100 m** (or missing) → `imprecise`. Constants live in `check_in()` only, commented.
- `check_in` outcomes are exactly: `ok`, `already`, `closed`, `location_needed`, `imprecise`, `too_far`; jsonb `{"result": <text>, "distance_m": <int|null>}`.
- Check order: profile + window (`closed`) → `already` → only if the gym has a location: `location_needed`, `imprecise`, `too_far`.
- A gym with no location: check-in with no distance check, and **the browser is not asked for the position**.
- The member's coordinates are never written to a table, a log line or an error message.
- Migrations are replay-safe (`create or replace`, `if not exists`, `drop … if exists`), named `20260926000000_gym_location_checkin.sql` and `20260926010000_drop_direct_checkin.sql`. **Never applied to a real project by an agent** — the user applies them by hand to `poksgledkecwviypspmi`, the second only after the deploy.
- Every new string in `it.ts`, `en.ts`, `pt-BR.ts` (Italian defines the type). URL paths in English: `/check-in`, `/gym`.
- Guards answer 404: `/check-in` uses `requireAdmin("/check-in")`, `/gym` uses `requireUserManager("/gym")`.
- DB error text never reaches the screen: `logDbError()` plus a generic message.
- Colours via semantic tokens only; layout works at phone width, no horizontal scroll.
- Commit on branch `feat/gym-location-checkin`, never on `main`. The user pushes and merges.
- Vitest covers `frontend/utils/` only. Run from `frontend/`: `npm test`, `npm run lint`, `npm run build`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Coordinates arrive as junk or half-sent** (`lat` set, `lng` empty; `"abc"`; `NaN`; latitude 200). Expect `location_needed` from the DB, never an exception or a stored value — pinned in Task 1 (T16 `p_lat = 200`) and Task 4 (`optionalNumber`).
2. **Double tap / double submit.** The second request must answer `already` shown as a success, never a raw `23505` or a generic failure — pinned in Task 1 (T16 second call) and Task 4 (`checkinMessage("already")` is `ok: true`).
3. **`/gym` vs `/gyms` prefix confusion.** The superadmin must still reach `/gyms/*`, must get 404 on `/gym`, and a logged-out visitor on `/gym` must be sent to login — pinned in Task 2 (`underPath` tests).
4. **Gym without a location.** Check-in must behave exactly as today and never trigger a permission prompt — pinned in Task 1 (T5 control on gym B, no location) and Task 5 (`needsLocation` false skips geolocation).
5. **Half-entered location in a form** (only latitude, comma decimal "45,46"). Latitude-only must be refused with the location message; a comma decimal must be accepted — pinned in Task 4 (`parseLocation` tests).

---

### Task 1: Database — location columns, `check_in()`, `set_gym_location()`, drop the direct insert

**Files:**
- Create: `supabase/migrations/20260926000000_gym_location_checkin.sql`
- Create: `supabase/migrations/20260926010000_drop_direct_checkin.sql`
- Modify: `supabase/tests/tenant-isolation.sql` (T5 block, lines ~257–289; new T16 block inserted right after T5, before the T13 comment)

**Interfaces:**
- Produces: `gym.latitude double precision null`, `gym.longitude double precision null`; `public.gym_distance_m(lat1, lng1, lat2, lng2) → double precision`; `public.check_in(p_session_id uuid, p_lat double precision default null, p_lng double precision default null, p_accuracy double precision default null) → jsonb`; `public.set_gym_location(p_lat double precision, p_lng double precision) → void` (42501 when not allowed, 23514 on an invalid pair).

- [ ] **Step 1: Write the failing tests** — in `supabase/tests/tenant-isolation.sql`, replace the whole T5 section (from the comment `-- T5: a2 cannot check in to a session of gym B.` through the second `rollback;` before `-- T13:`) with:

```sql
-- T5: a2 cannot check in to a session of gym B. Uses …05cc, not …05bb: its
-- window is open at whatever instant replay.sh runs (see Corso B above). The
-- positive control proves b2 (gym B, its own session, gym B has no location)
-- can check in to …05cc through check_in(), so the refusal that follows can
-- only be the gym.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
do $$ begin
  if public.check_in('00000000-0000-0000-0000-0000000005cc') ->> 'result' is distinct from 'ok' then
    raise exception 'FAIL T5: control failed — b2 could not check in to …05cc in their own gym: %',
      public.check_in('00000000-0000-0000-0000-0000000005cc');
  end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
do $$ begin
  if public.check_in('00000000-0000-0000-0000-0000000005cc') ->> 'result' is distinct from 'closed' then
    raise exception 'FAIL T5: a2 checked in to a session of gym B';
  end if;
  if exists (select 1 from public.attendance where session_id = '00000000-0000-0000-0000-0000000005cc') then
    raise exception 'FAIL T5: a2 wrote attendance on a session of gym B';
  end if;
end $$;
rollback;

-- T16: check-in near the gym. Gym B gets a position (Milan, Duomo) inside the
-- transaction, as postgres, then b2 checks in to the open session …05cc.
begin;
update public.gym set latitude = 45.4642, longitude = 9.1900 where id = current_setting('test.gym_b')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
do $$
declare
  v jsonb;
begin
  -- One degree of longitude on the equator is 111 195 m (R = 6 371 000 m).
  if abs(public.gym_distance_m(0, 0, 0, 1) - 111195) > 1 then
    raise exception 'FAIL T16: gym_distance_m(0,0,0,1) = %', public.gym_distance_m(0, 0, 0, 1);
  end if;

  -- The direct insert is gone: check_in() is the only way to mark yourself.
  begin
    insert into public.attendance (person_id, session_id, present, checked_in_by)
    values (public.current_person_id(), '00000000-0000-0000-0000-0000000005cc', true, 'self');
    raise exception 'FAIL T16: a member inserted their own attendance directly';
  exception when insufficient_privilege then null;
  end;

  v := public.check_in('00000000-0000-0000-0000-0000000005cc');
  if v ->> 'result' is distinct from 'location_needed' then
    raise exception 'FAIL T16: no coordinates, gym with a position: expected location_needed, got %', v;
  end if;

  v := public.check_in('00000000-0000-0000-0000-0000000005cc', 200, 9.19, 10);
  if v ->> 'result' is distinct from 'location_needed' then
    raise exception 'FAIL T16: latitude 200: expected location_needed, got %', v;
  end if;

  v := public.check_in('00000000-0000-0000-0000-0000000005cc', 45.4642, 9.19, 150);
  if v ->> 'result' is distinct from 'imprecise' then
    raise exception 'FAIL T16: accuracy 150 m: expected imprecise, got %', v;
  end if;

  v := public.check_in('00000000-0000-0000-0000-0000000005cc', 45.4642, 9.19, null);
  if v ->> 'result' is distinct from 'imprecise' then
    raise exception 'FAIL T16: no accuracy: expected imprecise, got %', v;
  end if;

  -- 0.001 degrees of latitude north: about 111 m.
  v := public.check_in('00000000-0000-0000-0000-0000000005cc', 45.4652, 9.19, 10);
  if v ->> 'result' is distinct from 'too_far'
     or (v ->> 'distance_m')::int not between 100 and 120 then
    raise exception 'FAIL T16: 111 m away: expected too_far with distance ~111, got %', v;
  end if;

  -- 0.0002 degrees north: about 22 m.
  v := public.check_in('00000000-0000-0000-0000-0000000005cc', 45.4644, 9.19, 20);
  if v ->> 'result' is distinct from 'ok' then
    raise exception 'FAIL T16: 22 m away: expected ok, got %', v;
  end if;

  v := public.check_in('00000000-0000-0000-0000-0000000005cc', 45.4644, 9.19, 20);
  if v ->> 'result' is distinct from 'already' then
    raise exception 'FAIL T16: second check-in: expected already, got %', v;
  end if;

  if (select count(*) from public.attendance
       where session_id = '00000000-0000-0000-0000-0000000005cc'
         and person_id = public.current_person_id()
         and present and checked_in_by = 'self') <> 1 then
    raise exception 'FAIL T16: expected exactly one self check-in row for b2';
  end if;

  -- The undo policy is untouched.
  delete from public.attendance
   where session_id = '00000000-0000-0000-0000-0000000005cc' and person_id = public.current_person_id();
  if found is false then
    raise exception 'FAIL T16: b2 could not undo their own check-in';
  end if;
end $$;
rollback;

-- T16: set_gym_location(). A student is refused; the manager of gym B sets
-- gym B only; a half pair is refused by the constraint.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
do $$ begin
  begin
    perform public.set_gym_location(45.1, 9.1);
    raise exception 'FAIL T16: a student set the gym location';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$ begin
  perform public.set_gym_location(45.1, 9.1);
  if (select latitude from public.gym where id = current_setting('test.gym_b')::uuid) is distinct from 45.1 then
    raise exception 'FAIL T16: the manager of gym B could not set its location';
  end if;
  begin
    perform public.set_gym_location(45.1, null);
    raise exception 'FAIL T16: a latitude without a longitude was stored';
  exception when check_violation then null;
  end;
  perform public.set_gym_location(null, null);
  if (select latitude from public.gym where id = current_setting('test.gym_b')::uuid) is not null then
    raise exception 'FAIL T16: null, null did not clear the location';
  end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.set_gym_location(1, 1);
reset role;
do $$ begin
  if (select latitude from public.gym where id = current_setting('test.gym_b')::uuid) is not null then
    raise exception 'FAIL T16: the manager of gym A changed the location of gym B';
  end if;
  if (select latitude from public.gym where id = current_setting('test.gym_a')::uuid) is distinct from 1 then
    raise exception 'FAIL T16: the manager of gym A could not set their own location';
  end if;
end $$;
rollback;
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (Bash, repo root): `bash supabase/tests/replay.sh --isolation`
Expected: FAIL at T5 with `function public.check_in(unknown) does not exist`.

- [ ] **Step 3: Write `supabase/migrations/20260926000000_gym_location_checkin.sql`**

```sql
-- Check-in near the gym (spec: docs/superpowers/specs/2026-09-25-gym-location-checkin-design.md).
--
-- A gym may have a position. When it does, a member's self check-in succeeds
-- only within 50 m of it. The browser reports the position; the server cannot
-- verify it, so this stops the lazy check-in from home, not a determined
-- cheat — the instructor's roll call stays the authority.
--
-- Compatible with the app deployed before it: the direct-insert policy
-- "members can check themselves in" is dropped only by 20260926010000,
-- applied after the new app is live.

alter table public.gym add column if not exists latitude double precision;
alter table public.gym add column if not exists longitude double precision;

-- Both or neither. Spelled out: with a plain `between` a null longitude makes
-- the check null, and a null check passes.
alter table public.gym drop constraint if exists gym_location_valid;
alter table public.gym add constraint gym_location_valid check (
  (latitude is null and longitude is null)
  or (
    latitude is not null and longitude is not null
    and latitude between -90 and 90
    and longitude between -180 and 180
  )
);

-- Great-circle distance in metres (haversine, mean Earth radius 6 371 000 m).
-- least(1, …) keeps rounding from pushing asin outside its domain.
create or replace function public.gym_distance_m(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
strict
set search_path = ''
as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

grant execute on function public.gym_distance_m(double precision, double precision, double precision, double precision) to authenticated;

-- The one way a member marks themselves present. Answers an outcome instead of
-- raising, so the app can say what to do next. The coordinates are compared
-- and dropped: they are written nowhere and never appear in an error.
create or replace function public.check_in(
  p_session_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- Radius around the gym's position within which a check-in is accepted.
  max_distance_m constant double precision := 50;
  -- A fix less precise than this cannot tell "in the gym" from "next street".
  max_accuracy_m constant double precision := 100;
  v_person uuid := public.current_person_id();
  v_gym_lat double precision;
  v_gym_lng double precision;
  v_distance double precision;
begin
  -- session_checkin_open() is false for another gym's session, a suspended
  -- gym and a caller with no gym (20260925030000).
  if v_person is null or p_session_id is null or not public.session_checkin_open(p_session_id) then
    return jsonb_build_object('result', 'closed', 'distance_m', null);
  end if;

  if exists (
    select 1 from public.attendance a
    where a.person_id = v_person and a.session_id = p_session_id
  ) then
    return jsonb_build_object('result', 'already', 'distance_m', null);
  end if;

  select g.latitude, g.longitude into v_gym_lat, v_gym_lng
  from public.gym g
  where g.id = public.current_gym_id();

  if v_gym_lat is not null then
    if p_lat is null or p_lng is null
       or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      return jsonb_build_object('result', 'location_needed', 'distance_m', null);
    end if;
    if p_accuracy is null or p_accuracy < 0 or p_accuracy > max_accuracy_m then
      return jsonb_build_object('result', 'imprecise', 'distance_m', null);
    end if;
    v_distance := public.gym_distance_m(v_gym_lat, v_gym_lng, p_lat, p_lng);
    if v_distance > max_distance_m then
      return jsonb_build_object('result', 'too_far', 'distance_m', round(v_distance)::int);
    end if;
  end if;

  -- Same values the direct insert used; gym_id comes from the gym_scope trigger.
  begin
    insert into public.attendance (person_id, session_id, present, checked_in_by)
    values (v_person, p_session_id, true, 'self');
  exception when unique_violation then
    -- Two taps, two requests: the second finds the first.
    return jsonb_build_object('result', 'already', 'distance_m', null);
  end;

  return jsonb_build_object(
    'result', 'ok',
    'distance_m', case when v_distance is null then null else round(v_distance)::int end
  );
end;
$$;

revoke execute on function public.check_in(uuid, double precision, double precision, double precision) from public, anon;
grant execute on function public.check_in(uuid, double precision, double precision, double precision) to authenticated;

-- The manager has no update on gym (only the superadmin does, "platform admins
-- manage gyms"). This changes the two location columns of the caller's own
-- gym and nothing else. null, null clears the position; a half pair fails the
-- gym_location_valid check (23514).
create or replace function public.set_gym_location(p_lat double precision, p_lng double precision)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_gym uuid := public.current_gym_id();
begin
  if v_gym is null or not public.can_manage_users() then
    raise exception 'not allowed to set the gym location' using errcode = '42501';
  end if;

  update public.gym set latitude = p_lat, longitude = p_lng where id = v_gym;
end;
$$;

revoke execute on function public.set_gym_location(double precision, double precision) from public, anon;
grant execute on function public.set_gym_location(double precision, double precision) to authenticated;
```

- [ ] **Step 4: Write `supabase/migrations/20260926010000_drop_direct_checkin.sql`**

```sql
-- Apply only AFTER the app that calls check_in() is deployed: the app before
-- it checks members in with a direct insert, which this policy allowed.
--
-- From here on a member marks themselves present only through check_in()
-- (20260926000000), which enforces the distance from the gym. Staff keep
-- "class managers can insert attendance" for the roll call, and members keep
-- "members can undo their own check-in".
drop policy if exists "members can check themselves in" on public.attendance;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash supabase/tests/replay.sh --isolation`
Expected: both passes replay every migration, then `tenant isolation: all checks passed` and `OK`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260926000000_gym_location_checkin.sql supabase/migrations/20260926010000_drop_direct_checkin.sql supabase/tests/tenant-isolation.sql
git commit -m "feat(db): check_in() enforces the distance from the gym"
```

---

### Task 2: Exact route prefixes, `/check-in` and `/gym` protected

**Files:**
- Create: `frontend/utils/paths.ts`
- Create: `frontend/utils/paths.test.ts`
- Modify: `frontend/utils/supabase/proxy.ts` (`PROTECTED_PREFIXES` and the `isProtected` line)
- Modify: `frontend/utils/supabase/require-admin.ts:108` (the `PLATFORM_PATHS` check)

**Interfaces:**
- Produces: `underPath(pathname: string, prefix: string): boolean`.

- [ ] **Step 1: Write the failing test** — `frontend/utils/paths.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { underPath } from "./paths";

describe("underPath", () => {
  it("matches the path itself and anything below it", () => {
    expect(underPath("/gyms", "/gyms")).toBe(true);
    expect(underPath("/gyms/new", "/gyms")).toBe(true);
    expect(underPath("/check-in", "/check-in")).toBe(true);
  });

  it("does not confuse /gym with /gyms", () => {
    expect(underPath("/gyms", "/gym")).toBe(false);
    expect(underPath("/gyms/abc", "/gym")).toBe(false);
    expect(underPath("/gym", "/gyms")).toBe(false);
    expect(underPath("/gym", "/gym")).toBe(true);
  });

  it("does not match a longer segment", () => {
    expect(underPath("/membersx", "/members")).toBe(false);
    expect(underPath("/", "/members")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `frontend/`): `npm test -- paths`
Expected: FAIL, cannot resolve `./paths`.

- [ ] **Step 3: Write `frontend/utils/paths.ts`**

```ts
// A route prefix covers the path itself and the paths below it, never a
// longer segment: `/gym` (a manager's gym page) must not match `/gyms` (the
// superadmin's list), which a bare startsWith would.
export function underPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
```

- [ ] **Step 4: Use it in the proxy and the guard**

In `frontend/utils/supabase/proxy.ts` add `import { underPath } from "@/utils/paths";`, add `"/check-in"` and `"/gym"` to `PROTECTED_PREFIXES` (after `"/gyms"`), and replace

```ts
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
```
with
```ts
  const isProtected = PROTECTED_PREFIXES.some((prefix) => underPath(pathname, prefix));
```

In `frontend/utils/supabase/require-admin.ts` add `import { underPath } from "@/utils/paths";` and replace

```ts
  if (access.isPlatformAdmin && !PLATFORM_PATHS.some((p) => path.startsWith(p))) {
```
with
```ts
  if (access.isPlatformAdmin && !PLATFORM_PATHS.some((p) => underPath(path, p))) {
```

Check first with `grep -rn "requireAdmin(\|requireUserManager(\|requirePlatformAdmin(\|requireClassManager(\|requireRegistry" frontend/app` that no caller passes a path with a query string (`?`); if one does, strip the query at that call site instead of changing `underPath`.

- [ ] **Step 5: Run tests, lint, build**

Run (from `frontend/`): `npm test && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/utils/paths.ts frontend/utils/paths.test.ts frontend/utils/supabase/proxy.ts frontend/utils/supabase/require-admin.ts
git commit -m "fix(routes): match route prefixes by segment; protect /check-in and /gym"
```

---

### Task 3: Strings in three languages and the privacy paragraph

**Files:**
- Modify: `frontend/utils/i18n/dictionaries/it.ts`, `en.ts`, `pt-BR.ts`
- Modify: `frontend/app/privacy/page.tsx` (`UPDATED_ON`)

**Interfaces:**
- Produces: `t.checkin.*`, `t.myGym.*`, `t.account.myGym`, `t.gyms.fields.latitude|longitude|locationHelp|openMap`, `t.gyms.invalid.location`. Existing keys reused unchanged: `t.msg.checkinRecorded`, `t.msg.alreadyPresent`, `t.msg.checkinClosed`, `t.msg.checkinFailed`.

- [ ] **Step 1: Add the Italian strings** to `it.ts`.

In `account`, after `manageMembers`:
```ts
    myGym: "Posizione della palestra e QR per il check-in →",
```

In `gyms.fields`, after `lessonsPerWeek`:
```ts
      latitude: "Latitudine",
      longitude: "Longitudine",
      locationHelp:
        "Facoltative. Con la posizione impostata, il check-in degli allievi riesce solo entro 50 m dalla palestra. Da Google Maps: tasto destro sul punto e copia le coordinate.",
      openMap: "Controlla sulla mappa ↗",
```

In `gyms.invalid`, after `lessonsPerWeek`:
```ts
      location:
        "Latitudine e longitudine vanno indicate entrambe, come numeri: latitudine tra −90 e 90, longitudine tra −180 e 180.",
```

New top-level sections, after `presenze` (keep this order in all three files):
```ts
  checkin: {
    title: "Check-in",
    lead: "Segnati presente alla lezione in corso. Il check-in riesce solo in palestra.",
    noOpenSession: "Nessuna lezione è aperta al check-in adesso.",
    toCalendar: "Vai al calendario",
    staffUseRollCall: "Lo staff registra le presenze con l'appello, dal calendario.",
    locating: "Rilevo la posizione…",
    sending: "Invio…",
    retry: "Riprova",
    locationNeeded: "In questa palestra il check-in richiede la posizione del telefono. Riprova e consenti l'accesso alla posizione.",
    imprecise: "La posizione è troppo imprecisa. Spostati vicino all'ingresso o a una finestra e riprova.",
    tooFar: (m: number) =>
      `Risulti a circa ${m} m dalla palestra: il check-in si fa solo in palestra, entro 50 m.`,
    geo: {
      denied:
        "Il browser non ha il permesso di leggere la posizione. Riattivalo nelle impostazioni del sito, oppure chiedi all'istruttore di segnarti con l'appello.",
      unavailable: "Posizione non disponibile. Controlla che la localizzazione del telefono sia attiva e riprova.",
      timeout: "La posizione non è arrivata in tempo. Riprova.",
      unsupported: "Questo browser non fornisce la posizione. Chiedi all'istruttore di segnarti con l'appello.",
    },
  },

  myGym: {
    title: "La mia palestra",
    lead: "La posizione della palestra e il QR code per il check-in.",
    locationSection: "Posizione",
    locationHelp:
      "Con la posizione impostata, il check-in degli allievi riesce solo entro 50 m da questo punto. Il modo più preciso: dalla palestra, premi «Usa la mia posizione attuale».",
    noLocation: "Posizione non impostata: il check-in funziona da qualsiasi luogo, durante la finestra della lezione.",
    useCurrent: "Usa la mia posizione attuale",
    locating: "Rilevo la posizione…",
    save: "Salva posizione",
    clear: "Rimuovi posizione",
    qrSection: "QR code per il check-in",
    qrHelp:
      "Stampalo e appendilo in palestra. Inquadrandolo si apre la pagina del check-in, con lo stesso controllo della posizione del pulsante.",
    qrCaption: "Inquadra per il check-in",
    print: "Stampa",
    saved: "Posizione salvata.",
    cleared: "Posizione rimossa.",
    failed: "Operazione non riuscita. Riprova.",
  },
```

In `privacy.sections[1].paragraphs` (heading "2. Quali dati trattiamo"), insert after the "Dati di frequenza" paragraph:
```ts
          "Posizione del dispositivo: se la palestra ha impostato la propria posizione, al momento del check-in il browser chiede quella del telefono. Serve solo a verificare di trovarsi entro 50 m dalla palestra: viene confrontata e scartata, senza essere salvata né registrata nei log. Il browser chiede il permesso secondo le sue impostazioni; rifiutarlo impedisce solo il check-in da sé, perché l'istruttore può sempre registrare la presenza con l'appello.",
```

- [ ] **Step 2: Add the English strings** to `en.ts`, same keys and positions.

```ts
    myGym: "Gym location and check-in QR →",
```
```ts
      latitude: "Latitude",
      longitude: "Longitude",
      locationHelp:
        "Optional. With a location set, members can check in only within 50 m of the gym. In Google Maps: right-click the spot and copy the coordinates.",
      openMap: "Check on the map ↗",
```
```ts
      location:
        "Enter both latitude and longitude as numbers: latitude between −90 and 90, longitude between −180 and 180.",
```
```ts
  checkin: {
    title: "Check-in",
    lead: "Mark yourself present at the current lesson. Check-in works only at the gym.",
    noOpenSession: "No lesson is open for check-in right now.",
    toCalendar: "Go to the calendar",
    staffUseRollCall: "Staff record attendance with the roll call, from the calendar.",
    locating: "Finding your location…",
    sending: "Sending…",
    retry: "Try again",
    locationNeeded: "At this gym check-in needs your phone's location. Try again and allow location access.",
    imprecise: "Your location is too imprecise. Move near the entrance or a window and try again.",
    tooFar: (m: number) =>
      `You appear to be about ${m} m from the gym: check-in works only at the gym, within 50 m.`,
    geo: {
      denied:
        "The browser is not allowed to read your location. Turn it back on in the site settings, or ask the instructor to mark you in the roll call.",
      unavailable: "Location unavailable. Check that location services are on and try again.",
      timeout: "Your location did not arrive in time. Try again.",
      unsupported: "This browser does not provide a location. Ask the instructor to mark you in the roll call.",
    },
  },

  myGym: {
    title: "My gym",
    lead: "The gym's location and the check-in QR code.",
    locationSection: "Location",
    locationHelp:
      "With a location set, members can check in only within 50 m of this point. Most precise: at the gym, press “Use my current location”.",
    noLocation: "No location set: check-in works from anywhere, during the lesson's window.",
    useCurrent: "Use my current location",
    locating: "Finding your location…",
    save: "Save location",
    clear: "Remove location",
    qrSection: "Check-in QR code",
    qrHelp:
      "Print it and put it up at the gym. Scanning it opens the check-in page, with the same location check as the button.",
    qrCaption: "Scan to check in",
    print: "Print",
    saved: "Location saved.",
    cleared: "Location removed.",
    failed: "Something went wrong. Try again.",
  },
```
Privacy paragraph (section 2, after the attendance-data paragraph):
```ts
          "Device location: if the gym has set its location, at check-in the browser asks for your phone's. It is used only to check that you are within 50 m of the gym: it is compared and discarded, never stored or written to logs. The browser asks for permission according to its settings; refusing only prevents checking yourself in, since the instructor can always record your attendance in the roll call.",
```

- [ ] **Step 3: Add the Brazilian Portuguese strings** to `pt-BR.ts`, same keys and positions.

```ts
    myGym: "Localização da academia e QR de check-in →",
```
```ts
      latitude: "Latitude",
      longitude: "Longitude",
      locationHelp:
        "Opcionais. Com a localização definida, os alunos só fazem check-in a até 50 m da academia. No Google Maps: clique com o botão direito no ponto e copie as coordenadas.",
      openMap: "Conferir no mapa ↗",
```
```ts
      location:
        "Informe latitude e longitude, as duas, como números: latitude entre −90 e 90, longitude entre −180 e 180.",
```
```ts
  checkin: {
    title: "Check-in",
    lead: "Marque presença na aula em andamento. O check-in só funciona na academia.",
    noOpenSession: "Nenhuma aula está aberta para check-in agora.",
    toCalendar: "Ir para o calendário",
    staffUseRollCall: "A equipe registra as presenças pela chamada, no calendário.",
    locating: "Obtendo sua localização…",
    sending: "Enviando…",
    retry: "Tentar de novo",
    locationNeeded: "Nesta academia o check-in precisa da localização do celular. Tente de novo e permita o acesso à localização.",
    imprecise: "A localização está imprecisa demais. Vá para perto da entrada ou de uma janela e tente de novo.",
    tooFar: (m: number) =>
      `Você parece estar a cerca de ${m} m da academia: o check-in só funciona na academia, a até 50 m.`,
    geo: {
      denied:
        "O navegador não tem permissão para ler a localização. Reative-a nas configurações do site ou peça ao instrutor para marcar você na chamada.",
      unavailable: "Localização indisponível. Verifique se a localização do celular está ativada e tente de novo.",
      timeout: "A localização não chegou a tempo. Tente de novo.",
      unsupported: "Este navegador não fornece a localização. Peça ao instrutor para marcar você na chamada.",
    },
  },

  myGym: {
    title: "Minha academia",
    lead: "A localização da academia e o QR code de check-in.",
    locationSection: "Localização",
    locationHelp:
      "Com a localização definida, os alunos só fazem check-in a até 50 m deste ponto. O mais preciso: na academia, toque em “Usar minha localização atual”.",
    noLocation: "Localização não definida: o check-in funciona de qualquer lugar, durante a janela da aula.",
    useCurrent: "Usar minha localização atual",
    locating: "Obtendo sua localização…",
    save: "Salvar localização",
    clear: "Remover localização",
    qrSection: "QR code de check-in",
    qrHelp:
      "Imprima e afixe na academia. Ao escaneá-lo abre a página de check-in, com a mesma verificação de localização do botão.",
    qrCaption: "Escaneie para fazer check-in",
    print: "Imprimir",
    saved: "Localização salva.",
    cleared: "Localização removida.",
    failed: "Não foi possível concluir. Tente de novo.",
  },
```
Privacy paragraph (section 2, after the attendance-data paragraph):
```ts
          "Localização do dispositivo: se a academia definiu a própria localização, no momento do check-in o navegador pede a do celular. Ela serve apenas para verificar que você está a até 50 m da academia: é comparada e descartada, sem ser salva nem registrada em logs. O navegador pede permissão conforme as suas configurações; recusar impede apenas o check-in por conta própria, pois o instrutor sempre pode registrar a presença pela chamada.",
```

- [ ] **Step 4: Bump the privacy date** — in `frontend/app/privacy/page.tsx` set `const UPDATED_ON = "2026-09-24";` (the day this text changes; use the actual date of the commit if later).

- [ ] **Step 5: Type-check and lint**

Run (from `frontend/`): `npx tsc --noEmit && npm run lint`
Expected: pass (en and pt-BR are typed as `Dictionary`, so a missing key fails here).

- [ ] **Step 6: Commit**

```bash
git add frontend/utils/i18n/dictionaries frontend/app/privacy/page.tsx
git commit -m "feat(i18n): strings for check-in near the gym; privacy notice on device location"
```

---

### Task 4: Pure helpers — check-in outcomes, geolocation errors, location parsing

**Files:**
- Create: `frontend/utils/checkin.ts`
- Create: `frontend/utils/checkin.test.ts`
- Modify: `frontend/utils/gyms.ts`
- Modify: `frontend/utils/gyms.test.ts`

**Interfaces:**
- Consumes: `Dictionary` (Task 3 keys `t.checkin.*`, `t.msg.*`).
- Produces:
  - `type CheckinResult = "ok" | "already" | "closed" | "location_needed" | "imprecise" | "too_far"`
  - `type CheckinOutcome = { result: CheckinResult; distanceM: number | null }`
  - `parseCheckinOutcome(data: unknown): CheckinOutcome | null`
  - `checkinMessage(outcome: CheckinOutcome, t: Dictionary): { ok: boolean; text: string }`
  - `type GeoFailure = "denied" | "unavailable" | "timeout" | "unsupported"`; `geoFailure(code: number): GeoFailure`
  - `optionalNumber(raw: unknown): number | null`
  - `mapUrl(latitude: number, longitude: number): string`
  - in `gyms.ts`: `type GymLocation = { latitude: number; longitude: number }`; `parseLocation(rawLat: unknown, rawLng: unknown): { ok: true; value: GymLocation | null } | { ok: false }`; `GymForm` gains `latitude: number | null; longitude: number | null`; `GymFormError` gains `"location"`; `GymFormInput` gains optional `latitude`, `longitude`.

- [ ] **Step 1: Write the failing tests** — `frontend/utils/checkin.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { it as itDict } from "./i18n/dictionaries/it";
import {
  checkinMessage,
  geoFailure,
  mapUrl,
  optionalNumber,
  parseCheckinOutcome,
} from "./checkin";

describe("parseCheckinOutcome", () => {
  it("reads the six known results", () => {
    for (const result of ["ok", "already", "closed", "location_needed", "imprecise", "too_far"]) {
      expect(parseCheckinOutcome({ result, distance_m: null })).toEqual({ result, distanceM: null });
    }
    expect(parseCheckinOutcome({ result: "too_far", distance_m: 111 })).toEqual({
      result: "too_far",
      distanceM: 111,
    });
  });

  it("refuses anything else", () => {
    expect(parseCheckinOutcome(null)).toBeNull();
    expect(parseCheckinOutcome("ok")).toBeNull();
    expect(parseCheckinOutcome({ result: "maybe" })).toBeNull();
    expect(parseCheckinOutcome({})).toBeNull();
  });
});

describe("checkinMessage", () => {
  it("treats ok and already as success", () => {
    expect(checkinMessage({ result: "ok", distanceM: 12 }, itDict)).toEqual({
      ok: true,
      text: itDict.msg.checkinRecorded,
    });
    expect(checkinMessage({ result: "already", distanceM: null }, itDict)).toEqual({
      ok: true,
      text: itDict.msg.alreadyPresent,
    });
  });

  it("maps every refusal to its own message", () => {
    expect(checkinMessage({ result: "closed", distanceM: null }, itDict)).toEqual({
      ok: false,
      text: itDict.msg.checkinClosed,
    });
    expect(checkinMessage({ result: "location_needed", distanceM: null }, itDict).text).toBe(
      itDict.checkin.locationNeeded,
    );
    expect(checkinMessage({ result: "imprecise", distanceM: null }, itDict).text).toBe(
      itDict.checkin.imprecise,
    );
    expect(checkinMessage({ result: "too_far", distanceM: 240 }, itDict)).toEqual({
      ok: false,
      text: itDict.checkin.tooFar(240),
    });
  });
});

describe("geoFailure", () => {
  it("maps GeolocationPositionError codes", () => {
    expect(geoFailure(1)).toBe("denied");
    expect(geoFailure(2)).toBe("unavailable");
    expect(geoFailure(3)).toBe("timeout");
    expect(geoFailure(99)).toBe("unavailable");
  });
});

describe("optionalNumber", () => {
  it("reads a finite number and nothing else", () => {
    expect(optionalNumber("45.4642")).toBe(45.4642);
    expect(optionalNumber(" -9.5 ")).toBe(-9.5);
    expect(optionalNumber("")).toBeNull();
    expect(optionalNumber("abc")).toBeNull();
    expect(optionalNumber("NaN")).toBeNull();
    expect(optionalNumber("Infinity")).toBeNull();
    expect(optionalNumber(null)).toBeNull();
    expect(optionalNumber(undefined)).toBeNull();
  });
});

describe("mapUrl", () => {
  it("points OpenStreetMap at the spot", () => {
    expect(mapUrl(45.4642, 9.19)).toBe(
      "https://www.openstreetmap.org/?mlat=45.4642&mlon=9.19#map=18/45.4642/9.19",
    );
  });
});
```

Append to `frontend/utils/gyms.test.ts` (and add `parseLocation` to its import):

```ts
describe("parseLocation", () => {
  it("accepts an empty pair as no location", () => {
    expect(parseLocation("", "")).toEqual({ ok: true, value: null });
    expect(parseLocation(null, undefined)).toEqual({ ok: true, value: null });
    expect(parseLocation("  ", " ")).toEqual({ ok: true, value: null });
  });

  it("accepts a valid pair, with a dot or a comma", () => {
    expect(parseLocation("45.4642", "9.19")).toEqual({
      ok: true,
      value: { latitude: 45.4642, longitude: 9.19 },
    });
    expect(parseLocation("45,4642", " 9,19 ")).toEqual({
      ok: true,
      value: { latitude: 45.4642, longitude: 9.19 },
    });
    expect(parseLocation("-90", "180")).toEqual({ ok: true, value: { latitude: -90, longitude: 180 } });
  });

  it("refuses half a pair, text and out-of-range values", () => {
    expect(parseLocation("45.46", "")).toEqual({ ok: false });
    expect(parseLocation("", "9.19")).toEqual({ ok: false });
    expect(parseLocation("abc", "9.19")).toEqual({ ok: false });
    expect(parseLocation("90.1", "9")).toEqual({ ok: false });
    expect(parseLocation("45", "-180.5")).toEqual({ ok: false });
  });
});

describe("parseGymForm location", () => {
  it("carries the location, or null when left empty", () => {
    const parsed = parseGymForm({ ...valid, latitude: "45.4642", longitude: "9.19" }, TODAY);
    expect(parsed.ok && [parsed.value.latitude, parsed.value.longitude]).toEqual([45.4642, 9.19]);
    const empty = parseGymForm(valid, TODAY);
    expect(empty.ok && [empty.value.latitude, empty.value.longitude]).toEqual([null, null]);
  });

  it("refuses half a location", () => {
    expect(parseGymForm({ ...valid, latitude: "45.46", longitude: "" }, TODAY)).toEqual({
      ok: false,
      error: "location",
    });
  });
});
```

And update the existing expectation in `"accepts a valid form and trims the name"` to include `latitude: null, longitude: null` in `value`.

- [ ] **Step 2: Run them to verify they fail**

Run (from `frontend/`): `npm test -- checkin gyms`
Expected: FAIL — `./checkin` not found, `parseLocation` not exported.

- [ ] **Step 3: Write `frontend/utils/checkin.ts`**

```ts
// The member's check-in, the parts that are pure: reading what check_in()
// answers, choosing the message, and naming a geolocation failure. The rule
// itself (distance, precision, window) lives in the database, not here.

import type { Dictionary } from "./i18n/dictionaries/it";

export type CheckinResult =
  | "ok"
  | "already"
  | "closed"
  | "location_needed"
  | "imprecise"
  | "too_far";

export type CheckinOutcome = { result: CheckinResult; distanceM: number | null };

const RESULTS: readonly string[] = [
  "ok",
  "already",
  "closed",
  "location_needed",
  "imprecise",
  "too_far",
];

// check_in() returns jsonb {result, distance_m}. Anything else — a missing
// migration, a changed function — is a failure the caller must log, never a
// result to guess at.
export function parseCheckinOutcome(data: unknown): CheckinOutcome | null {
  if (!data || typeof data !== "object") return null;
  const { result, distance_m } = data as { result?: unknown; distance_m?: unknown };
  if (typeof result !== "string" || !RESULTS.includes(result)) return null;
  return {
    result: result as CheckinResult,
    distanceM: typeof distance_m === "number" && Number.isFinite(distance_m) ? distance_m : null,
  };
}

// "already" counts as success: a second tap finding the first is the member
// being present, not an error to alarm them with.
export function checkinMessage(
  outcome: CheckinOutcome,
  t: Dictionary,
): { ok: boolean; text: string } {
  switch (outcome.result) {
    case "ok":
      return { ok: true, text: t.msg.checkinRecorded };
    case "already":
      return { ok: true, text: t.msg.alreadyPresent };
    case "closed":
      return { ok: false, text: t.msg.checkinClosed };
    case "location_needed":
      return { ok: false, text: t.checkin.locationNeeded };
    case "imprecise":
      return { ok: false, text: t.checkin.imprecise };
    case "too_far":
      return {
        ok: false,
        // The function always sends the distance with too_far; 0 would only
        // show if it did not, and still reads as "too far".
        text: t.checkin.tooFar(outcome.distanceM ?? 0),
      };
  }
}

export type GeoFailure = "denied" | "unavailable" | "timeout" | "unsupported";

// GeolocationPositionError: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE,
// 3 TIMEOUT. An unknown code is treated as "unavailable": retrying is the
// right advice for it.
export function geoFailure(code: number): GeoFailure {
  if (code === 1) return "denied";
  if (code === 3) return "timeout";
  return "unavailable";
}

// A number from a form field. Empty or not finite means "not sent": the
// database then answers location_needed instead of receiving NaN.
export function optionalNumber(raw: unknown): number | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

// A link, not an embed: no third-party script, no cookie.
export function mapUrl(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;
}
```

- [ ] **Step 4: Extend `frontend/utils/gyms.ts`**

Change the types:
```ts
export type GymFormError =
  | "name"
  | "timezone"
  | "trackingStartedOn"
  | "sessionLengthHours"
  | "lessonsPerWeek"
  | "location";

export type GymForm = {
  name: string;
  timezone: string;
  trackingStartedOn: string;
  sessionLengthHours: number;
  lessonsPerWeek: number;
  latitude: number | null;
  longitude: number | null;
};

export type GymFormInput = Record<
  "name" | "timezone" | "tracking_started_on" | "session_length_hours" | "lessons_per_week",
  string | null | undefined
> &
  Partial<Record<"latitude" | "longitude", string | null | undefined>>;
```

Add, before `parseGymForm`:
```ts
export type GymLocation = { latitude: number; longitude: number };

const trimmed = (raw: unknown) => (typeof raw === "string" ? raw.trim() : "");

// Both or neither. A comma is read as the decimal point, the way an Italian or
// Brazilian keyboard types it; the database re-checks the range
// (gym_location_valid).
export function parseLocation(
  rawLat: unknown,
  rawLng: unknown,
): { ok: true; value: GymLocation | null } | { ok: false } {
  const lat = trimmed(rawLat);
  const lng = trimmed(rawLng);
  if (lat === "" && lng === "") return { ok: true, value: null };
  if (lat === "" || lng === "") return { ok: false };

  const latitude = Number(lat.replace(",", "."));
  const longitude = Number(lng.replace(",", "."));
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return { ok: false };
  }
  return { ok: true, value: { latitude, longitude } };
}
```

In `parseGymForm`, after the `lessonsPerWeek` check:
```ts
  const location = parseLocation(input.latitude, input.longitude);
  if (!location.ok) return { ok: false, error: "location" };
```
and return:
```ts
  return {
    ok: true,
    value: {
      name,
      timezone,
      trackingStartedOn,
      sessionLengthHours,
      lessonsPerWeek,
      latitude: location.value?.latitude ?? null,
      longitude: location.value?.longitude ?? null,
    },
  };
```

- [ ] **Step 5: Run tests, type-check, lint**

Run (from `frontend/`): `npm test && npx tsc --noEmit && npm run lint`
Expected: pass. (`app/gyms/actions.ts` still compiles: it reads `value.*` fields it already knew; the new fields are used in Task 7.)

- [ ] **Step 6: Commit**

```bash
git add frontend/utils/checkin.ts frontend/utils/checkin.test.ts frontend/utils/gyms.ts frontend/utils/gyms.test.ts
git commit -m "feat(utils): check-in outcomes, geolocation errors and gym location parsing"
```

---

### Task 5: Gym settings carry the location; `/attendance` checks in through `check_in()`

**Files:**
- Modify: `frontend/utils/supabase/gym.ts`
- Modify: `frontend/app/attendance/actions.ts` (`checkIn`, lines ~109–155)
- Create: `frontend/app/attendance/checkin-button.tsx`
- Modify: `frontend/app/attendance/page.tsx` (`CheckinControl` and its callers)

**Interfaces:**
- Consumes: `parseCheckinOutcome`, `checkinMessage`, `optionalNumber`, `geoFailure`, `GeoFailure` (Task 4); `t.checkin.*` (Task 3); RPC `check_in` (Task 1).
- Produces:
  - `GymSettings.latitude: number | null`, `GymSettings.longitude: number | null`
  - server action `checkIn(formData: FormData)` reading `session_id`, `_query`, `_return` (`"/check-in"` or anything else → `/attendance`), `lat`, `lng`, `accuracy`
  - client component `CheckinButton` with props `{ sessionId: string; query: string; returnTo: "/attendance" | "/check-in"; needsLocation: boolean; auto?: boolean; disabled?: boolean; labels: CheckinButtonLabels; className?: string }` and `type CheckinButtonLabels = { checkIn: string; locating: string; sending: string; retry: string; geo: Record<GeoFailure, string> }`

- [ ] **Step 1: Location in the gym settings** — in `frontend/utils/supabase/gym.ts`:

```ts
export type GymSettings = HoursSettings & {
  id: string;
  name: string;
  status: GymStatus;
  timezone: string;
  // Both null, or both set (gym_location_valid).
  latitude: number | null;
  longitude: number | null;
};

export const GYM_COLUMNS =
  "id, name, status, timezone, tracking_started_on, session_length_hours, lessons_per_week, latitude, longitude, created_at";
```
add `latitude: number | null; longitude: number | null;` to `GymRow`, and in `toGymSettings` add
```ts
    latitude: row.latitude,
    longitude: row.longitude,
```

- [ ] **Step 2: Rewrite `checkIn`** in `frontend/app/attendance/actions.ts`. Add imports:
```ts
import { checkinMessage, optionalNumber, parseCheckinOutcome } from "@/utils/checkin";
```
Replace the "Student check-in" comment block and the `checkIn` function with:

```ts
// ---------------------------------------------------------------------------
// Student check-in
// ---------------------------------------------------------------------------
// Runs on the member's own Supabase client and goes through check_in(), which
// decides everything: the window, "already present" and, when the gym has a
// position, the distance. None of it is re-checked here — a second copy in
// TypeScript would be a second definition free to drift from the first. The
// coordinates travel in this request only: they are passed on and never
// logged.
const CHECK_IN_PAGE = "/check-in";

export async function checkIn(formData: FormData) {
  const { t } = await getDictionary();
  const fromCheckInPage = formData.get("_return") === CHECK_IN_PAGE;
  const { supabase, userId, email } = await requireAdmin(fromCheckInPage ? CHECK_IN_PAGE : PATH);
  const query = (formData.get("_query") as string | null) ?? "";
  const sessionId = formData.get("session_id") as string;

  const done = (params: Record<string, string>) => {
    if (fromCheckInPage) redirect(`${CHECK_IN_PAGE}?${new URLSearchParams(params).toString()}`);
    back(params, query);
  };

  if (!sessionId) {
    done({ error: t.msg.sessionNotSpecified });
    return;
  }

  const profile = await getOrCreateProfile(supabase, userId, email);
  if (!profile) {
    done({ error: t.msg.profileUnavailable });
    return;
  }

  const { data, error } = await supabase.rpc("check_in", {
    p_session_id: sessionId,
    p_lat: optionalNumber(formData.get("lat")),
    p_lng: optionalNumber(formData.get("lng")),
    p_accuracy: optionalNumber(formData.get("accuracy")),
  });

  const outcome = error ? null : parseCheckinOutcome(data);
  if (!outcome) {
    // An error is not a closed window: the network, a missing migration or a
    // mangled id must not send the member to look at the clock.
    logDbError(
      "attendance",
      "checkIn",
      error ?? { code: "bad-outcome", message: "check_in returned an unknown shape" },
    );
    done({ error: t.msg.checkinFailed });
    return;
  }

  if (outcome.result === "ok") {
    revalidatePath(PATH);
    revalidatePath(CHECK_IN_PAGE);
  }

  const message = checkinMessage(outcome, t);
  done(message.ok ? { ok: message.text } : { error: message.text });
}
```

- [ ] **Step 3: Write `frontend/app/attendance/checkin-button.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { geoFailure, type GeoFailure } from "@/utils/checkin";

import { checkIn } from "./actions";

export type CheckinButtonLabels = {
  checkIn: string;
  locating: string;
  sending: string;
  retry: string;
  geo: Record<GeoFailure, string>;
};

// The member's check-in button. When the gym has a position it first asks the
// browser for the phone's (the only moment it is read), then posts the same
// server action the plain form used; the database decides. When the gym has
// none, it posts straight away and the browser never asks.
export function CheckinButton({
  sessionId,
  query,
  returnTo,
  needsLocation,
  auto = false,
  disabled = false,
  labels,
  className,
}: {
  sessionId: string;
  query: string;
  returnTo: "/attendance" | "/check-in";
  needsLocation: boolean;
  auto?: boolean;
  disabled?: boolean;
  labels: CheckinButtonLabels;
  className?: string;
}) {
  const [locating, setLocating] = useState(false);
  const [failure, setFailure] = useState<GeoFailure | null>(null);
  const [sending, startTransition] = useTransition();
  const autoStarted = useRef(false);

  function send(position?: GeolocationPosition) {
    const form = new FormData();
    form.set("session_id", sessionId);
    form.set("_query", query);
    form.set("_return", returnTo);
    if (position) {
      form.set("lat", String(position.coords.latitude));
      form.set("lng", String(position.coords.longitude));
      form.set("accuracy", String(position.coords.accuracy));
    }
    startTransition(async () => {
      await checkIn(form);
    });
  }

  function start() {
    setFailure(null);
    if (!needsLocation) {
      send();
      return;
    }
    if (!("geolocation" in navigator)) {
      setFailure("unsupported");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        send(position);
      },
      (error) => {
        setLocating(false);
        setFailure(geoFailure(error.code));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  // The QR page with a single open lesson checks in without a tap. Once per
  // mount: the ref survives the development double-invoke of effects.
  useEffect(() => {
    if (!auto || autoStarted.current) return;
    autoStarted.current = true;
    start();
    // start() is recreated every render; the ref makes this run once anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const busy = locating || sending;
  const label = locating
    ? labels.locating
    : sending
      ? labels.sending
      : failure
        ? labels.retry
        : labels.checkIn;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={start}
        disabled={busy || disabled}
        aria-busy={busy}
        className={
          className ??
          "rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        }
      >
        {label}
      </button>
      {failure ? (
        <p role="alert" className="max-w-xs text-right text-xs leading-snug text-accent">
          {labels.geo[failure]}
        </p>
      ) : null}
    </div>
  );
}
```

If `npm run lint` reports a react-hooks rule on the effect other than `exhaustive-deps` (e.g. `set-state-in-effect`), keep the behaviour — one automatic attempt per mount — and restructure only as far as the rule requires (for example move the synchronous `setFailure(null)` out of the auto path). Do not drop the rule with a file-wide disable.

- [ ] **Step 4: Use it in `/attendance`** — in `frontend/app/attendance/page.tsx`:

- change the import `import { checkIn, undoCheckIn } from "./actions";` to `import { undoCheckIn } from "./actions";` and add `import { CheckinButton, type CheckinButtonLabels } from "./checkin-button";`
- replace `const today = todayIn((await requireGymSettings()).timezone);` with
```tsx
  const gym = await requireGymSettings();
  const today = todayIn(gym.timezone);
  // No position, no question: the browser is asked only when it matters.
  const needsLocation = gym.latitude !== null;
  const checkinLabels: CheckinButtonLabels = {
    checkIn: t.presenze.checkIn,
    locating: t.checkin.locating,
    sending: t.checkin.sending,
    retry: t.checkin.retry,
    geo: t.checkin.geo,
  };
```
- add `needsLocation: boolean` and `checkinLabels: CheckinButtonLabels` props to `SessionRow` and `CheckinControl`, pass them from both `SessionRow` call sites (`needsLocation={needsLocation} checkinLabels={checkinLabels}`) and from `SessionRow` to `CheckinControl`;
- in `CheckinControl`, replace the final `<form action={checkIn}>…</form>` with
```tsx
  return (
    <CheckinButton
      sessionId={sessionId}
      query={query}
      returnTo="/attendance"
      needsLocation={needsLocation}
      disabled={disabled}
      labels={checkinLabels}
    />
  );
```
The undo form stays a plain server-action form: undoing never asks for the position.

- [ ] **Step 5: Tests, lint, build**

Run (from `frontend/`): `npm test && npm run lint && npm run build`
Expected: pass.

- [ ] **Step 6: Manual check** (Task 1 migrations must be in the local/preview DB the dev server uses; if the dev server points at the live project, **do not apply migrations** — skip this step and record it as pending for the user). Start the `frontend` launch configuration, sign in as a student of a gym without a location, check in to an open lesson: no permission prompt, "Check-in registrato." Double-click fast: second answer "Risulti già presente…" shown as success.

- [ ] **Step 7: Commit**

```bash
git add frontend/utils/supabase/gym.ts frontend/app/attendance
git commit -m "feat(attendance): check in through check_in(), asking for the position when the gym has one"
```

---

### Task 6: `/check-in`, the page the QR opens

**Files:**
- Create: `frontend/app/check-in/page.tsx`

**Interfaces:**
- Consumes: `CheckinButton`, `CheckinButtonLabels` (Task 5); `requireAdmin`, `requireGymSettings`, `getOrCreateProfile`, `checkinState`, `addDays`, `formatTime` (`utils/schedule.ts`), `todayIn`; `t.checkin.*`.

- [ ] **Step 1: Write `frontend/app/check-in/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";

import { AlertCircleIcon, CheckCircleIcon } from "@/components/icons";
import { todayIn } from "@/utils/dates";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { addDays, checkinState, formatTime } from "@/utils/schedule";
import { requireGymSettings } from "@/utils/supabase/gym";
import { getOrCreateProfile } from "@/utils/supabase/profile";
import { requireAdmin } from "@/utils/supabase/require-admin";

import { CheckinButton, type CheckinButtonLabels } from "../attendance/checkin-button";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.checkin.title };
}

type OpenSession = {
  id: string;
  course_name: string;
  start_time: string;
  end_time: string;
  status: string;
  checkin_opens_at: string;
  checkin_closes_at: string;
};

// The address printed on the gym's QR code, the same for every gym: the gym is
// the signed-in member's own. It lists the lessons open for check-in right now
// and, when there is exactly one, checks in without a tap. The rules are
// check_in()'s, exactly as for the button in /attendance.
export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const { t } = await getDictionary();
  const { supabase, userId, email, access } = await requireAdmin("/check-in");
  const gym = await requireGymSettings();
  const today = todayIn(gym.timezone);
  const now = new Date();

  // Yesterday too: a late lesson's window can run past midnight.
  const { data, error: queryError } = await supabase
    .from("session_overview")
    .select("id, course_name, start_time, end_time, status, checkin_opens_at, checkin_closes_at")
    .in("session_date", [addDays(today, -1), today])
    .eq("course_active", true)
    .order("session_date")
    .order("start_time");
  if (queryError) logDbError("check-in", "sessions", queryError);

  const open = ((data ?? []) as OpenSession[]).filter(
    (s) =>
      checkinState({
        opensAt: s.checkin_opens_at,
        closesAt: s.checkin_closes_at,
        status: s.status,
        now,
      }) === "open",
  );

  // Staff take attendance with the roll call, as in /attendance.
  const isStaff = access.canManageClasses;

  const recorded = new Map<string, boolean>();
  let profileMissing = false;
  if (!isStaff && open.length > 0) {
    const profile = await getOrCreateProfile(supabase, userId, email);
    if (!profile) {
      profileMissing = true;
    } else {
      const { data: rows } = await supabase
        .from("attendance")
        .select("session_id, present")
        .eq("person_id", profile.id)
        .in(
          "session_id",
          open.map((s) => s.id),
        );
      for (const row of (rows ?? []) as { session_id: string; present: boolean }[]) {
        recorded.set(row.session_id, row.present);
      }
    }
  }

  const labels: CheckinButtonLabels = {
    checkIn: t.presenze.checkIn,
    locating: t.checkin.locating,
    sending: t.checkin.sending,
    retry: t.checkin.retry,
    geo: t.checkin.geo,
  };
  const needsLocation = gym.latitude !== null;
  // Automatic only on a fresh scan: after an answer (ok or error) the page
  // shows it and waits for a tap, instead of trying again by itself.
  const auto =
    !ok &&
    !error &&
    !isStaff &&
    !profileMissing &&
    open.length === 1 &&
    !recorded.has(open[0].id);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 sm:gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.checkin.title}</h1>
        <p className="text-sm leading-relaxed text-foreground/65">{t.checkin.lead}</p>
      </header>

      {ok ? (
        <p className="flex items-start gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {ok}
        </p>
      ) : null}
      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {queryError ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {t.presenze.loadFailed}
        </p>
      ) : null}
      {profileMissing ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {t.presenze.profileMissing}
        </p>
      ) : null}

      {isStaff ? (
        <p className="rounded-xl border border-border px-3 py-3 text-sm text-foreground/70 sm:p-4">
          {t.checkin.staffUseRollCall}
        </p>
      ) : open.length === 0 ? (
        <p className="rounded-xl border border-border px-3 py-3 text-sm text-foreground/60 sm:p-4">
          {t.checkin.noOpenSession}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {open.map((session) => {
            const state = recorded.get(session.id);
            return (
              <li
                key={session.id}
                className="flex items-center justify-between gap-3 px-3 py-3 sm:p-4"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{session.course_name}</span>
                  <span className="text-xs text-foreground/55">
                    {formatTime(session.start_time)}–{formatTime(session.end_time)}
                  </span>
                </div>
                {state === true ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent">
                    <CheckCircleIcon className="h-4 w-4" />
                    {t.presenze.present}
                  </span>
                ) : state === false ? (
                  <span className="shrink-0 text-xs text-foreground/50">{t.presenze.absent}</span>
                ) : (
                  <CheckinButton
                    sessionId={session.id}
                    query=""
                    returnTo="/check-in"
                    needsLocation={needsLocation}
                    auto={auto}
                    disabled={profileMissing}
                    labels={labels}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href="/attendance"
        className="self-start text-sm font-medium text-accent hover:opacity-80"
      >
        {t.checkin.toCalendar} →
      </Link>
    </div>
  );
}
```

Verify first that `addDays` and `formatTime` are exported from `frontend/utils/schedule.ts` (they are imported by `app/attendance/page.tsx`) and that `requireAdmin` returns `access` (`AdminSessionWithAccess`).

- [ ] **Step 2: Lint and build**

Run (from `frontend/`): `npm run lint && npm run build`
Expected: pass; the build lists `/check-in` as a dynamic route.

- [ ] **Step 3: Manual check** (same DB caveat as Task 5 Step 6). Logged out, open `http://localhost:3000/check-in` → redirected to `/login?next=/check-in`; after login you land back on `/check-in`. As a student with one open lesson: automatic check-in. As staff: the roll-call notice, no button. As the superadmin: 404.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/check-in
git commit -m "feat(check-in): the page the gym's QR code opens"
```

---

### Task 7: Location fields for the superadmin's gym forms

**Files:**
- Create: `frontend/components/location-fields.tsx`
- Modify: `frontend/app/gyms/gym-fields.tsx`
- Modify: `frontend/app/gyms/actions.ts` (`gymInput`, `createGym` insert, `updateGym` update)
- Modify: `frontend/app/gyms/new/page.tsx` (defaults)
- Modify: `frontend/app/gyms/[id]/page.tsx` (defaults)

**Interfaces:**
- Consumes: `mapUrl`, `geoFailure`, `GeoFailure` (Task 4); `GymSettings.latitude/longitude` (Task 5); `GymForm.latitude/longitude` (Task 4).
- Produces: client component `LocationFields` with props `{ defaults: { latitude: number | null; longitude: number | null }; labels: LocationFieldsLabels }`, `type LocationFieldsLabels = { latitude: string; longitude: string; help: string; openMap: string; useCurrent: string; locating: string; geo: Record<GeoFailure, string> }`. Inputs are named `latitude` and `longitude`.

- [ ] **Step 1: Write `frontend/components/location-fields.tsx`**

```tsx
"use client";

import { useState } from "react";

import { geoFailure, mapUrl, type GeoFailure } from "@/utils/checkin";

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";

export type LocationFieldsLabels = {
  latitude: string;
  longitude: string;
  help: string;
  openMap: string;
  useCurrent: string;
  locating: string;
  geo: Record<GeoFailure, string>;
};

// Latitude and longitude of a gym, for the superadmin's gym form and the
// manager's /gym page. "Use my current location" fills both from the phone —
// the most precise way, standing in the gym. The server re-validates the pair
// (parseLocation, then the gym_location_valid constraint).
export function LocationFields({
  defaults,
  labels,
}: {
  defaults: { latitude: number | null; longitude: number | null };
  labels: LocationFieldsLabels;
}) {
  const [latitude, setLatitude] = useState(defaults.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(defaults.longitude?.toString() ?? "");
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [failure, setFailure] = useState<GeoFailure | null>(null);

  function useCurrent() {
    setFailure(null);
    if (!("geolocation" in navigator)) {
      setFailure("unsupported");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setAccuracy(Math.round(position.coords.accuracy));
      },
      (error) => {
        setLocating(false);
        setFailure(geoFailure(error.code));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  const lat = Number(latitude.replace(",", "."));
  const lng = Number(longitude.replace(",", "."));
  const showMap =
    latitude.trim() !== "" &&
    longitude.trim() !== "" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);

  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="latitude" className="text-sm font-medium">{labels.latitude}</label>
        <input
          id="latitude"
          name="latitude"
          inputMode="decimal"
          autoComplete="off"
          value={latitude}
          onChange={(e) => setLatitude(e.target.value)}
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="longitude" className="text-sm font-medium">{labels.longitude}</label>
        <input
          id="longitude"
          name="longitude"
          inputMode="decimal"
          autoComplete="off"
          value={longitude}
          onChange={(e) => setLongitude(e.target.value)}
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <p className="text-xs text-foreground/55">{labels.help}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={useCurrent}
            disabled={locating}
            className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-40"
          >
            {locating ? labels.locating : labels.useCurrent}
          </button>
          {accuracy !== null ? (
            <span className="text-xs text-foreground/55">± {accuracy} m</span>
          ) : null}
          {showMap ? (
            <a
              href={mapUrl(lat, lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-accent hover:opacity-80"
            >
              {labels.openMap}
            </a>
          ) : null}
        </div>
        {failure ? (
          <p role="alert" className="text-xs text-accent">{labels.geo[failure]}</p>
        ) : null}
      </div>
    </div>
  );
}
```

If lint flags the function name `useCurrent` as a hook (rules-of-hooks treats `use*` as hooks), rename it `fillFromDevice`.

- [ ] **Step 2: Add it to `GymFields`** — in `frontend/app/gyms/gym-fields.tsx`: add `latitude: number | null; longitude: number | null;` to `GymFieldDefaults`, `import { LocationFields } from "@/components/location-fields";`, update the comment to "The same fields for …", and add as the last child of the grid:

```tsx
      <div className="sm:col-span-2">
        <LocationFields
          defaults={{ latitude: defaults.latitude, longitude: defaults.longitude }}
          labels={{
            latitude: t.gyms.fields.latitude,
            longitude: t.gyms.fields.longitude,
            help: t.gyms.fields.locationHelp,
            openMap: t.gyms.fields.openMap,
            useCurrent: t.myGym.useCurrent,
            locating: t.myGym.locating,
            geo: t.checkin.geo,
          }}
        />
      </div>
```

- [ ] **Step 3: Defaults** — in `frontend/app/gyms/new/page.tsx` add `latitude: null, longitude: null,` to `defaults`; in `frontend/app/gyms/[id]/page.tsx` add `latitude: gym.latitude, longitude: gym.longitude,`.

- [ ] **Step 4: Actions** — in `frontend/app/gyms/actions.ts`, add to `gymInput`:
```ts
    latitude: field(formData, "latitude"),
    longitude: field(formData, "longitude"),
```
and to both the `createGym` `.insert({...})` and the `updateGym` `.update({...})` objects:
```ts
      latitude: value.latitude,
      longitude: value.longitude,
```
(`t.gyms.invalid[parsed.error]` already covers `"location"` via Task 3.)

- [ ] **Step 5: Lint and build**

Run (from `frontend/`): `npm test && npm run lint && npm run build`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/location-fields.tsx frontend/app/gyms
git commit -m "feat(gyms): the superadmin sets a gym's location"
```

---

### Task 8: `/gym` for the manager — location and the printable QR

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json` (via npm) — dependency `qrcode`, devDependency `@types/qrcode`
- Create: `frontend/app/gym/page.tsx`
- Create: `frontend/app/gym/actions.ts`
- Create: `frontend/app/gym/print-button.tsx`
- Modify: `frontend/app/account/page.tsx` (link under `isManager`)
- Modify: `frontend/components/nav-shell.tsx` (`print:hidden` on the top `<header>` and the bottom `<nav>`)

**Interfaces:**
- Consumes: `LocationFields` (Task 7); `parseLocation` (Task 4); RPC `set_gym_location` (Task 1); `SITE_URL` (`utils/site.ts`); `requireUserManager`, `requireGymSettings`; `t.myGym.*`, `t.account.myGym`.
- Produces: server action `setGymLocation(formData: FormData)` reading `latitude`, `longitude`, `_clear` (`"1"` clears).

- [ ] **Step 1: Install the QR library**

Run (from `frontend/`): `npm install qrcode && npm install -D @types/qrcode`
Expected: both added to `package.json`.

- [ ] **Step 2: Write `frontend/app/gym/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseLocation } from "@/utils/gyms";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { requireUserManager } from "@/utils/supabase/require-admin";

const PAGE = "/gym";

function to(params: Record<string, string>): never {
  redirect(`${PAGE}?${new URLSearchParams(params).toString()}`);
}

// The manager has no update on gym: set_gym_location() changes the two
// location columns of their own gym and re-checks can_manage_users() itself.
// The guard here is for the page, the function is the authority.
export async function setGymLocation(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireUserManager(PAGE);

  let location: { latitude: number; longitude: number } | null = null;
  if (formData.get("_clear") !== "1") {
    const parsed = parseLocation(formData.get("latitude"), formData.get("longitude"));
    if (!parsed.ok) to({ error: t.gyms.invalid.location });
    location = parsed.value;
  }

  const { error } = await supabase.rpc("set_gym_location", {
    p_lat: location?.latitude ?? null,
    p_lng: location?.longitude ?? null,
  });

  if (error) {
    logDbError("gym", "setGymLocation", error);
    to({ error: t.myGym.failed });
  }

  revalidatePath(PAGE);
  revalidatePath("/attendance");
  revalidatePath("/check-in");
  to({ ok: location ? t.myGym.saved : t.myGym.cleared });
}
```

- [ ] **Step 3: Write `frontend/app/gym/print-button.tsx`**

```tsx
"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="self-start rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted print:hidden"
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 4: Write `frontend/app/gym/page.tsx`**

```tsx
import type { Metadata } from "next";
import QRCode from "qrcode";

import { AlertCircleIcon, CheckCircleIcon } from "@/components/icons";
import { LocationFields } from "@/components/location-fields";
import { getDictionary } from "@/utils/i18n/server";
import { SITE_URL } from "@/utils/site";
import { requireGymSettings } from "@/utils/supabase/gym";
import { requireUserManager } from "@/utils/supabase/require-admin";

import { setGymLocation } from "./actions";
import { PrintButton } from "./print-button";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.myGym.title };
}

const sectionClass = "flex flex-col gap-4 rounded-xl border border-border p-4 sm:p-5";

// A manager's own gym: its position, which turns on the distance check at
// check-in, and the QR code to print. The QR holds one address for every gym,
// /check-in — the gym is the member's own — so a reprint is never needed.
export default async function MyGymPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const { t } = await getDictionary();
  await requireUserManager("/gym");
  const gym = await requireGymSettings();

  // Generated here, from our own URL: no external service, no client script.
  const qrSvg = await QRCode.toString(`${SITE_URL}/check-in`, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return (
    <div className="flex w-full flex-col gap-4 sm:gap-6">
      <header className="flex flex-col gap-2 print:hidden">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.myGym.title}</h1>
        <p className="text-sm leading-relaxed text-foreground/65">{t.myGym.lead}</p>
      </header>

      {ok ? (
        <p className="flex items-start gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-sm print:hidden">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {ok}
        </p>
      ) : null}
      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent print:hidden">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <section className={`${sectionClass} print:hidden`}>
        <h2 className="font-heading text-base font-semibold sm:text-lg">{t.myGym.locationSection}</h2>
        {gym.latitude === null ? (
          <p className="text-sm text-foreground/65">{t.myGym.noLocation}</p>
        ) : null}
        <form action={setGymLocation} className="flex flex-col gap-4">
          <LocationFields
            defaults={{ latitude: gym.latitude, longitude: gym.longitude }}
            labels={{
              latitude: t.gyms.fields.latitude,
              longitude: t.gyms.fields.longitude,
              help: t.myGym.locationHelp,
              openMap: t.gyms.fields.openMap,
              useCurrent: t.myGym.useCurrent,
              locating: t.myGym.locating,
              geo: t.checkin.geo,
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              {t.myGym.save}
            </button>
            {gym.latitude !== null ? (
              <button
                type="submit"
                name="_clear"
                value="1"
                className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                {t.myGym.clear}
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className={sectionClass}>
        <h2 className="font-heading text-base font-semibold sm:text-lg print:hidden">
          {t.myGym.qrSection}
        </h2>
        <p className="text-sm text-foreground/65 print:hidden">{t.myGym.qrHelp}</p>
        {/* Black on white in both themes: a scanner needs the contrast, and
            this is what gets printed. */}
        <figure className="flex flex-col items-center gap-3 self-center rounded-xl bg-white p-6 text-black">
          <figcaption className="text-center text-lg font-semibold">{gym.name}</figcaption>
          <div
            className="h-56 w-56 sm:h-64 sm:w-64 [&>svg]:h-full [&>svg]:w-full"
            // The SVG comes from the qrcode library, built from SITE_URL.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="text-center text-sm">{t.myGym.qrCaption}</p>
        </figure>
        <PrintButton label={t.myGym.print} />
      </section>
    </div>
  );
}
```

`bg-white`/`text-black` are a deliberate exception to the semantic-token rule: the QR card must be black on white in the dark theme too, for the scanner and for print. Keep the comment.

- [ ] **Step 5: Hide the app chrome when printing** — in `frontend/components/nav-shell.tsx` add `print:hidden` to the class list of the sticky top `<header>` (line ~136) and of the fixed bottom `<nav>` (line ~221). If the cookie notice (`components/cookie-notice.tsx`) renders a fixed banner, add `print:hidden` to its outer element too.

- [ ] **Step 6: Link from `/account`** — in `frontend/app/account/page.tsx`, inside the `isManager ? (…)` branch, wrap the existing Registro link and a new one in a fragment:

```tsx
        {isManager ? (
          <div className="flex flex-col gap-2">
            <Link
              href="/members"
              className="self-start text-sm font-medium text-accent hover:opacity-80"
            >
              {t.account.manageMembers}
            </Link>
            <Link
              href="/gym"
              className="self-start text-sm font-medium text-accent hover:opacity-80"
            >
              {t.account.myGym}
            </Link>
          </div>
        ) : null}
```

- [ ] **Step 7: Lint and build**

Run (from `frontend/`): `npm test && npm run lint && npm run build`
Expected: pass; `/gym` in the route list.

- [ ] **Step 8: Manual check** (same DB caveat as Task 5 Step 6). As a manager: `/account` shows the link; `/gym` shows the form and the QR; "Usa la mia posizione attuale" fills both fields; save → "Posizione salvata."; print preview shows only the QR card. As a student and as the superadmin: `/gym` is 404; the superadmin still opens `/gyms`.

- [ ] **Step 9: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/app/gym frontend/app/account/page.tsx frontend/components
git commit -m "feat(gym): the manager sets the location and prints the check-in QR"
```

(If `package-lock.json` lives at the repo root because of the npm workspace, add that path instead.)

---

### Task 9: Documentation and the rollout note

**Files:**
- Modify: `docs/claude/attendance-and-dashboard.md` ("Check-in" section)
- Modify: `docs/claude/gyms.md` ("Per-gym settings" section)
- Modify: `docs/claude/database.md` (migration index)
- Modify: `docs/superpowers/specs/2026-09-25-gym-location-checkin-design.md` (front matter `status`)

- [ ] **Step 1: `attendance-and-dashboard.md`** — replace the first bullet of "## Check-in" (the RLS insert policy) with:

```markdown
- **A member checks in only through `check_in(session, lat, lng, accuracy)`** (`20260926000000`), `security definer`, returning jsonb `{result, distance_m}`: `closed` (no profile, window shut, other/suspended gym) → `already` → only if the gym has a position: `location_needed`, `imprecise` (accuracy missing or > 100 m), `too_far` (> 50 m, haversine `gym_distance_m`). Otherwise inserts own row, `present`, `'self'`. The direct-insert policy "members can check themselves in" is dropped by `20260926010000`. The coordinates are compared and discarded — never stored or logged. Undo is unchanged (own `self` row while the window is open).
- **The position is asked only when the gym has one** (`CheckinButton`, `app/attendance/checkin-button.tsx`: `enableHighAccuracy`, 10 s timeout, `maximumAge 0`). Browser position is spoofable: this stops the lazy check-in from home, not a determined cheat; roll call stays authoritative.
- **`/check-in`** is the fixed address printed on every gym's QR (the gym is the member's own): lists lessons open now (today and yesterday, for windows past midnight), checks in automatically when exactly one is open and nothing is recorded yet, never retries by itself after an answer. Staff see the roll-call notice.
```
and replace the "An error is not a closed window" bullet with:
```markdown
- **An error is not a closed window.** `checkIn` shows `check_in`'s outcome via `checkinMessage()` (`utils/checkin.ts`; `already` counts as success); an RPC error or an unknown shape is logged with `logDbError()` and shown as the generic failure. `undoCheckIn`: a refusal deletes zero rows silently; an error is different. DB text never reaches the screen.
```

- [ ] **Step 2: `gyms.md`** — append to "## Per-gym settings":

```markdown
- **Location** `gym.latitude`/`longitude` (both or neither, `gym_location_valid`). The superadmin sets it in the gym form; the manager, who has no update on `gym`, on **`/gym`** ("La mia palestra", `requireUserManager`, linked from `/account`) through `set_gym_location()` (`security definer`, own gym only, 42501 otherwise). `/gym` also renders the printable check-in QR (`qrcode`, SVG on the server, `SITE_URL/check-in`). Route prefixes match by segment (`underPath()`, `utils/paths.ts`) so `/gym` and `/gyms` never match each other.
```

- [ ] **Step 3: `database.md`** — in the migration index, extend the range to cover `20260926000000_gym_location_checkin.sql` (location columns, `gym_distance_m`, `check_in`, `set_gym_location`) and `20260926010000_drop_direct_checkin.sql` (drops "members can check themselves in"; **apply only after the app calling `check_in()` is deployed**). Follow the index's existing format.

- [ ] **Step 4: Spec status** — set the spec's front matter to `status: approvata — implementata in docs/superpowers/plans/2026-09-24-gym-location-checkin.md`.

- [ ] **Step 5: Final verification**

Run: `bash supabase/tests/replay.sh --isolation` (repo root), then from `frontend/`: `npm test && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add docs
git commit -m "docs: check-in near the gym"
```

## Rollout (for the user, not for an agent)

1. Apply `20260926000000_gym_location_checkin.sql` in the SQL Editor of `poksgledkecwviypspmi`.
2. Merge and deploy the app.
3. Apply `20260926010000_drop_direct_checkin.sql`.
4. As manager, open `/gym` at the gym, "Usa la mia posizione attuale", save, print the QR.
5. On a phone: check in at the gym (ok), from home (too far), with location permission denied (message), by scanning the QR.
