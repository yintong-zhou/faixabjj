# Gym Invite Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A gym manager or head coach shares one invite link; whoever opens it registers for that gym, and staff approve (and may correct) the request before the person enters the Registro.

**Architecture:** A pending request lives in its own table (`registration_request`), never in `person`, so no existing query changes. Signing up creates the auth account at once (service role, no email, `app_metadata.pending_gym_id`, no `gym_id`, so no profile), and the username is reserved across `person` and `registration_request`. Approval sets `app_metadata.gym_id`: the existing auth trigger creates or links the `person` row, and the action fills it as `addPerson` does.

**Tech Stack:** Next.js App Router (server components, server actions, `useActionState`), Tailwind v4, Supabase (Postgres, RLS, security definer functions, GoTrue admin API), Vitest (pure functions only), Cloudflare Turnstile.

**Spec:** `docs/superpowers/specs/2026-10-02-gym-invite-registration-design.md`

## Global Constraints

- Run frontend commands from `frontend/`: `npm test`, `npm run lint`, `npm run build`.
- The migration must be **safe to run twice**. Verify with `bash supabase/tests/replay.sh --isolation`, run from the repo root (it needs Docker). Never run anything in `supabase/tests/` against a real project. The migration is applied **by hand** to project `poksgledkecwviypspmi`, never through the MCP.
- New domain table → `gym_id` + `gym_scope` trigger + restrictive `"gym isolation"` policy.
- `security_invoker = on` on every view (this plan adds no view).
- Guards answer **404, not 403**. Every protected page calls `requireAdmin()` or a `require*` guard built on it.
- **Service-role client** (`createAdminClient()`): every action using it re-checks its guard and proves the target is in the caller's gym through the user's own client first.
- **No user-facing string hardcoded.** Every new key goes into `frontend/utils/i18n/dictionaries/it.ts` (which defines the `Dictionary` type), `en.ts` and `pt-BR.ts`. URL paths in English: `/join/<token>`, `/pending`, `/members/requests`.
- **Dates dd/mm/yyyy** via `formatDate()` when displayed; `<input type="date">` values stay `YYYY-MM-DD`.
- **Belts are shown as the `Belt` graphic** (`components/belt.tsx`), never as colour plus stripe count.
- Use semantic colour tokens only (`border-border`, `bg-surface`, `text-foreground/65`, `text-accent`, `bg-muted`), never brand colours.
- DB error text never reaches the screen: log it with `logDbError(scope, where, error)` (`utils/log.ts`) and show a dictionary message.
- Login, signup and approval errors that could reveal an existing **email** stay generic.
- Use `getClaims()`, never `getUser()`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The invite link is regenerated while someone has the form open.** Expected: submitting refuses with "link no longer valid" and creates no account. Pinned in Task 5, Step 9 (manual check d).
2. **An athlete approved while signed in on `/pending` still carries a JWT with `pending_gym_id`.** Expected: "Check again" refreshes the session and lets them in; a rejected (deleted) account is signed out instead of looping. Pinned in Task 3, Step 6 (manual checks b and c).
3. **Age against belt:** a 15-year-old picking blue is refused; a 16–17-year-old may pick a kids' or an adult belt; an adult picking a kids' belt is refused. Pinned in Task 1 tests (`beltsForAge`, `beltForAge`).
4. **The username is taken between the live check and submit, or typed with capitals or spaces.** Expected: input is normalised to lower case; a collision at submit shows "username already taken" and keeps the form's values (the account just created is deleted). Pinned in Task 1 (normalisation test) and Task 5, Step 9 (manual check e).
5. **The approver changes the email to one another account already uses.** Expected: approval stops before the gym is assigned, shows "email could not be used", and leaves the request pending. Pinned in Task 6, Step 9 (manual check d).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `frontend/utils/registration.ts` (new) | Pure validation and normalisation of a registration (signup and approval) |
| `frontend/utils/registration.test.ts` (new) | Vitest for the above |
| `supabase/migrations/20261002000000_gym_invite_registration.sql` (new) | `gym_invite`, `registration_request`, username cross-uniqueness, invite and username functions, login lookup redefinition |
| `supabase/tests/tenant-isolation.sql` (modify) | Check T22 |
| `frontend/utils/supabase/proxy.ts` (modify) | Pending redirect; `/join` visitor-only |
| `frontend/utils/supabase/require-admin.ts` (modify) | `pendingApproval` on the session; `requireAdmin` → `/pending` |
| `frontend/app/pending/page.tsx`, `actions.ts` (new) | Pending page, "Check again" |
| `frontend/app/gym/page.tsx`, `actions.ts` (modify) | Invite link section, `regenerateInvite` |
| `frontend/utils/turnstile-verify.ts` (new) | Server-side siteverify for the signup form only |
| `frontend/utils/supabase/invite.ts` (new) | `gymForInvite()` service-role lookup |
| `frontend/app/join/actions.ts` (new) | `register`, `checkUsername` |
| `frontend/app/join/[token]/page.tsx`, `join-form.tsx` (new) | Public form |
| `frontend/app/login/page.tsx` (modify) | "Request sent" notice |
| `frontend/app/members/requests/page.tsx`, `actions.ts`, `linked-person.ts` (new) | Approval list, approve/reject |
| `frontend/app/members/page.tsx` (modify) | "Registration requests (N)" chip |
| `frontend/app/gyms/actions.ts` (modify) | `deleteGym` also deletes pending accounts |
| `frontend/utils/i18n/dictionaries/{it,en,pt-BR}.ts` (modify) | All strings |
| `CLAUDE.md`, `docs/claude/*.md`, memory (modify) | The no-signup rule becomes invite-only |

---

### Task 1: `parseRegistration()` — pure validation

**Files:**
- Create: `frontend/utils/registration.ts`
- Test: `frontend/utils/registration.test.ts`

**Interfaces:**
- Consumes: `ADULT_BELTS`, `KID_BELTS`, `BELT_ORDER`, `isKidBelt` from `@/utils/supabase/profile`; `ageOn` from `@/utils/dates`; `isValidUsername`, `normalizeUsername` from `@/utils/username`.
- Produces:
  ```ts
  export type RegistrationError =
    | "nameRequired" | "emailInvalid" | "usernameInvalid" | "passwordTooShort" | "passwordMismatch"
    | "birthDateInvalid" | "joinedAtInvalid" | "dateInvalid" | "dateInFuture" | "experienceRequired"
    | "beltInvalid" | "beltForAge" | "stripesInvalid" | "stripeBeforeBelt" | "consentRequired";
  export type Registration = {
    fullName: string; email: string; username: string; password: string | null;
    birthDate: string; joinedAt: string; belt: string; stripes: number; rankSince: string; stripeSince: string;
  };
  export type FieldGetter = (key: string) => string | null;
  export const PASSWORD_MIN = 8;
  export function beltsForAge(age: number | null): readonly string[];
  export function parseRegistration(get: FieldGetter, today: string, mode: "signup" | "approval"):
    { ok: true; value: Registration } | { ok: false; error: RegistrationError };
  ```
  Form field names it reads: `full_name`, `email`, `username`, `password`, `password_repeat` (signup), `privacy` (signup, value `"on"`), `birth_date`, `joined_at`, `experienced` (`"yes"`/`"no"`), `current_belt`, `current_stripes`, `rank_since`, `stripe_since`.

- [ ] **Step 1: Write the failing test**

Create `frontend/utils/registration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { beltsForAge, parseRegistration, type FieldGetter } from "./registration";

const TODAY = "2026-10-02";

const BASE: Record<string, string> = {
  full_name: "  Mario Rossi ",
  email: " Mario@Example.com ",
  username: " Mario.Rossi ",
  password: "segreta123",
  password_repeat: "segreta123",
  privacy: "on",
  birth_date: "1990-05-01",
  joined_at: "2026-09-01",
  experienced: "no",
};

const getter = (fields: Record<string, string>): FieldGetter => (key) => fields[key] ?? null;
const parse = (overrides: Record<string, string> = {}, mode: "signup" | "approval" = "signup") =>
  parseRegistration(getter({ ...BASE, ...overrides }), TODAY, mode);

describe("beltsForAge", () => {
  it("gives the kids' ladder under 16, both at 16-17, adults from 18", () => {
    expect(beltsForAge(15)).toContain("gray");
    expect(beltsForAge(15)).not.toContain("blue");
    expect(beltsForAge(16)).toContain("gray");
    expect(beltsForAge(17)).toContain("blue");
    expect(beltsForAge(18)).toContain("blue");
    expect(beltsForAge(18)).not.toContain("gray");
  });
});

describe("parseRegistration", () => {
  it("normalises name, email and username", () => {
    const result = parse();
    expect(result).toMatchObject({
      ok: true,
      value: { fullName: "Mario Rossi", email: "mario@example.com", username: "mario.rossi", password: "segreta123" },
    });
  });

  it("starts a beginner at white 0 with both dates at the join date", () => {
    const result = parse({ current_belt: "purple", current_stripes: "3", rank_since: "2020-01-01" });
    expect(result).toMatchObject({
      ok: true,
      value: { belt: "white", stripes: 0, rankSince: "2026-09-01", stripeSince: "2026-09-01" },
    });
  });

  it("takes belt, stripes and dates from an experienced athlete", () => {
    const result = parse({
      experienced: "yes", current_belt: "blue", current_stripes: "2",
      rank_since: "2024-03-10", stripe_since: "2025-11-20",
    });
    expect(result).toMatchObject({
      ok: true,
      value: { belt: "blue", stripes: 2, rankSince: "2024-03-10", stripeSince: "2025-11-20" },
    });
  });

  it("defaults a missing belt date to the join date and a missing stripe date to the belt date", () => {
    expect(parse({ experienced: "yes", current_belt: "blue", current_stripes: "1" })).toMatchObject({
      ok: true, value: { rankSince: "2026-09-01", stripeSince: "2026-09-01" },
    });
    expect(
      parse({ experienced: "yes", current_belt: "blue", current_stripes: "1", rank_since: "2026-09-15" }),
    ).toMatchObject({ ok: true, value: { rankSince: "2026-09-15", stripeSince: "2026-09-15" } });
  });

  it("ignores a stripe date when there are no stripes", () => {
    expect(
      parse({ experienced: "yes", current_belt: "blue", current_stripes: "0", rank_since: "2025-01-01", stripe_since: "2025-06-01" }),
    ).toMatchObject({ ok: true, value: { stripeSince: "2025-01-01" } });
  });

  it("refuses missing or malformed required fields", () => {
    expect(parse({ full_name: "  " })).toEqual({ ok: false, error: "nameRequired" });
    expect(parse({ email: "mario" })).toEqual({ ok: false, error: "emailInvalid" });
    expect(parse({ username: "a@b" })).toEqual({ ok: false, error: "usernameInvalid" });
    expect(parse({ birth_date: "" })).toEqual({ ok: false, error: "birthDateInvalid" });
    expect(parse({ birth_date: "2026-10-02" })).toEqual({ ok: false, error: "birthDateInvalid" });
    expect(parse({ birth_date: "1990-02-30" })).toEqual({ ok: false, error: "birthDateInvalid" });
    expect(parse({ joined_at: "" })).toEqual({ ok: false, error: "joinedAtInvalid" });
    expect(parse({ experienced: "" })).toEqual({ ok: false, error: "experienceRequired" });
  });

  it("checks passwords and consent only at signup", () => {
    expect(parse({ password: "short", password_repeat: "short" })).toEqual({ ok: false, error: "passwordTooShort" });
    expect(parse({ password_repeat: "different1" })).toEqual({ ok: false, error: "passwordMismatch" });
    expect(parse({ privacy: "" })).toEqual({ ok: false, error: "consentRequired" });
    expect(parse({ password: "", password_repeat: "", privacy: "" }, "approval")).toMatchObject({
      ok: true, value: { password: null },
    });
  });

  it("refuses future dates and a stripe before the belt", () => {
    expect(parse({ joined_at: "2026-10-03" })).toEqual({ ok: false, error: "dateInFuture" });
    expect(
      parse({ experienced: "yes", current_belt: "blue", current_stripes: "1", rank_since: "2026-10-05" }),
    ).toEqual({ ok: false, error: "dateInFuture" });
    expect(
      parse({ experienced: "yes", current_belt: "blue", current_stripes: "1", rank_since: "2025-01-01", stripe_since: "2024-01-01" }),
    ).toEqual({ ok: false, error: "stripeBeforeBelt" });
    expect(
      parse({ experienced: "yes", current_belt: "blue", current_stripes: "1", rank_since: "2025-13-01" }),
    ).toEqual({ ok: false, error: "dateInvalid" });
  });

  it("checks the belt against the ladder for the age", () => {
    expect(parse({ experienced: "yes", current_belt: "", current_stripes: "0" })).toEqual({ ok: false, error: "beltInvalid" });
    expect(parse({ experienced: "yes", current_belt: "pink", current_stripes: "0" })).toEqual({ ok: false, error: "beltInvalid" });
    // 15 years old on TODAY: kids' belts only.
    expect(parse({ birth_date: "2011-01-01", experienced: "yes", current_belt: "blue", current_stripes: "0" })).toEqual({
      ok: false, error: "beltForAge",
    });
    expect(parse({ experienced: "yes", current_belt: "gray", current_stripes: "0" })).toEqual({ ok: false, error: "beltForAge" });
    expect(parse({ birth_date: "2009-06-01", experienced: "yes", current_belt: "green", current_stripes: "0" })).toMatchObject({ ok: true });
  });

  it("allows 0-4 stripes on adult belts and 0-3 on kids' belts", () => {
    expect(parse({ experienced: "yes", current_belt: "blue", current_stripes: "4" })).toMatchObject({ ok: true });
    expect(parse({ experienced: "yes", current_belt: "blue", current_stripes: "5" })).toEqual({ ok: false, error: "stripesInvalid" });
    expect(parse({ experienced: "yes", current_belt: "blue", current_stripes: "1.5" })).toEqual({ ok: false, error: "stripesInvalid" });
    expect(
      parse({ birth_date: "2016-01-01", experienced: "yes", current_belt: "gray", current_stripes: "4" }),
    ).toEqual({ ok: false, error: "stripesInvalid" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `frontend/`): `npx vitest run utils/registration.test.ts`
Expected: FAIL, `Failed to resolve import "./registration"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/utils/registration.ts`:

```ts
import { ageOn } from "./dates";
import { ADULT_BELTS, BELT_ORDER, KID_BELTS, isKidBelt } from "./supabase/profile";
import { isValidUsername, normalizeUsername } from "./username";

// The one place a self-registration is validated — the public form's action
// and the staff's approval both go through it, so the two cannot drift. Pure:
// fields arrive through a getter (FormData in the actions, a plain object in
// the tests) and "today" is the gym's, passed in.

export type RegistrationError =
  | "nameRequired"
  | "emailInvalid"
  | "usernameInvalid"
  | "passwordTooShort"
  | "passwordMismatch"
  | "birthDateInvalid"
  | "joinedAtInvalid"
  | "dateInvalid"
  | "dateInFuture"
  | "experienceRequired"
  | "beltInvalid"
  | "beltForAge"
  | "stripesInvalid"
  | "stripeBeforeBelt"
  | "consentRequired";

export type Registration = {
  fullName: string;
  email: string;
  username: string;
  /** Null in approval mode: the athlete chose it at signup and staff never see it. */
  password: string | null;
  birthDate: string;
  joinedAt: string;
  belt: string;
  stripes: number;
  rankSince: string;
  stripeSince: string;
};

export type FieldGetter = (key: string) => string | null;

export const PASSWORD_MIN = 8;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "2026-02-30" passes the pattern; the round trip through Date catches it.
function isoDate(value: string | null): string | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

// IBJJF: children's belts until 15, adult belts from 16 — but a 16- or
// 17-year-old may still be wearing the green belt they have not converted yet.
// Unknown age (never at signup: the birth date is required) counts as adult,
// like everywhere else in the app.
export function beltsForAge(age: number | null): readonly string[] {
  if (age !== null && age < 16) return KID_BELTS;
  if (age !== null && age < 18) return BELT_ORDER;
  return ADULT_BELTS;
}

type Result = { ok: true; value: Registration } | { ok: false; error: RegistrationError };

const fail = (error: RegistrationError): Result => ({ ok: false, error });

export function parseRegistration(get: FieldGetter, today: string, mode: "signup" | "approval"): Result {
  const field = (key: string) => get(key)?.trim() || null;

  const fullName = field("full_name");
  if (!fullName) return fail("nameRequired");

  const email = field("email")?.toLowerCase() ?? null;
  if (!email || !EMAIL.test(email)) return fail("emailInvalid");

  const username = normalizeUsername(get("username") ?? "");
  if (!isValidUsername(username)) return fail("usernameInvalid");

  let password: string | null = null;
  if (mode === "signup") {
    // Not trimmed: a space is a legitimate password character.
    password = get("password") ?? "";
    if (password.length < PASSWORD_MIN) return fail("passwordTooShort");
    if (password !== (get("password_repeat") ?? "")) return fail("passwordMismatch");
    if (get("privacy") !== "on") return fail("consentRequired");
  }

  const birthDate = isoDate(field("birth_date"));
  if (!birthDate || birthDate >= today) return fail("birthDateInvalid");

  const joinedAt = isoDate(field("joined_at"));
  if (!joinedAt) return fail("joinedAtInvalid");
  if (joinedAt > today) return fail("dateInFuture");

  const experienced = field("experienced");
  if (experienced !== "yes" && experienced !== "no") return fail("experienceRequired");

  if (experienced === "no") {
    return {
      ok: true,
      value: { fullName, email, username, password, birthDate, joinedAt, belt: "white", stripes: 0, rankSince: joinedAt, stripeSince: joinedAt },
    };
  }

  const belt = field("current_belt");
  if (!belt || !(BELT_ORDER as readonly string[]).includes(belt)) return fail("beltInvalid");
  if (!beltsForAge(ageOn(birthDate, today)).includes(belt)) return fail("beltForAge");

  const stripes = Number(field("current_stripes") ?? "");
  if (!Number.isInteger(stripes) || stripes < 0 || stripes > (isKidBelt(belt) ? 3 : 4)) return fail("stripesInvalid");

  // A date the athlete does not remember is estimated: the belt from the day
  // they joined, the last stripe from the belt. Staff correct it at approval.
  const rankRaw = field("rank_since");
  const rankSince = rankRaw ? isoDate(rankRaw) : joinedAt;
  if (!rankSince) return fail("dateInvalid");

  const stripeRaw = stripes === 0 ? null : field("stripe_since");
  const stripeSince = stripeRaw ? isoDate(stripeRaw) : rankSince;
  if (!stripeSince) return fail("dateInvalid");

  if (rankSince > today || stripeSince > today) return fail("dateInFuture");
  if (stripeSince < rankSince) return fail("stripeBeforeBelt");

  return {
    ok: true,
    value: { fullName, email, username, password, birthDate, joinedAt, belt, stripes, rankSince, stripeSince },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `frontend/`): `npx vitest run utils/registration.test.ts`
Expected: PASS, all tests green.

Then run `npm test` and `npm run lint`. Expected: everything green.

- [ ] **Step 5: Commit**

```bash
git add frontend/utils/registration.ts frontend/utils/registration.test.ts
git commit -m "feat(join): validate self-registration in one pure function

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migration and isolation check

**Files:**
- Create: `supabase/migrations/20261002000000_gym_invite_registration.sql`
- Modify: `supabase/tests/tenant-isolation.sql` (insert before the line `-- T11: deleting gym B, as the superadmin, removes all of it and nothing of A.`)
- Modify: `docs/claude/database.md` (migration list)

**Interfaces:**
- Produces (SQL):
  - table `public.gym_invite (gym_id uuid pk, token text unique, created_at)`: readable by `can_manage_users()` in their own gym; nobody writes it directly.
  - table `public.registration_request (id, gym_id, auth_user_id unique, full_name, email, username unique, birth_date, joined_at, current_belt belt_rank, current_stripes, rank_since, stripe_since, created_at)`: select/delete for `can_manage_users()` in the own gym; written only by the service role.
  - `public.regenerate_invite_token() returns text`: `authenticated`, own gym, `can_manage_users()`, else `42501`.
  - `public.gym_for_invite(p_token text) returns uuid`: `service_role` only; null unless the gym is active.
  - `public.username_available(p_username text) returns boolean`: `service_role` only.
  - `public.login_email_for_username(p_username text) returns text`: redefined to also resolve pending requests; `service_role` only.
  - Trigger `username_cross_unique` on `person` and `registration_request`: raises `23505` when a username is held in the other table by a **different** account.

- [ ] **Step 1: Write the failing isolation test**

In `supabase/tests/tenant-isolation.sql`, insert this block immediately **before** the line `-- T11: deleting gym B, as the superadmin, removes all of it and nothing of A.`:

```sql
-- T22: invite links and registration requests (20261002000000).
-- e1 and e2 are pending accounts of gym A and gym B; e3 is a spare account.
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'e1@pending', jsonb_build_object('pending_gym_id', current_setting('test.gym_a'))),
  ('00000000-0000-0000-0000-0000000000e2', 'e2@pending', jsonb_build_object('pending_gym_id', current_setting('test.gym_b'))),
  ('00000000-0000-0000-0000-0000000000e3', 'e3@pending', '{}'::jsonb);
insert into public.registration_request
  (auth_user_id, gym_id, full_name, email, username, birth_date, joined_at, rank_since, stripe_since)
values
  ('00000000-0000-0000-0000-0000000000e1', current_setting('test.gym_a')::uuid, 'Pending A', 'e1@pending', 'pending.a',
   '2000-01-01', current_date, current_date, current_date),
  ('00000000-0000-0000-0000-0000000000e2', current_setting('test.gym_b')::uuid, 'Pending B', 'e2@pending', 'pending.b',
   '2000-01-01', current_date, current_date, current_date);

do $$ begin
  if exists (select 1 from public.person where email like '%@pending') then
    raise exception 'FAIL T22: a pending account got a profile';
  end if;
end $$;

-- a1, manager of gym A: reads A's request only, never inserts one, deletes only A's.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$ begin
  if (select count(*) from public.registration_request) <> 1
     or not exists (select 1 from public.registration_request where username = 'pending.a') then
    raise exception 'FAIL T22: a1 reads registration requests of another gym';
  end if;
  delete from public.registration_request where username = 'pending.b';
  if found then
    raise exception 'FAIL T22: a1 deleted a request of gym B';
  end if;
  begin
    insert into public.registration_request
      (auth_user_id, gym_id, full_name, email, username, birth_date, joined_at, rank_since, stripe_since)
    values ('00000000-0000-0000-0000-0000000000e3', current_setting('test.gym_a')::uuid, 'Forged', 'e3@pending',
            'forged.req', '2000-01-01', current_date, current_date, current_date);
    raise exception 'FAIL T22: a1 inserted a registration request directly';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- a2, student of gym A: no requests, no link, cannot generate one.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
do $$ begin
  if exists (select 1 from public.registration_request) then
    raise exception 'FAIL T22: a student reads registration requests';
  end if;
  begin
    perform public.regenerate_invite_token();
    raise exception 'FAIL T22: a student generated an invite link';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- a1 generates gym A's link (committed for the checks below) and reads it back.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$ declare v_token text; begin
  v_token := public.regenerate_invite_token();
  if v_token !~ '^[0-9a-f]{64}$' then
    raise exception 'FAIL T22: the invite token is not 64 hex characters: %', v_token;
  end if;
  if (select count(*) from public.gym_invite) <> 1 or (select token from public.gym_invite) <> v_token then
    raise exception 'FAIL T22: a1 cannot read the invite link just generated';
  end if;
  if public.regenerate_invite_token() = v_token then
    raise exception 'FAIL T22: regenerating kept the old token';
  end if;
end $$;
commit;

-- b1, manager of gym B, does not see gym A's link; a2 cannot call the service-role functions.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$ begin
  if exists (select 1 from public.gym_invite) then
    raise exception 'FAIL T22: b1 reads the invite link of gym A';
  end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
do $$ begin
  if exists (select 1 from public.gym_invite) then
    raise exception 'FAIL T22: a student reads the invite link';
  end if;
  begin
    perform public.gym_for_invite('x');
    raise exception 'FAIL T22: gym_for_invite is callable by an end user';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.username_available('x');
    raise exception 'FAIL T22: username_available is callable by an end user';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.login_email_for_username('x');
    raise exception 'FAIL T22: login_email_for_username is callable by an end user';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- The service role resolves the link and the usernames, pending ones included.
begin;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_token text := (select token from public.gym_invite where gym_id = current_setting('test.gym_a')::uuid);
begin
  if public.gym_for_invite(v_token) is distinct from current_setting('test.gym_a')::uuid then
    raise exception 'FAIL T22: gym_for_invite did not resolve gym A';
  end if;
  if public.gym_for_invite('not-a-token') is not null then
    raise exception 'FAIL T22: gym_for_invite resolved an unknown token';
  end if;
  if public.username_available('pending.a') or not public.username_available('free.name') then
    raise exception 'FAIL T22: username_available ignores pending requests';
  end if;
  if public.login_email_for_username('pending.a') is distinct from 'e1@pending' then
    raise exception 'FAIL T22: a pending account cannot sign in with its username';
  end if;
end $$;
rollback;

-- A suspended gym's link resolves to nothing.
begin;
update public.gym set status = 'suspended' where id = current_setting('test.gym_a')::uuid;
do $$ begin
  if public.gym_for_invite((select token from public.gym_invite where gym_id = current_setting('test.gym_a')::uuid)) is not null then
    raise exception 'FAIL T22: the link of a suspended gym still resolves';
  end if;
end $$;
rollback;

-- One username, one account, across both tables; approval may move it across.
begin;
do $$ begin
  begin
    update public.person set username = 'pending.a' where email = 'a2@test';
    raise exception 'FAIL T22: a member took the username of a pending request';
  exception when unique_violation then null;
  end;

  update public.person set username = 'member.a2' where email = 'a2@test';
  begin
    insert into public.registration_request
      (auth_user_id, gym_id, full_name, email, username, birth_date, joined_at, rank_since, stripe_since)
    values ('00000000-0000-0000-0000-0000000000e3', current_setting('test.gym_a')::uuid, 'Copycat', 'e3@pending',
            'member.a2', '2000-01-01', current_date, current_date, current_date);
    raise exception 'FAIL T22: a request took the username of a member';
  exception when unique_violation then null;
  end;

  -- Approval: the gym arrives in app_metadata, the auth trigger creates the
  -- profile, the username moves from the request to it.
  update auth.users
     set raw_app_meta_data = jsonb_build_object('gym_id', current_setting('test.gym_a'))
   where id = '00000000-0000-0000-0000-0000000000e1';
  update public.person set username = 'pending.a'
   where auth_user_id = '00000000-0000-0000-0000-0000000000e1';
  if not found then
    raise exception 'FAIL T22: approval could not move the username to the new profile';
  end if;
end $$;
rollback;
```

- [ ] **Step 2: Run the replay to verify it fails**

Run (from the repo root): `bash supabase/tests/replay.sh --isolation`
Expected: the migrations replay, then the isolation tests fail at the first T22 insert with `relation "public.registration_request" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261002000000_gym_invite_registration.sql`:

```sql
-- FAIXABJJ — gym invite link and self-registration awaiting approval
--
-- Spec: docs/superpowers/specs/2026-10-02-gym-invite-registration-design.md.
--
-- A manager shares one link per gym; whoever opens it signs up for that gym.
-- The account is created at once by the service role (app/join/actions.ts)
-- with app_metadata.pending_gym_id and no gym_id, so the auth trigger creates
-- no person row and current_gym_id() is null: the account sees nothing. The
-- request waits here until a user manager approves it (the gym goes into
-- app_metadata, the trigger creates the profile) or rejects it (the account is
-- deleted, the request goes with it).
--
-- Redefines login_email_for_username() (last: 20260930010000) so a pending
-- account signs in with its username too. Replay-safe.

-- The link. Its own table, not a column on gym: every member reads their own
-- gym row, and a student must not see the link. No backfill — a gym has no
-- link until a manager generates one.
create table if not exists public.gym_invite (
  gym_id uuid primary key references public.gym (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);

alter table public.gym_invite enable row level security;

drop policy if exists "user managers read the invite" on public.gym_invite;
create policy "user managers read the invite" on public.gym_invite for select to authenticated
  using (public.can_manage_users());

drop policy if exists "gym isolation" on public.gym_invite;
create policy "gym isolation" on public.gym_invite as restrictive for all to authenticated
  using (gym_id = (select public.current_gym_id()))
  with check (gym_id = (select public.current_gym_id()));

drop trigger if exists gym_scope on public.gym_invite;
create trigger gym_scope before insert or update on public.gym_invite
  for each row execute function public.gym_scope();

-- The requests. No insert or update policy: only the service role writes, after
-- checking the link; staff read and delete (reject) through RLS.
create table if not exists public.registration_request (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gym (id) on delete cascade,
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,30}$'),
  birth_date date not null,
  joined_at date not null,
  current_belt public.belt_rank not null default 'white',
  current_stripes smallint not null default 0 check (current_stripes between 0 and 4),
  rank_since date not null,
  stripe_since date not null,
  created_at timestamptz not null default now(),
  constraint registration_request_dates check (stripe_since >= rank_since)
);

alter table public.registration_request enable row level security;

drop policy if exists "user managers read requests" on public.registration_request;
create policy "user managers read requests" on public.registration_request for select to authenticated
  using (public.can_manage_users());

drop policy if exists "user managers delete requests" on public.registration_request;
create policy "user managers delete requests" on public.registration_request for delete to authenticated
  using (public.can_manage_users());

drop policy if exists "gym isolation" on public.registration_request;
create policy "gym isolation" on public.registration_request as restrictive for all to authenticated
  using (gym_id = (select public.current_gym_id()))
  with check (gym_id = (select public.current_gym_id()));

drop trigger if exists gym_scope on public.registration_request;
create trigger gym_scope before insert or update on public.registration_request
  for each row execute function public.gym_scope();

-- A username is unique across both tables: a pending athlete signs in with it,
-- so nobody else may take it meanwhile. Two unique indexes cannot span two
-- tables, so each side checks the other under an advisory lock on the name
-- (a concurrent writer of the same name waits, then sees the committed row).
-- The same account may hold it on both sides: that is approval moving it from
-- the request to the new profile. 23505, like the unique indexes, so callers
-- (claimUsername's retry loop, /account) treat it as "taken".
create or replace function public.username_cross_unique()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.username is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.username is not distinct from old.username
     and new.auth_user_id is not distinct from old.auth_user_id then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('username:' || new.username));

  if tg_table_name = 'person' then
    if exists (
      select 1 from public.registration_request r
      where r.username = new.username and r.auth_user_id is distinct from new.auth_user_id
    ) then
      raise exception 'Username already taken.' using errcode = '23505';
    end if;
  else
    if exists (
      select 1 from public.person p
      where p.username = new.username and p.auth_user_id is distinct from new.auth_user_id
    ) then
      raise exception 'Username already taken.' using errcode = '23505';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists username_cross_unique on public.person;
create trigger username_cross_unique before insert or update of username, auth_user_id on public.person
  for each row execute function public.username_cross_unique();

drop trigger if exists username_cross_unique on public.registration_request;
create trigger username_cross_unique before insert or update on public.registration_request
  for each row execute function public.username_cross_unique();

-- A user manager draws a new link for their own gym; the old one stops working
-- at once. Definer: nobody has a write policy on gym_invite. 64 hex characters
-- from two random UUIDs (gen_random_uuid is core Postgres, no extension needed).
create or replace function public.regenerate_invite_token()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_gym uuid := public.current_gym_id();
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if v_gym is null or not public.can_manage_users() then
    raise exception 'not allowed to manage the invite link' using errcode = '42501';
  end if;

  insert into public.gym_invite (gym_id, token)
  values (v_gym, v_token)
  on conflict (gym_id) do update set token = excluded.token, created_at = now();

  return v_token;
end;
$$;

revoke execute on function public.regenerate_invite_token() from public, anon;
grant execute on function public.regenerate_invite_token() to authenticated;

-- The public form's lookup: the gym of a link, only while that gym is active.
-- Service role only (utils/supabase/invite.ts); revoked from anon and
-- authenticated explicitly, because default privileges grant both execute.
create or replace function public.gym_for_invite(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.gym_id
  from public.gym_invite i
  join public.gym g on g.id = i.gym_id
  where i.token = p_token
    and g.status = 'active'
$$;

revoke all on function public.gym_for_invite(text) from public, anon, authenticated;
grant execute on function public.gym_for_invite(text) to service_role;

-- The form's live username check. Service role only, called by a server action
-- that first checks the link (app/join/actions.ts checkUsername).
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.person where username = p_username)
     and not exists (select 1 from public.registration_request where username = p_username)
$$;

revoke all on function public.username_available(text) from public, anon, authenticated;
grant execute on function public.username_available(text) to service_role;

-- The login's username lookup, now also for a pending account (which has no
-- person row yet). Still one statement, so found and not-found cost the same
-- round trip (see 20260930010000).
create or replace function public.login_email_for_username(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text
  from (
    select p.auth_user_id from public.person p where p.username = p_username
    union all
    select r.auth_user_id from public.registration_request r where r.username = p_username
  ) a
  join auth.users u on u.id = a.auth_user_id
  limit 1
$$;

revoke all on function public.login_email_for_username(text) from public, anon, authenticated;
grant execute on function public.login_email_for_username(text) to service_role;
```

- [ ] **Step 4: Run the replay to verify it passes**

Run (from the repo root): `bash supabase/tests/replay.sh --isolation`
Expected: both passes replay without error, then `tenant isolation: all checks passed` and `OK`.

- [ ] **Step 5: Document the migration**

In `docs/claude/database.md`, in the list of migrations that holds the `20260930010000_login_username_lookup.sql` entry, add after it:

```markdown
- `20261002000000_gym_invite_registration.sql` — `gym_invite` (one link per gym, readable by user managers only), `registration_request` (pending self-registrations, written only by the service role), trigger `username_cross_unique` (a username is unique across `person` and `registration_request`; the same account may hold it on both sides, which is how approval moves it), `regenerate_invite_token()` (authenticated, own gym, `can_manage_users()`), `gym_for_invite()` and `username_available()` (service role only), and `login_email_for_username()` redefined to resolve pending accounts. **Apply BEFORE deploying the app**: `/gym`, `/join`, `/members` and the username login all call these.
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261002000000_gym_invite_registration.sql supabase/tests/tenant-isolation.sql docs/claude/database.md
git commit -m "feat(db): invite links and registration requests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Pending state — redirect, guard, `/pending`

**Files:**
- Modify: `frontend/utils/supabase/proxy.ts`
- Modify: `frontend/utils/supabase/require-admin.ts`
- Create: `frontend/app/pending/page.tsx`, `frontend/app/pending/actions.ts`
- Modify: `frontend/utils/i18n/dictionaries/it.ts`, `en.ts`, `pt-BR.ts`

**Interfaces:**
- Consumes: an account whose `app_metadata` is `{ pending_gym_id: "<uuid>" }` with no `gym_id`. Task 5 creates such accounts; Task 6 approves them as `{ gym_id: "<uuid>", pending_gym_id: null }`.
- Produces: `PENDING_PATH = "/pending"` (exported from `require-admin.ts`); `AdminSession.pendingApproval: boolean`; dictionary section `t.pending`.

No Vitest: proxy and guards are not pure. Verified in the running app (Step 6).

- [ ] **Step 1: Add the dictionary strings**

In `frontend/utils/i18n/dictionaries/it.ts`, add a new section right after the `suspended: { … },` section:

```ts
  pending: {
    title: "Richiesta in attesa",
    body: "La tua richiesta di iscrizione è stata inviata. Lo staff della palestra deve approvarla: appena lo farà potrai usare l'app con questo account.",
    checkAgain: "Verifica di nuovo",
  },
```

In `en.ts`, at the same position:

```ts
  pending: {
    title: "Request pending",
    body: "Your registration request has been sent. The gym's staff has to approve it: as soon as they do, you can use the app with this account.",
    checkAgain: "Check again",
  },
```

In `pt-BR.ts`, at the same position:

```ts
  pending: {
    title: "Solicitação pendente",
    body: "Sua solicitação de inscrição foi enviada. A equipe da academia precisa aprová-la: assim que isso acontecer, você poderá usar o app com esta conta.",
    checkAgain: "Verificar novamente",
  },
```

- [ ] **Step 2: Expose the pending state in the guards**

In `frontend/utils/supabase/require-admin.ts`:

1. Add `pendingApproval: boolean;` to `type AdminSession` after `mustChangePassword: boolean;`, with this comment above it:

```ts
  /** Signed up through an invite link and not yet approved: no gym, no profile. */
```

2. In `requireSession`, replace the `appMetadata` cast and the return with:

```ts
  const appMetadata = claims.app_metadata as
    | { must_change_password?: boolean; pending_gym_id?: string | null; gym_id?: string | null }
    | undefined;

  return {
    supabase,
    userId: claims.sub as string,
    email: (claims.email as string | undefined) ?? null,
    mustChangePassword: appMetadata?.must_change_password === true,
    // Written only by the service role (app/join/actions.ts sets it, approval
    // clears it), like must_change_password.
    pendingApproval: Boolean(appMetadata?.pending_gym_id) && !appMetadata?.gym_id,
  };
```

3. Under `export const SUSPENDED_PATH = "/suspended";` add:

```ts
export const PENDING_PATH = "/pending";
```

4. In `requireAdmin`, right after the `if (session.mustChangePassword) { … }` block, add:

```ts
  // Signed up through an invite link and waiting for the staff: there is no gym
  // to show yet (RLS shows nothing anyway), only the status of the request.
  if (session.pendingApproval) {
    redirect(PENDING_PATH);
  }
```

- [ ] **Step 3: Redirect pending accounts in the proxy**

In `frontend/utils/supabase/proxy.ts`:

1. Widen the `appMetadata` cast to:

```ts
  const appMetadata = claimsData?.claims?.app_metadata as
    | { must_change_password?: boolean; pending_gym_id?: string | null; gym_id?: string | null }
    | undefined;
```

2. Right after the `must_change_password` redirect block (before `if (isProtected && !isLoggedIn)`), add:

```ts
  // An account that signed up through a gym's invite link and is not approved
  // yet has one page: the status of its request. Signing out and the privacy
  // notice stay reachable for the same reasons as above.
  if (
    isLoggedIn &&
    appMetadata?.pending_gym_id &&
    !appMetadata?.gym_id &&
    pathname !== "/pending" &&
    pathname !== "/privacy" &&
    !pathname.startsWith("/auth/")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/pending";
    url.search = "";
    return NextResponse.redirect(url);
  }
```

3. Add `"/pending"` to `PROTECTED_PREFIXES` (a signed-out visitor is sent to `/login`).

- [ ] **Step 4: Write the "Check again" action**

Create `frontend/app/pending/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { logDbError } from "@/utils/log";
import { createClient } from "@/utils/supabase/server";

// After approval the account's app_metadata has the gym, but the JWT in the
// cookie still carries pending_gym_id until it is refreshed (up to an hour).
// Refreshing here — a server action may write cookies, a page may not — lets
// the athlete in at once; /dashboard sends a still-pending account straight
// back. A rejected request deleted the account, so the refresh fails: sign out
// rather than leave a dead session on this page.
export async function checkAgain() {
  const supabase = createClient(await cookies());
  const { error } = await supabase.auth.refreshSession();

  if (error) {
    logDbError("pending", "refreshSession", { code: error.code ?? null, message: error.message });
    await supabase.auth.signOut();
    revalidatePath("/", "layout");
    redirect("/login");
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
```

- [ ] **Step 5: Write the page**

Create `frontend/app/pending/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PauseIcon } from "@/components/icons";
import { getDictionary } from "@/utils/i18n/server";
import { requireSession } from "@/utils/supabase/require-admin";

import { checkAgain } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.pending.title, robots: { index: false } };
}

// Where an account that signed up through an invite link waits for approval.
// requireSession, not requireAdmin: requireAdmin sends pending accounts here,
// and would send this page back to itself. No gym name: the account has no gym
// yet, so it cannot read one.
export default async function PendingPage() {
  const session = await requireSession("/pending");
  if (!session.pendingApproval) redirect("/dashboard");

  const { t } = await getDictionary();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10 sm:py-14">
      <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
        <PauseIcon className="h-5 w-5 shrink-0 text-accent" />
        {t.pending.title}
      </h1>
      <p className="text-sm leading-relaxed text-foreground/70">{t.pending.body}</p>
      <div className="flex flex-wrap gap-2">
        <form action={checkAgain}>
          <button
            type="submit"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            {t.pending.checkAgain}
          </button>
        </form>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            {t.nav.signOut}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Run (from `frontend/`): `npm run lint` and `npm run build`. Expected: both succeed.

Manual (the `frontend` launch configuration in `.claude/launch.json`, after Task 2's migration is applied to the dev database). Create a pending test account in the Supabase Dashboard SQL editor of the **dev** project, or wait and run these checks in Task 5, Step 9. With a pending account:
a. Signing in lands on `/pending`; opening `/dashboard`, `/account` or `/members` by URL lands on `/pending`; `/privacy` opens; sign-out works.
b. After approving it (Task 6), "Check again" lands on `/dashboard`.
c. After rejecting it (Task 6) while it is signed in elsewhere, "Check again" signs it out to `/login`.

- [ ] **Step 7: Commit**

```bash
git add frontend/utils/supabase/proxy.ts frontend/utils/supabase/require-admin.ts frontend/app/pending frontend/utils/i18n/dictionaries
git commit -m "feat(join): pending accounts see only the status of their request

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Invite link on `/gym`

**Files:**
- Modify: `frontend/app/gym/page.tsx`
- Modify: `frontend/app/gym/actions.ts`
- Modify: `frontend/utils/i18n/dictionaries/it.ts`, `en.ts`, `pt-BR.ts`

**Interfaces:**
- Consumes: the `gym_invite` table and `regenerate_invite_token()` (Task 2); `CopyCredentials` from `@/components/copy-password` (props `text`, `copyLabel`, `copiedLabel`, `failedLabel`); `ConfirmSubmitButton` from `@/components/confirm-submit-button` (props `message`, `className`, children).
- Produces: `regenerateInvite()` server action; the link format `${SITE_URL}/join/<token>`, which Task 5 serves.

- [ ] **Step 1: Add the dictionary strings**

In each dictionary's `myGym` section, after `failed: …,`, add the keys below.

`it.ts`:

```ts
    inviteSection: "Link di iscrizione",
    inviteHelp:
      "Chi apre questo link può chiedere di iscriversi alla palestra. Ogni richiesta va approvata nel Registro, alla voce «Richieste di iscrizione».",
    inviteNone: "Nessun link attivo.",
    inviteGenerate: "Genera link",
    inviteRegenerate: "Rigenera link",
    inviteRegenerateConfirm:
      "Il link attuale smetterà di funzionare. Le richieste già inviate restano. Continuare?",
    inviteCopy: "Copia il link",
    inviteCopied: "Link copiato",
    inviteCopyFailed: "Copia non riuscita: selezionalo e copialo a mano",
    inviteGenerated: "Nuovo link di iscrizione pronto.",
    inviteFailed: "Non è stato possibile generare il link. Riprova.",
```

`en.ts`:

```ts
    inviteSection: "Registration link",
    inviteHelp:
      "Whoever opens this link can ask to join the gym. Every request must be approved in the Registry, under “Registration requests”.",
    inviteNone: "No active link.",
    inviteGenerate: "Generate link",
    inviteRegenerate: "Regenerate link",
    inviteRegenerateConfirm:
      "The current link will stop working. Requests already sent are kept. Continue?",
    inviteCopy: "Copy link",
    inviteCopied: "Link copied",
    inviteCopyFailed: "Copy failed: select it and copy it by hand",
    inviteGenerated: "New registration link ready.",
    inviteFailed: "The link could not be generated. Try again.",
```

`pt-BR.ts`:

```ts
    inviteSection: "Link de inscrição",
    inviteHelp:
      "Quem abrir este link pode pedir para se inscrever na academia. Cada solicitação precisa ser aprovada no Registro, em “Solicitações de inscrição”.",
    inviteNone: "Nenhum link ativo.",
    inviteGenerate: "Gerar link",
    inviteRegenerate: "Gerar novo link",
    inviteRegenerateConfirm:
      "O link atual deixará de funcionar. As solicitações já enviadas são mantidas. Continuar?",
    inviteCopy: "Copiar link",
    inviteCopied: "Link copiado",
    inviteCopyFailed: "Falha ao copiar: selecione e copie manualmente",
    inviteGenerated: "Novo link de inscrição pronto.",
    inviteFailed: "Não foi possível gerar o link. Tente novamente.",
```

- [ ] **Step 2: Write the action**

Append to `frontend/app/gym/actions.ts`:

```ts
// The manager has no write on gym_invite: regenerate_invite_token() draws a new
// link for their own gym and re-checks can_manage_users() itself. The old link
// stops working at once; requests already sent are not touched.
export async function regenerateInvite() {
  const { t } = await getDictionary();
  const { supabase } = await requireUserManager(PAGE);

  const { error } = await supabase.rpc("regenerate_invite_token");
  if (error) {
    logDbError("gym", "regenerateInvite", error);
    to({ error: t.myGym.inviteFailed });
  }

  revalidatePath(PAGE);
  to({ ok: t.myGym.inviteGenerated });
}
```

- [ ] **Step 3: Render the section**

In `frontend/app/gym/page.tsx`:

1. Add the imports:

```ts
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CopyCredentials } from "@/components/copy-password";
import { logDbError } from "@/utils/log";
```

and change `import { setGymLocation } from "./actions";` to `import { regenerateInvite, setGymLocation } from "./actions";`.

2. Replace `await requireUserManager("/gym");` with:

```ts
  const { supabase } = await requireUserManager("/gym");
```

and after `const gym = await requireGymSettings();` add:

```ts
  // RLS: only user managers of this gym read it. No row = no link generated yet.
  const { data: invite, error: inviteError } = await supabase
    .from("gym_invite")
    .select("token")
    .maybeSingle();
  if (inviteError) logDbError("gym", "gym_invite", inviteError);
  const inviteUrl = invite ? `${SITE_URL}/join/${(invite as { token: string }).token}` : null;
```

3. Insert this section between the location `</section>` and the `{/* \`scroll-mt\` keeps …` comment of the QR section:

```tsx
      <section className={`${sectionClass} print:hidden`}>
        <h2 className="font-heading text-base font-semibold sm:text-lg">{t.myGym.inviteSection}</h2>
        <p className="text-sm text-foreground/65">{t.myGym.inviteHelp}</p>
        {inviteUrl ? (
          <div className="flex flex-col gap-2">
            <code className="break-all rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              {inviteUrl}
            </code>
            <CopyCredentials
              text={inviteUrl}
              copyLabel={t.myGym.inviteCopy}
              copiedLabel={t.myGym.inviteCopied}
              failedLabel={t.myGym.inviteCopyFailed}
            />
          </div>
        ) : (
          <p className="text-sm text-foreground/65">{t.myGym.inviteNone}</p>
        )}
        <form action={regenerateInvite}>
          {inviteUrl ? (
            <ConfirmSubmitButton
              message={t.myGym.inviteRegenerateConfirm}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              {t.myGym.inviteRegenerate}
            </ConfirmSubmitButton>
          ) : (
            <button
              type="submit"
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              {t.myGym.inviteGenerate}
            </button>
          )}
        </form>
      </section>
```

- [ ] **Step 4: Verify**

Run (from `frontend/`): `npm run lint` and `npm run build`. Expected: both succeed.

Manual, as a head coach of the dev gym on `/gym`:
a. "No active link" and "Generate link" → after clicking, the link appears with a success message, and "Copy link" copies it.
b. "Regenerate link" asks for confirmation; after confirming, the link changes.
c. As an instructor or a student, `/gym` answers 404 (unchanged guard).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/gym frontend/utils/i18n/dictionaries
git commit -m "feat(gym): generate and regenerate the gym's registration link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Public form `/join/<token>`

**Files:**
- Create: `frontend/utils/turnstile-verify.ts`
- Create: `frontend/utils/supabase/invite.ts`
- Create: `frontend/app/join/actions.ts`
- Create: `frontend/app/join/[token]/page.tsx`
- Create: `frontend/app/join/[token]/join-form.tsx`
- Modify: `frontend/utils/supabase/proxy.ts` (signed-in visitors leave `/join`)
- Modify: `frontend/app/login/page.tsx` (notice after registration)
- Modify: `frontend/utils/i18n/dictionaries/it.ts`, `en.ts`, `pt-BR.ts`
- Modify: `frontend/.env.local` (by the user), plus the Vercel project env

**Interfaces:**
- Consumes: `parseRegistration`, `RegistrationError` (Task 1); `gym_for_invite`, `username_available`, `registration_request` (Task 2); `turnstileToken(formData)` from `@/utils/turnstile`; `Turnstile` component (`action` prop); `PasswordInput` (`id`, `name`, `required`, `autoComplete`, `showLabel`, `hideLabel`); `suggestUsername`, `normalizeUsername`, `isValidUsername`, `USERNAME_MAX` from `@/utils/username`; `beltLabels(t)` from `@/utils/supabase/profile`; `todayIn(timezone)` from `@/utils/dates`.
- Produces: `gymForInvite(admin, token): Promise<string | null>`; `verifyTurnstile(token): Promise<boolean>`; `register(token, prev: JoinState, formData) : Promise<JoinState>`; `checkUsername(token, username): Promise<UsernameStatus>`; `type JoinState = { error: string | null; values: Record<string, string>; attempt: number }`; `type UsernameStatus = "available" | "taken" | "invalid" | "error"`; dictionary `t.join` (with `t.join.form` holding plain strings only, since it is passed to a Client Component, and `t.join.errors`), and `t.auth.registeredNotice`. Task 6 reuses `t.join.form` and `t.join.errors`.

- [ ] **Step 1: Add the dictionary strings**

`it.ts`: add to `auth`, after `hidePassword: …,`:

```ts
    registeredNotice: "Richiesta inviata. Accedi con la tua email o il tuo username per seguirne lo stato.",
```

and add a new section right after the `pending: { … },` section from Task 3:

```ts
  join: {
    title: (gym: string) => `Iscriviti a ${gym}`,
    lead: "Compila i tuoi dati e invia la richiesta: lo staff della palestra la controlla e la approva. Nel frattempo puoi già accedere, ma vedrai solo lo stato della richiesta.",
    // Solo stringhe: viene passato così com'è a un Client Component.
    form: {
      fullName: "Nome e cognome",
      email: "Email",
      username: "Username",
      usernameHelp:
        "Da 3 a 30 caratteri: lettere minuscole, numeri, punto, trattino e trattino basso. Potrai usarlo per accedere al posto dell'email.",
      usernameChecking: "Controllo disponibilità…",
      usernameAvailable: "Disponibile",
      usernameTaken: "Già in uso: scegline un altro",
      usernameInvalid: "Formato non valido",
      usernameUnknown: "Impossibile verificare adesso: lo controlliamo all'invio",
      password: "Password",
      passwordRepeat: "Ripeti la password",
      passwordHint: "Almeno 8 caratteri.",
      showPassword: "Mostra la password",
      hidePassword: "Nascondi la password",
      birthDate: "Data di nascita",
      joinedAt: "Iscritto in palestra dal",
      experienced: "Hai già praticato BJJ?",
      experiencedYes: "Sì",
      experiencedNo: "No, è la prima volta",
      beginnerNote: "Partirai da cintura bianca, 0 tacche.",
      belt: "Cintura attuale",
      select: "Seleziona…",
      stripes: "Tacche",
      rankSince: "Data della cintura attuale (se la ricordi)",
      stripeSince: "Data dell'ultima tacca (se la ricordi)",
      datesHint: "Se non ricordi una data lasciala vuota: lo staff potrà correggerla.",
      privacyConsent: "Ho letto l'informativa sulla privacy",
      privacyLink: "Leggi l'informativa",
      submit: "Invia la richiesta",
      sending: "Invio…",
    },
    errors: {
      nameRequired: "Inserisci nome e cognome.",
      emailInvalid: "Inserisci un indirizzo email valido.",
      usernameInvalid:
        "Lo username deve avere da 3 a 30 caratteri: lettere minuscole, numeri, punto, trattino, trattino basso.",
      usernameTaken: "Questo username è già in uso: scegline un altro.",
      passwordTooShort: "La password deve avere almeno 8 caratteri.",
      passwordMismatch: "Le due password non coincidono.",
      passwordWeak: "La password non rispetta i requisiti di sicurezza: scegline una più lunga o più varia.",
      birthDateInvalid: "Inserisci una data di nascita valida, nel passato.",
      joinedAtInvalid: "Inserisci la data di iscrizione in palestra.",
      dateInvalid: "Una delle date non è valida.",
      dateInFuture: "Le date non possono essere nel futuro.",
      experienceRequired: "Indica se hai già praticato BJJ.",
      beltInvalid: "Scegli la cintura.",
      beltForAge:
        "Questa cintura non corrisponde all'età: sotto i 16 anni si usano le cinture bambini, dai 18 quelle adulti.",
      stripesInvalid: "Numero di tacche non valido per questa cintura.",
      stripeBeforeBelt: "L'ultima tacca non può essere precedente alla cintura attuale.",
      consentRequired: "Per inviare la richiesta devi confermare di aver letto l'informativa sulla privacy.",
      captchaFailed: "Verifica di sicurezza non riuscita. Riprova.",
      linkExpired: "Questo link di invito non è più valido. Chiedine uno nuovo alla tua palestra.",
      failed:
        "Non è stato possibile inviare la richiesta. Se hai già un account, accedi; altrimenti riprova più tardi.",
    },
  },
```

`en.ts`: add to `auth`:

```ts
    registeredNotice: "Request sent. Sign in with your email or username to follow its status.",
```

and after `pending`:

```ts
  join: {
    title: (gym: string) => `Join ${gym}`,
    lead: "Fill in your details and send the request: the gym's staff reviews and approves it. Meanwhile you can already sign in, but you will only see the status of your request.",
    form: {
      fullName: "Full name",
      email: "Email",
      username: "Username",
      usernameHelp:
        "3 to 30 characters: lower-case letters, digits, dot, hyphen and underscore. You can use it to sign in instead of your email.",
      usernameChecking: "Checking availability…",
      usernameAvailable: "Available",
      usernameTaken: "Already taken: pick another one",
      usernameInvalid: "Invalid format",
      usernameUnknown: "Can't check right now: we'll check it when you send",
      password: "Password",
      passwordRepeat: "Repeat password",
      passwordHint: "At least 8 characters.",
      showPassword: "Show password",
      hidePassword: "Hide password",
      birthDate: "Date of birth",
      joinedAt: "At the gym since",
      experienced: "Have you trained BJJ before?",
      experiencedYes: "Yes",
      experiencedNo: "No, it's my first time",
      beginnerNote: "You will start as a white belt, 0 stripes.",
      belt: "Current belt",
      select: "Select…",
      stripes: "Stripes",
      rankSince: "Date of current belt (if you remember)",
      stripeSince: "Date of last stripe (if you remember)",
      datesHint: "If you don't remember a date, leave it empty: the staff can correct it.",
      privacyConsent: "I have read the privacy notice",
      privacyLink: "Read the notice",
      submit: "Send request",
      sending: "Sending…",
    },
    errors: {
      nameRequired: "Enter your full name.",
      emailInvalid: "Enter a valid email address.",
      usernameInvalid:
        "The username must be 3 to 30 characters: lower-case letters, digits, dot, hyphen, underscore.",
      usernameTaken: "This username is already taken: pick another one.",
      passwordTooShort: "The password must be at least 8 characters.",
      passwordMismatch: "The two passwords do not match.",
      passwordWeak: "The password does not meet the security requirements: choose a longer or more varied one.",
      birthDateInvalid: "Enter a valid date of birth, in the past.",
      joinedAtInvalid: "Enter the date you joined the gym.",
      dateInvalid: "One of the dates is not valid.",
      dateInFuture: "Dates cannot be in the future.",
      experienceRequired: "Tell us whether you have trained BJJ before.",
      beltInvalid: "Choose the belt.",
      beltForAge:
        "This belt does not match the age: children's belts are used under 16, adult belts from 18.",
      stripesInvalid: "Number of stripes not valid for this belt.",
      stripeBeforeBelt: "The last stripe cannot predate the current belt.",
      consentRequired: "To send the request, confirm that you have read the privacy notice.",
      captchaFailed: "Security check failed. Try again.",
      linkExpired: "This invite link is no longer valid. Ask your gym for a new one.",
      failed: "The request could not be sent. If you already have an account, sign in; otherwise try again later.",
    },
  },
```

`pt-BR.ts`: add to `auth`:

```ts
    registeredNotice: "Solicitação enviada. Entre com seu e-mail ou nome de usuário para acompanhar o status.",
```

and after `pending`:

```ts
  join: {
    title: (gym: string) => `Inscreva-se em ${gym}`,
    lead: "Preencha seus dados e envie a solicitação: a equipe da academia a revisa e aprova. Enquanto isso você já pode entrar, mas verá apenas o status da solicitação.",
    form: {
      fullName: "Nome completo",
      email: "E-mail",
      username: "Nome de usuário",
      usernameHelp:
        "De 3 a 30 caracteres: letras minúsculas, números, ponto, hífen e sublinhado. Você poderá usá-lo para entrar no lugar do e-mail.",
      usernameChecking: "Verificando disponibilidade…",
      usernameAvailable: "Disponível",
      usernameTaken: "Já em uso: escolha outro",
      usernameInvalid: "Formato inválido",
      usernameUnknown: "Não foi possível verificar agora: verificaremos no envio",
      password: "Senha",
      passwordRepeat: "Repita a senha",
      passwordHint: "Pelo menos 8 caracteres.",
      showPassword: "Mostrar a senha",
      hidePassword: "Ocultar a senha",
      birthDate: "Data de nascimento",
      joinedAt: "Na academia desde",
      experienced: "Você já treinou BJJ?",
      experiencedYes: "Sim",
      experiencedNo: "Não, é a primeira vez",
      beginnerNote: "Você começará na faixa branca, 0 graus.",
      belt: "Faixa atual",
      select: "Selecione…",
      stripes: "Graus",
      rankSince: "Data da faixa atual (se lembrar)",
      stripeSince: "Data do último grau (se lembrar)",
      datesHint: "Se não lembrar uma data, deixe em branco: a equipe poderá corrigi-la.",
      privacyConsent: "Li o aviso de privacidade",
      privacyLink: "Ler o aviso",
      submit: "Enviar solicitação",
      sending: "Enviando…",
    },
    errors: {
      nameRequired: "Informe o nome completo.",
      emailInvalid: "Informe um endereço de e-mail válido.",
      usernameInvalid:
        "O nome de usuário deve ter de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen, sublinhado.",
      usernameTaken: "Este nome de usuário já está em uso: escolha outro.",
      passwordTooShort: "A senha deve ter pelo menos 8 caracteres.",
      passwordMismatch: "As duas senhas não coincidem.",
      passwordWeak: "A senha não atende aos requisitos de segurança: escolha uma mais longa ou variada.",
      birthDateInvalid: "Informe uma data de nascimento válida, no passado.",
      joinedAtInvalid: "Informe a data de inscrição na academia.",
      dateInvalid: "Uma das datas não é válida.",
      dateInFuture: "As datas não podem estar no futuro.",
      experienceRequired: "Informe se você já treinou BJJ.",
      beltInvalid: "Escolha a faixa.",
      beltForAge:
        "Esta faixa não corresponde à idade: abaixo de 16 anos usam-se as faixas infantis, a partir dos 18 as adultas.",
      stripesInvalid: "Número de graus inválido para esta faixa.",
      stripeBeforeBelt: "O último grau não pode ser anterior à faixa atual.",
      consentRequired: "Para enviar a solicitação, confirme que leu o aviso de privacidade.",
      captchaFailed: "Verificação de segurança falhou. Tente novamente.",
      linkExpired: "Este link de convite não é mais válido. Peça um novo à sua academia.",
      failed:
        "Não foi possível enviar a solicitação. Se você já tem uma conta, entre; caso contrário, tente mais tarde.",
    },
  },
```

- [ ] **Step 2: Write the Turnstile verification**

Create `frontend/utils/turnstile-verify.ts`:

```ts
import "server-only";

// Server-side Turnstile check for the one form Supabase cannot protect: the
// invite signup. Login and recovery hand the token to Supabase, which verifies
// it (utils/turnstile.ts explains why the app must not verify those too). The
// signup creates its account with the service role instead of signUp() — the
// public signup endpoint stays disabled, or anyone could skip the invite — so
// no Supabase check runs and this one is the only one.
//
// Fails closed: no secret configured, no token, or Cloudflare unreachable
// means "not verified". For local development use Cloudflare's test keys
// (sitekey 1x00000000000000000000AA, secret 1x0000000000000000000000000000000AA).
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("[join] TURNSTILE_SECRET_KEY is not set: registration refused");
    return false;
  }
  if (!token) return false;

  try {
    const response = await fetch(SITEVERIFY, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
    });
    const body = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
    if (body.success !== true) {
      console.error(`[join] Turnstile refused: ${(body["error-codes"] ?? []).join(",")}`);
    }
    return body.success === true;
  } catch (cause) {
    console.error("[join] Turnstile siteverify failed", cause);
    return false;
  }
}
```

- [ ] **Step 3: Write the invite lookup**

Create `frontend/utils/supabase/invite.ts`:

```ts
import "server-only";

import type { createAdminClient } from "@/utils/supabase/admin";
import { logDbError } from "@/utils/log";

// The gym an invite link belongs to, or null when the link is unknown,
// regenerated, or its gym suspended. Service role: gym_for_invite() is not
// executable by anyone else. The shape check spares the database every
// random string a crawler tries.
const TOKEN = /^[0-9a-f]{64}$/;

export async function gymForInvite(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
): Promise<string | null> {
  if (!TOKEN.test(token)) return null;
  const { data, error } = await admin.rpc("gym_for_invite", { p_token: token });
  if (error) logDbError("join", "gym_for_invite", error);
  return (data as string | null) ?? null;
}
```

- [ ] **Step 4: Write the actions**

Create `frontend/app/join/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";

import { todayIn } from "@/utils/dates";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { parseRegistration } from "@/utils/registration";
import { createAdminClient } from "@/utils/supabase/admin";
import { gymForInvite } from "@/utils/supabase/invite";
import { turnstileToken } from "@/utils/turnstile";
import { verifyTurnstile } from "@/utils/turnstile-verify";
import { isValidUsername, normalizeUsername } from "@/utils/username";

export type JoinState = { error: string | null; values: Record<string, string>; attempt: number };
export type UsernameStatus = "available" | "taken" | "invalid" | "error";

// Sent back on an error so the form is refilled (React resets a form after its
// action runs). Never the passwords.
const KEPT = [
  "full_name", "email", "username", "birth_date", "joined_at", "experienced",
  "current_belt", "current_stripes", "rank_since", "stripe_since",
] as const;

// Self-registration through a gym's invite link. Creates the account at once —
// the athlete's own password, no email, address marked confirmed — with the gym
// in app_metadata.pending_gym_id and NOT in gym_id, so the auth trigger creates
// no profile and the account sees nothing until a user manager approves it
// (app/members/requests/actions.ts).
//
// Account first, then the request: createUser is the step that fails on a
// taken email. If the request cannot be written, the account is deleted again.
export async function register(token: string, prev: JoinState, formData: FormData): Promise<JoinState> {
  const { t } = await getDictionary();
  const values = Object.fromEntries(KEPT.map((key) => [key, String(formData.get(key) ?? "")]));
  const fail = (error: string): JoinState => ({ error, values, attempt: prev.attempt + 1 });

  if (!(await verifyTurnstile(turnstileToken(formData)))) return fail(t.join.errors.captchaFailed);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return fail(t.join.errors.failed);
  }

  // Re-read: the link may have been regenerated since the page was opened.
  const gymId = await gymForInvite(admin, token);
  if (!gymId) return fail(t.join.errors.linkExpired);

  const { data: gym, error: gymError } = await admin.from("gym").select("timezone").eq("id", gymId).single();
  if (gymError || !gym) {
    if (gymError) logDbError("join", "register:gym", gymError);
    return fail(t.join.errors.failed);
  }

  const parsed = parseRegistration(
    (key) => formData.get(key) as string | null,
    todayIn((gym as { timezone: string }).timezone),
    "signup",
  );
  if (!parsed.ok) return fail(t.join.errors[parsed.error]);
  const r = parsed.value;

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: r.email,
    password: r.password as string,
    email_confirm: true,
    user_metadata: { full_name: r.fullName },
    app_metadata: { pending_gym_id: gymId },
  });
  if (authError || !created?.user) {
    logDbError("join", "register:createUser", {
      code: authError?.code ?? "no-user",
      message: authError?.message ?? "no user returned",
    });
    // A taken email gets the generic message: saying so would tell anyone with
    // the link who has an account. A weak password reveals nothing.
    return fail(authError?.code === "weak_password" ? t.join.errors.passwordWeak : t.join.errors.failed);
  }

  const { error: insertError } = await admin.from("registration_request").insert({
    gym_id: gymId,
    auth_user_id: created.user.id,
    full_name: r.fullName,
    email: r.email,
    username: r.username,
    birth_date: r.birthDate,
    joined_at: r.joinedAt,
    current_belt: r.belt,
    current_stripes: r.stripes,
    rank_since: r.rankSince,
    stripe_since: r.stripeSince,
  });
  if (insertError) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(created.user.id);
    if (deleteError) {
      logDbError("join", "register:rollback", { code: deleteError.code ?? null, message: deleteError.message });
    }
    // 23505 here is the username: taken between the live check and submit.
    if (insertError.code === "23505") return fail(t.join.errors.usernameTaken);
    logDbError("join", "register:insert", insertError);
    return fail(t.join.errors.failed);
  }

  redirect("/login?registered=1");
}

// The form's live check. Answers only for a valid link — never a public
// "does this username exist" endpoint. Accepted trade-off (spec): the login
// hides whether a username exists, this reveals it to whoever holds the link.
export async function checkUsername(token: string, raw: string): Promise<UsernameStatus> {
  const username = normalizeUsername(raw);
  if (!isValidUsername(username)) return "invalid";

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return "error";
  }
  if (!(await gymForInvite(admin, token))) return "error";

  const { data, error } = await admin.rpc("username_available", { p_username: username });
  if (error) {
    logDbError("join", "username_available", error);
    return "error";
  }
  return data === true ? "available" : "taken";
}
```

- [ ] **Step 5: Write the form**

Create `frontend/app/join/[token]/join-form.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type ReactNode } from "react";

import { AlertCircleIcon } from "@/components/icons";
import { PasswordInput } from "@/components/password-input";
import type { Dictionary } from "@/utils/i18n/dictionaries/it";
import { isValidUsername, normalizeUsername, suggestUsername, USERNAME_MAX } from "@/utils/username";

import type { JoinState, UsernameStatus } from "../actions";

type Labels = Dictionary["join"]["form"];

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";

const INITIAL: JoinState = { error: null, values: {}, attempt: 0 };

export function JoinForm({
  action,
  checkUsername,
  labels,
  belts,
  turnstile,
}: {
  action: (prev: JoinState, formData: FormData) => Promise<JoinState>;
  checkUsername: (username: string) => Promise<UsernameStatus>;
  labels: Labels;
  belts: { value: string; label: string }[];
  turnstile: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  // A Turnstile token is redeemed once: after a refused attempt the widget
  // needs a fresh one, or the next submit fails the check again.
  useEffect(() => {
    if (state.attempt > 0) {
      (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset();
    }
  }, [state.attempt]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Remounted on every attempt so the fields restart from the values the
          action sent back. */}
      <Fields key={state.attempt} values={state.values} labels={labels} belts={belts} checkUsername={checkUsername} />

      {state.error ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      {turnstile}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? labels.sending : labels.submit}
      </button>
    </form>
  );
}

function Fields({
  values,
  labels,
  belts,
  checkUsername,
}: {
  values: Record<string, string>;
  labels: Labels;
  belts: { value: string; label: string }[];
  checkUsername: (username: string) => Promise<UsernameStatus>;
}) {
  const [name, setName] = useState(values.full_name ?? "");
  // The username follows the name (Mario Rossi → mario.rossi) until typed by hand.
  const [typed, setTyped] = useState<string | null>(values.username || null);
  const username = typed ?? (name.trim() ? suggestUsername(name) : "");
  const [experienced, setExperienced] = useState(values.experienced ?? "");

  // Format checked here; availability asked of the server after a pause. The
  // answer is kept with the name it answers for, so a late reply for an old
  // name is never shown against the new one.
  const candidate = normalizeUsername(username);
  const [answer, setAnswer] = useState<{ candidate: string; status: UsernameStatus } | null>(null);
  useEffect(() => {
    if (!isValidUsername(candidate)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const status = await checkUsername(candidate);
      if (!cancelled) setAnswer({ candidate, status });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [candidate, checkUsername]);

  const status: "idle" | "checking" | UsernameStatus = !candidate
    ? "idle"
    : !isValidUsername(candidate)
      ? "invalid"
      : answer?.candidate === candidate
        ? answer.status
        : "checking";
  const statusText = {
    idle: labels.usernameHelp,
    checking: labels.usernameChecking,
    available: labels.usernameAvailable,
    taken: labels.usernameTaken,
    invalid: labels.usernameInvalid,
    error: labels.usernameUnknown,
  }[status];
  const statusClass =
    status === "available" ? "text-foreground/80" : status === "taken" || status === "invalid" ? "text-accent" : "text-foreground/55";

  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="full_name" className="text-sm font-medium">{labels.fullName}</label>
        <input
          id="full_name"
          name="full_name"
          required
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">{labels.email}</label>
        <input id="email" name="email" type="email" required autoComplete="email" defaultValue={values.email} className={fieldClass} />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor="username" className="text-sm font-medium">{labels.username}</label>
        <input
          id="username"
          name="username"
          required
          value={username}
          onChange={(event) => setTyped(event.target.value)}
          maxLength={USERNAME_MAX}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby="username-status"
          className={fieldClass}
        />
        <p id="username-status" aria-live="polite" className={`text-xs ${statusClass}`}>{statusText}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">{labels.password}</label>
        <PasswordInput id="password" name="password" required autoComplete="new-password" showLabel={labels.showPassword} hideLabel={labels.hidePassword} />
        <p className="text-xs text-foreground/55">{labels.passwordHint}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password_repeat" className="text-sm font-medium">{labels.passwordRepeat}</label>
        <PasswordInput id="password_repeat" name="password_repeat" required autoComplete="new-password" showLabel={labels.showPassword} hideLabel={labels.hidePassword} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="birth_date" className="text-sm font-medium">{labels.birthDate}</label>
        <input id="birth_date" name="birth_date" type="date" required defaultValue={values.birth_date} className={fieldClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="joined_at" className="text-sm font-medium">{labels.joinedAt}</label>
        <input id="joined_at" name="joined_at" type="date" required defaultValue={values.joined_at} className={fieldClass} />
      </div>

      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">{labels.experienced}</legend>
        <div className="flex flex-wrap gap-4">
          {(["yes", "no"] as const).map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="experienced"
                value={value}
                required
                checked={experienced === value}
                onChange={() => setExperienced(value)}
              />
              {value === "yes" ? labels.experiencedYes : labels.experiencedNo}
            </label>
          ))}
        </div>
        {experienced === "no" ? <p className="text-xs text-foreground/55">{labels.beginnerNote}</p> : null}
      </fieldset>

      {experienced === "yes" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="current_belt" className="text-sm font-medium">{labels.belt}</label>
            <select id="current_belt" name="current_belt" required defaultValue={values.current_belt ?? ""} className={fieldClass}>
              <option value="" disabled>{labels.select}</option>
              {belts.map((belt) => (
                <option key={belt.value} value={belt.value}>{belt.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="current_stripes" className="text-sm font-medium">{labels.stripes}</label>
            <select id="current_stripes" name="current_stripes" defaultValue={values.current_stripes || "0"} className={fieldClass}>
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="rank_since" className="text-sm font-medium">{labels.rankSince}</label>
            <input id="rank_since" name="rank_since" type="date" defaultValue={values.rank_since} className={fieldClass} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="stripe_since" className="text-sm font-medium">{labels.stripeSince}</label>
            <input id="stripe_since" name="stripe_since" type="date" defaultValue={values.stripe_since} className={fieldClass} />
          </div>

          <p className="text-xs text-foreground/55 sm:col-span-2">{labels.datesHint}</p>
        </>
      ) : null}

      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="privacy" required className="mt-0.5" />
        <span>
          {labels.privacyConsent} —{" "}
          <Link href="/privacy" target="_blank" className="font-medium text-accent hover:opacity-80">
            {labels.privacyLink}
          </Link>
        </span>
      </label>
    </div>
  );
}
```

- [ ] **Step 6: Write the page**

Create `frontend/app/join/[token]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Turnstile } from "@/components/turnstile";
import { getDictionary } from "@/utils/i18n/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { gymForInvite } from "@/utils/supabase/invite";
import { beltLabels } from "@/utils/supabase/profile";

import { checkUsername, register } from "../actions";
import { JoinForm } from "./join-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.join.form.submit, robots: { index: false } };
}

// Public: whoever holds the gym's link may ask to join. An unknown,
// regenerated or suspended gym's link answers 404, like any page that does not
// exist. The gym's name is read with the service role — a visitor has no
// session, and gym_for_invite() has just vouched for this gym.
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t } = await getDictionary();

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    notFound();
  }
  const gymId = await gymForInvite(admin, token);
  if (!gymId) notFound();
  const { data: gym } = await admin.from("gym").select("name").eq("id", gymId).single();
  if (!gym) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.join.title((gym as { name: string }).name)}
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">{t.join.lead}</p>
      </div>
      <JoinForm
        action={register.bind(null, token)}
        checkUsername={checkUsername.bind(null, token)}
        labels={t.join.form}
        belts={Object.entries(beltLabels(t)).map(([value, label]) => ({ value, label }))}
        turnstile={<Turnstile action="register" />}
      />
    </div>
  );
}
```

- [ ] **Step 7: Proxy and login notice**

In `frontend/utils/supabase/proxy.ts`, replace

```ts
  if (isLoggedIn && VISITOR_ONLY.includes(pathname)) {
```

with

```ts
  if (isLoggedIn && (VISITOR_ONLY.includes(pathname) || underPath(pathname, "/join"))) {
```

and extend the comment above `VISITOR_ONLY` with: `So is a gym's invite form: an account has nothing to sign up for.`

In `frontend/app/login/page.tsx`:
1. Change the `searchParams` type to `Promise<{ error?: string; next?: string; registered?: string }>` and destructure `registered`.
2. Import `CheckCircleIcon` with `AlertCircleIcon` from `@/components/icons`.
3. Right after `<form action={login} className="flex flex-col gap-4">` and its hidden `next` input, add:

```tsx
        {registered === "1" ? (
          <p className="flex items-start gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-sm">
            <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {t.auth.registeredNotice}
          </p>
        ) : null}
```

- [ ] **Step 8: Configure the secret**

Ask the user to add `TURNSTILE_SECRET_KEY=<secret of the same Turnstile widget as NEXT_PUBLIC_TURNSTILE_SITEKEY>` to `frontend/.env.local` and to the Vercel project's environment variables (Production and Preview). For local work without the real widget, use Cloudflare's test pair in `.env.local`: `NEXT_PUBLIC_TURNSTILE_SITEKEY=1x00000000000000000000AA` and `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`. Do not commit either file.

- [ ] **Step 9: Verify**

Run (from `frontend/`): `npm test`, `npm run lint`, `npm run build`. Expected: all succeed.

Manual, in the running app (`frontend` launch configuration), with the link generated in Task 4, signed out:
a. Open the link: the form shows the gym's name. A random `/join/abc` answers 404.
b. Type a name: the username follows it. Change it by hand to an existing username: "Already taken". Type `A@` to see "Invalid format". Type a free one: "Available".
c. Choose "No": the beginner note appears. Choose "Yes": belt, stripes and both dates appear.
d. Regenerate the link in another (signed-in) browser, then submit the open form: "This invite link is no longer valid", and no account appears in Supabase Auth.
e. With a fresh link: submit with two different passwords to see the error, with the other fields refilled. Then submit valid data: you land on `/login` with the notice. Sign in with the **username**: you land on `/pending` (Task 3 check a). Submit the same email again from another browser: generic error.
f. While signed in, opening the link redirects to `/dashboard`.

- [ ] **Step 10: Commit**

```bash
git add frontend/utils/turnstile-verify.ts frontend/utils/supabase/invite.ts frontend/app/join frontend/utils/supabase/proxy.ts frontend/app/login/page.tsx frontend/utils/i18n/dictionaries
git commit -m "feat(join): public registration form behind the gym's invite link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Approval list `/members/requests`

**Files:**
- Create: `frontend/app/members/requests/linked-person.ts`
- Create: `frontend/app/members/requests/actions.ts`
- Create: `frontend/app/members/requests/page.tsx`
- Modify: `frontend/app/members/page.tsx` (chip)
- Modify: `frontend/app/gyms/actions.ts` (`deleteGym` collects pending accounts)
- Modify: `frontend/utils/i18n/dictionaries/it.ts`, `en.ts`, `pt-BR.ts`

**Interfaces:**
- Consumes: `parseRegistration` (Task 1); `registration_request` (Task 2); `t.join.form`, `t.join.errors` (Task 5); `requireUserManager`, `requireGymSettings` (`GymSettings.id`, `.timezone`); `activeRoles(supabase, personId)` from `@/utils/supabase/profile`; `Belt` (`belt`, `stripes`, `size?`); `ConfirmSubmitButton`; `formatDate`, `todayIn` from `@/utils/dates`.
- Produces: `approveRegistration(formData)`, `rejectRegistration(formData)` (field `request_id`); `linkedPersonFor(supabase, email)`; dictionary `t.requests`.

- [ ] **Step 1: Add the dictionary strings**

`it.ts`, new section after `join`:

```ts
  requests: {
    title: "Richieste di iscrizione",
    lead: "Persone che si sono iscritte con il link della palestra. Controlla e correggi i dati, poi approva: entreranno nel Registro come allievi.",
    chip: (n: number) => `Richieste di iscrizione (${n})`,
    empty: "Nessuna richiesta in attesa.",
    sentOn: (date: string) => `Inviata il ${date}`,
    review: "Controlla e approva",
    approve: "Approva",
    reject: "Rifiuta",
    rejectConfirm: (name: string) =>
      `Rifiutare la richiesta di ${name}? L'account creato con la richiesta verrà eliminato.`,
    linkWarning: (name: string) =>
      `Questa email corrisponde a ${name}, già nel Registro senza account: approvando, l'account verrà collegato a quella scheda, che conserva cintura e date attuali.`,
    approved: (name: string) => `${name} è ora nel Registro.`,
    rejected: (name: string) => `Richiesta di ${name} rifiutata.`,
    alreadyHandled: "Questa richiesta non è più in attesa.",
    emailTaken: "Non è stato possibile usare questa email: potrebbe appartenere già a un altro account.",
    failed: "Operazione non riuscita. Riprova.",
  },
```

`en.ts`:

```ts
  requests: {
    title: "Registration requests",
    lead: "People who signed up with the gym's link. Check and correct their details, then approve: they join the Registry as students.",
    chip: (n: number) => `Registration requests (${n})`,
    empty: "No pending requests.",
    sentOn: (date: string) => `Sent on ${date}`,
    review: "Review and approve",
    approve: "Approve",
    reject: "Reject",
    rejectConfirm: (name: string) =>
      `Reject ${name}'s request? The account created with the request will be deleted.`,
    linkWarning: (name: string) =>
      `This email matches ${name}, already in the Registry without an account: approving links the account to that record, which keeps its current belt and dates.`,
    approved: (name: string) => `${name} is now in the Registry.`,
    rejected: (name: string) => `${name}'s request rejected.`,
    alreadyHandled: "This request is no longer pending.",
    emailTaken: "This email could not be used: it may already belong to another account.",
    failed: "Operation failed. Try again.",
  },
```

`pt-BR.ts`:

```ts
  requests: {
    title: "Solicitações de inscrição",
    lead: "Pessoas que se inscreveram com o link da academia. Confira e corrija os dados, depois aprove: entrarão no Registro como alunos.",
    chip: (n: number) => `Solicitações de inscrição (${n})`,
    empty: "Nenhuma solicitação pendente.",
    sentOn: (date: string) => `Enviada em ${date}`,
    review: "Conferir e aprovar",
    approve: "Aprovar",
    reject: "Recusar",
    rejectConfirm: (name: string) =>
      `Recusar a solicitação de ${name}? A conta criada com a solicitação será excluída.`,
    linkWarning: (name: string) =>
      `Este e-mail corresponde a ${name}, já no Registro sem conta: ao aprovar, a conta será vinculada a esse cadastro, que mantém a faixa e as datas atuais.`,
    approved: (name: string) => `${name} agora está no Registro.`,
    rejected: (name: string) => `Solicitação de ${name} recusada.`,
    alreadyHandled: "Esta solicitação não está mais pendente.",
    emailTaken: "Não foi possível usar este e-mail: ele pode já pertencer a outra conta.",
    failed: "Operação não concluída. Tente novamente.",
  },
```

- [ ] **Step 2: Write the linked-person lookup**

Create `frontend/app/members/requests/linked-person.ts`:

```ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logDbError } from "@/utils/log";

export type LinkedPerson = { id: string; full_name: string };

// The account-less registry row that approval will link the account to: the
// auth trigger (handle_new_auth_user) links a new account to the oldest
// account-less person of the gym with the same email, case-insensitively,
// instead of creating a second row. Asked here, the same way, so the page can
// warn and the action can leave that row's rank alone. Through the user's
// client: RLS keeps it inside the caller's gym. Account-less rows are few (in
// practice, revoked members), so they are compared here rather than with a
// case-insensitive filter that would treat `_` in an address as a wildcard.
export async function accountlessPeople(supabase: SupabaseClient): Promise<(LinkedPerson & { email: string })[]> {
  const { data, error } = await supabase
    .from("person")
    .select("id, full_name, email")
    .is("auth_user_id", null)
    .not("email", "is", null)
    .order("created_at");
  if (error) logDbError("requests", "accountlessPeople", error);
  return (data ?? []) as (LinkedPerson & { email: string })[];
}

export function linkedPersonIn(
  people: (LinkedPerson & { email: string })[],
  email: string,
): LinkedPerson | null {
  const wanted = email.toLowerCase();
  return people.find((p) => p.email.toLowerCase() === wanted) ?? null;
}

export async function linkedPersonFor(supabase: SupabaseClient, email: string): Promise<LinkedPerson | null> {
  return linkedPersonIn(await accountlessPeople(supabase), email);
}
```

- [ ] **Step 3: Write the actions**

Create `frontend/app/members/requests/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { todayIn } from "@/utils/dates";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { parseRegistration } from "@/utils/registration";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireGymSettings } from "@/utils/supabase/gym";
import { activeRoles } from "@/utils/supabase/profile";
import { requireUserManager } from "@/utils/supabase/require-admin";

import { linkedPersonFor } from "./linked-person";

const PATH = "/members/requests";

function back(params: Record<string, string>): never {
  redirect(`${PATH}?${new URLSearchParams(params).toString()}`);
}

type RequestRow = { id: string; auth_user_id: string; gym_id: string; email: string; username: string; full_name: string };

// Read through the user's client: RLS answers only for user managers, only
// inside their gym — that is the proof every service-role call below rests on.
async function requestInMyGym(supabase: SupabaseClient, id: string): Promise<RequestRow | null> {
  if (!id) return null;
  const { data, error } = await supabase
    .from("registration_request")
    .select("id, auth_user_id, gym_id, email, username, full_name")
    .eq("id", id)
    .maybeSingle();
  if (error) logDbError("requests", "requestInMyGym", error);
  return (data as RequestRow | null) ?? null;
}

// Admits a self-registered athlete: the gym goes into the account's
// app_metadata, the auth trigger creates (or links) the person row, and the
// row is filled with the — possibly corrected — data, as addPerson does: with
// the service role, because the starting belt is not a promotion and the
// database accepts a belt change only inside record_promotion() otherwise.
//
// Repeating it is harmless (the trigger, the update and the role check are all
// idempotent), so two managers approving at once end in the same state. A step
// that fails after the gym was assigned puts the account back as pending.
export async function approveRegistration(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireUserManager(PATH);
  const gym = await requireGymSettings();

  const request = await requestInMyGym(supabase, String(formData.get("request_id") ?? ""));
  if (!request) back({ error: t.requests.alreadyHandled });

  // The username is the athlete's and is not edited here (staff never edit
  // usernames); password and consent belong to the signup only.
  const parsed = parseRegistration(
    (key) => (key === "username" ? request.username : (formData.get(key) as string | null)),
    todayIn(gym.timezone),
    "approval",
  );
  if (!parsed.ok) back({ error: t.join.errors[parsed.error] });
  const r = parsed.value;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    back({ error: t.msg.adminClientMissing });
  }

  // Before the gym is assigned: afterwards the row is no longer account-less.
  const linked = await linkedPersonFor(supabase, r.email);
  const uid = request.auth_user_id;

  // First, so a taken address stops everything while nothing has changed yet.
  if (r.email !== request.email) {
    const { error } = await admin.auth.admin.updateUserById(uid, { email: r.email, email_confirm: true });
    if (error) {
      logDbError("requests", "approve:email", { code: error.code ?? null, message: error.message });
      back({ error: t.requests.emailTaken });
    }
  }

  const { error: metaError } = await admin.auth.admin.updateUserById(uid, {
    app_metadata: { gym_id: gym.id, pending_gym_id: null },
  });
  if (metaError) {
    logDbError("requests", "approve:app_metadata", { code: metaError.code ?? null, message: metaError.message });
    back({ error: t.requests.failed });
  }

  // Puts the account back as pending: gym out of app_metadata first (the
  // trigger then does nothing), then the profile it created is removed, or the
  // existing row it linked is unlinked again.
  async function undo(personId: string | null) {
    await admin.auth.admin.updateUserById(uid, { app_metadata: { gym_id: null, pending_gym_id: gym.id } });
    if (!personId) return;
    const { error } = linked
      ? await admin.from("person").update({ auth_user_id: null }).eq("id", personId)
      : await admin.from("person").delete().eq("id", personId);
    if (error) logDbError("requests", "approve:undo", error);
  }

  const { data: person, error: personError } = await admin
    .from("person")
    .select("id")
    .eq("auth_user_id", uid)
    .eq("gym_id", gym.id)
    .maybeSingle();
  if (personError || !person) {
    logDbError("requests", "approve:person", personError ?? { code: "no-rows", message: "trigger created no person" });
    await undo(null);
    back({ error: t.requests.failed });
  }
  const personId = (person as { id: string }).id;

  // A linked existing row keeps its own grade and dates (the warning on the
  // page says so); it only gains the username the athlete chose.
  const { error: updateError } = await admin
    .from("person")
    .update(
      linked
        ? { username: request.username }
        : {
            full_name: r.fullName,
            email: r.email,
            username: request.username,
            birth_date: r.birthDate,
            joined_at: r.joinedAt,
            current_belt: r.belt,
            current_stripes: r.stripes,
            rank_since: r.rankSince,
            stripe_since: r.stripeSince,
          },
    )
    .eq("id", personId);
  if (updateError) {
    logDbError("requests", "approve:profile", updateError);
    await undo(personId);
    back({ error: t.requests.failed });
  }

  // On the user's client, like addPerson: RLS checks the manager may assign it.
  // A linked row that still holds an open role keeps it instead.
  if ((await activeRoles(supabase, personId)).length === 0) {
    const { error: roleError } = await supabase.from("assigned_role").insert({ person_id: personId, role: "student" });
    if (roleError && roleError.code !== "23505") {
      logDbError("requests", "approve:role", roleError);
      await undo(personId);
      back({ error: t.requests.failed });
    }
  }

  // The athlete is in; a request left behind would only reserve the username
  // the profile now holds. Service role: the row was proven ours above.
  const { error: deleteError } = await admin.from("registration_request").delete().eq("id", request.id);
  if (deleteError) logDbError("requests", "approve:delete", deleteError);

  revalidatePath("/members");
  revalidatePath(PATH);
  back({ ok: t.requests.approved(r.fullName) });
}

// Deletes the account the request created; the request goes with it (cascade).
// Refused for an account that already has a gym (approved meanwhile) or is not
// pending for this gym, and never touches a platform admin.
export async function rejectRegistration(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireUserManager(PATH);

  const request = await requestInMyGym(supabase, String(formData.get("request_id") ?? ""));
  if (!request) back({ error: t.requests.alreadyHandled });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    back({ error: t.msg.adminClientMissing });
  }

  const { data: platformAdmin, error: platformAdminError } = await admin
    .from("platform_admin")
    .select("auth_user_id")
    .eq("auth_user_id", request.auth_user_id)
    .maybeSingle();
  if (platformAdminError || platformAdmin) {
    if (platformAdminError) logDbError("requests", "reject:platform_admin", platformAdminError);
    else console.error("[requests] reject refused: target is a platform admin");
    back({ error: t.requests.failed });
  }

  const { data, error } = await admin.auth.admin.getUserById(request.auth_user_id);
  if (error || !data?.user) {
    logDbError("requests", "reject:getUserById", {
      code: error?.code ?? "no-user",
      message: error?.message ?? "no user returned",
    });
    back({ error: t.requests.failed });
  }
  const meta = data.user.app_metadata as { gym_id?: string | null; pending_gym_id?: string | null };
  if (meta.gym_id || meta.pending_gym_id !== request.gym_id) {
    console.error("[requests] reject refused: account is not pending for this gym");
    back({ error: t.requests.alreadyHandled });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(request.auth_user_id);
  if (deleteError) {
    logDbError("requests", "reject:deleteUser", { code: deleteError.code ?? null, message: deleteError.message });
    back({ error: t.requests.failed });
  }

  revalidatePath("/members");
  revalidatePath(PATH);
  back({ ok: t.requests.rejected(request.full_name) });
}
```

- [ ] **Step 4: Write the page**

Create `frontend/app/members/requests/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Belt } from "@/components/belt";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { AlertCircleIcon, CheckCircleIcon, ChevronLeftIcon, UserPlusIcon } from "@/components/icons";
import { formatDate } from "@/utils/dates";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { beltLabels } from "@/utils/supabase/profile";
import { requireUserManager } from "@/utils/supabase/require-admin";

import { approveRegistration, rejectRegistration } from "./actions";
import { accountlessPeople, linkedPersonIn } from "./linked-person";

const PATH = "/members/requests";

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.requests.title };
}

type RequestRow = {
  id: string;
  full_name: string;
  email: string;
  username: string;
  birth_date: string;
  joined_at: string;
  current_belt: string;
  current_stripes: number;
  rank_since: string;
  stripe_since: string;
  created_at: string;
};

// Not a second list of members: these people are not members yet. A sub-route
// of the Registro like /members/new, reached only from its chip strip.
// requireUserManager (404): approving creates an account and sets a belt, which
// is the head coach's and the admin's call, never an instructor's.
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const { t } = await getDictionary();
  const { supabase } = await requireUserManager(PATH);

  const { data, error: listError } = await supabase
    .from("registration_request")
    .select("id, full_name, email, username, birth_date, joined_at, current_belt, current_stripes, rank_since, stripe_since, created_at")
    .order("created_at");
  if (listError) logDbError("requests", "list", listError);
  const requests = (data ?? []) as RequestRow[];
  const people = requests.length ? await accountlessPeople(supabase) : [];
  const belts = Object.entries(beltLabels(t));

  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:gap-5 sm:px-6 sm:py-7">
      <Link href="/members" className="flex w-fit items-center gap-1 text-sm font-medium text-accent hover:opacity-80">
        <ChevronLeftIcon className="h-4 w-4" />
        {t.nav.registro}
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
          <UserPlusIcon className="h-5 w-5 shrink-0 text-accent" />
          {t.requests.title}
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">{t.requests.lead}</p>
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

      {requests.length === 0 ? <p className="text-sm text-foreground/65">{t.requests.empty}</p> : null}

      <ul className="flex flex-col gap-3">
        {requests.map((request) => {
          const linked = linkedPersonIn(people, request.email);
          return (
            <li key={request.id} className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <p className="font-medium">{request.full_name}</p>
                  <p className="text-sm text-foreground/65">
                    {request.email} · @{request.username}
                  </p>
                  <p className="text-xs text-foreground/55">
                    {t.account.birthDate}: {formatDate(request.birth_date)} · {t.join.form.joinedAt}:{" "}
                    {formatDate(request.joined_at)} · {t.requests.sentOn(formatDate(request.created_at.slice(0, 10)))}
                  </p>
                </div>
                <Belt belt={request.current_belt} stripes={request.current_stripes} />
              </div>

              {linked ? (
                <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
                  <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  {t.requests.linkWarning(linked.full_name)}
                </p>
              ) : null}

              <details className="rounded-lg border border-border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{t.requests.review}</summary>
                <form action={approveRegistration} className="grid gap-3 p-3 sm:grid-cols-2 sm:gap-4">
                  <input type="hidden" name="request_id" value={request.id} />
                  {/* The approver always sees and confirms the grade, so the
                      "first time" shortcut of the public form does not apply. */}
                  <input type="hidden" name="experienced" value="yes" />
                  <TextField id={`full_name-${request.id}`} name="full_name" label={t.join.form.fullName} defaultValue={request.full_name} required />
                  <TextField id={`email-${request.id}`} name="email" type="email" label={t.join.form.email} defaultValue={request.email} required />
                  <TextField id={`birth_date-${request.id}`} name="birth_date" type="date" label={t.join.form.birthDate} defaultValue={request.birth_date} required />
                  <TextField id={`joined_at-${request.id}`} name="joined_at" type="date" label={t.join.form.joinedAt} defaultValue={request.joined_at} required />
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`current_belt-${request.id}`} className="text-sm font-medium">{t.join.form.belt}</label>
                    <select id={`current_belt-${request.id}`} name="current_belt" defaultValue={request.current_belt} className={fieldClass}>
                      {belts.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`current_stripes-${request.id}`} className="text-sm font-medium">{t.join.form.stripes}</label>
                    <select id={`current_stripes-${request.id}`} name="current_stripes" defaultValue={String(request.current_stripes)} className={fieldClass}>
                      {[0, 1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <TextField id={`rank_since-${request.id}`} name="rank_since" type="date" label={t.account.beltSince} defaultValue={request.rank_since} />
                  <TextField id={`stripe_since-${request.id}`} name="stripe_since" type="date" label={t.account.stripeSince} defaultValue={request.stripe_since} />
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
                    >
                      {t.requests.approve}
                    </button>
                  </div>
                </form>
              </details>

              <form action={rejectRegistration}>
                <input type="hidden" name="request_id" value={request.id} />
                <ConfirmSubmitButton
                  message={t.requests.rejectConfirm(request.full_name)}
                  className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-muted"
                >
                  {t.requests.reject}
                </ConfirmSubmitButton>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TextField({
  id,
  name,
  label,
  defaultValue,
  type = "text",
  required = false,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <input id={id} name={name} type={type} required={required} defaultValue={defaultValue} className={fieldClass} />
    </div>
  );
}
```

- [ ] **Step 5: Add the chip to the Registro**

In `frontend/app/members/page.tsx`, after `const { supabase, access } = await requireRegistryViewer("/members");` add:

```ts
  // Pending self-registrations, for the chip below. User managers only: RLS
  // would show an instructor none anyway, so the query is skipped for them.
  let requestCount = 0;
  if (access.canManageUsers) {
    const { count, error: requestCountError } = await supabase
      .from("registration_request")
      .select("id", { count: "exact", head: true });
    if (requestCountError) logDbError("members", "registration_request:count", requestCountError);
    requestCount = count ?? 0;
  }
```

(Import `logDbError` from `@/utils/log` if the file does not already.) Inside the chip strip `<div className="flex flex-wrap items-center gap-2">` that holds the "add person" and criteria links, add after the criteria `</Link>`:

```tsx
          {requestCount > 0 ? (
            <Link href="/members/requests" className={PANEL_LINK}>
              <UserPlusIcon className="h-4.5 w-4.5 shrink-0 text-accent" />
              <span className="truncate">{t.requests.chip(requestCount)}</span>
            </Link>
          ) : null}
```

The strip renders only for `access.canEditRegistry`. Today that is the same set of people as `canManageUsers` (head_coach and admin), and the count is already 0 for anyone else.

- [ ] **Step 6: `deleteGym` deletes pending accounts too**

In `frontend/app/gyms/actions.ts`, in `deleteGym`, right after the `accountsError` block, add:

```ts
  // Accounts that signed up through the gym's link and were never approved have
  // no person row, only a request — which the cascade erases with the gym. Read
  // them now, for the same reason as above.
  const { data: pendingAccounts, error: pendingError } = await admin
    .from("registration_request")
    .select("auth_user_id")
    .eq("gym_id", id);
  if (pendingError) {
    logDbError("gyms", "deleteGym:pendingAccounts", pendingError);
    to(detail, { error: t.gyms.msg.failed });
  }
```

and change the loop header to:

```ts
  for (const row of [...(accounts ?? []), ...(pendingAccounts ?? [])] as { auth_user_id: string }[]) {
```

- [ ] **Step 7: Run the static checks**

Run (from `frontend/`): `npm test`, `npm run lint`, `npm run build`. Expected: all succeed.

- [ ] **Step 8: Re-run the isolation replay**

Run (from the repo root): `bash supabase/tests/replay.sh --isolation`. Expected: `OK` (nothing in the database changed in this task, so this confirms Task 2 still holds).

- [ ] **Step 9: Verify in the running app**

As the dev gym's head coach, with the pending request from Task 5:
a. `/members` shows "Registration requests (1)". As an instructor, the chip is absent and `/members/requests` answers 404.
b. Open "Review and approve", change the belt and a date, approve: the success message appears, the person is in the Registro with the corrected belt as the `Belt` graphic, the role is student, and the username works at login. The athlete's "Check again" on `/pending` lands on `/dashboard` (Task 3 check b).
c. Register a second account and reject it: confirmation first, then the account disappears from Supabase Auth and logging in with it gives the generic error (Task 3 check c).
d. Register a third and, in approval, change the email to an address an existing member uses: "This email could not be used", and the request is still listed and still pending.
e. Revoke a member's access (an account-less row with an email), then register with that same email: the request shows the link warning; approving links the account to that row, which keeps its belt and history.

- [ ] **Step 10: Commit**

```bash
git add frontend/app/members/requests frontend/app/members/page.tsx frontend/app/gyms/actions.ts frontend/utils/i18n/dictionaries
git commit -m "feat(members): approve or reject self-registrations, correcting their data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Privacy notice, project rules, memory

**Files:**
- Modify: `frontend/utils/i18n/dictionaries/it.ts`, `en.ts`, `pt-BR.ts` (privacy section 2)
- Modify: `CLAUDE.md`
- Modify: `docs/claude/auth-and-access.md`, `docs/claude/members-and-promotions.md`, `docs/claude/gyms.md`
- Modify: `C:\Users\zhouy\.claude\projects\D--DEVS-faixabjj\memory\faixabjj-account-creation-policy.md`

- [ ] **Step 1: Privacy notice**

In each dictionary's `privacy.sections`, section "2.", add a paragraph right after the first one ("Dati di contatto e anagrafici…" / "Contact and identity data…" / "Dados de contato e identificação…").

`it.ts`:

```ts
          "Richiesta di iscrizione tramite il link della palestra: nome e cognome, email, username, data di nascita, data di iscrizione e, se dichiarati, cintura, tacche e relative date. In questo caso la data di nascita è obbligatoria, perché stabilisce quale sistema di cinture si applica. Finché la richiesta è in attesa, questi dati sono visibili solo al gestore e ai maestri della palestra: se la approvano diventano i dati del tuo profilo, se la rifiutano vengono cancellati insieme all'account.",
```

`en.ts`:

```ts
          "Registration request through the gym's link: full name, email, username, date of birth, join date and, if stated, belt, stripes and their dates. Here the date of birth is required, because it decides which belt system applies. While the request is pending, only the gym's manager and head coaches can see this data: if they approve it, it becomes your profile; if they reject it, it is deleted together with the account.",
```

`pt-BR.ts`:

```ts
          "Solicitação de inscrição pelo link da academia: nome completo, e-mail, nome de usuário, data de nascimento, data de inscrição e, se informados, faixa, graus e respectivas datas. Neste caso a data de nascimento é obrigatória, porque define qual sistema de faixas se aplica. Enquanto a solicitação estiver pendente, esses dados ficam visíveis apenas para o gestor e os mestres da academia: se a aprovarem, tornam-se os dados do seu perfil; se a recusarem, são excluídos junto com a conta.",
```

Also bump the notice's "last updated" date to `2026-10-02` wherever `privacy.updated` is called with a date (search `t.privacy.updated(` in `frontend/app/privacy/`).

- [ ] **Step 2: Project rules**

In `CLAUDE.md`, replace the bullet

```markdown
- **No signup page, ever, without asking.** Login/reset errors stay generic (anti-enumeration).
```

with

```markdown
- **No open signup.** Self-registration exists only through a gym's invite link (`/join/<token>`, generated on `/gym`) and admits nobody until a user manager approves it on `/members/requests`; don't widen it without asking. Login/reset/signup errors that could reveal an email stay generic (anti-enumeration); the live username check behind a valid link is the one accepted exception.
```

and in the table row for `auth-and-access.md`, change `Login, password recovery, Turnstile,` to `Login, password recovery, invite registration, Turnstile,`.

In `docs/claude/auth-and-access.md`:
1. Replace the first paragraph under `## Authentication` (`**No self-serve signup and no signup page, on purpose** …`) with:

```markdown
**No open signup** (decided with the user, 2026-10-02). Accounts are created in the Supabase Dashboard, via `/members` (`addPerson`), or by a person registering through **their gym's invite link** and then being approved — see "Invite registration" below. Supabase's own public signup stays disabled. Don't add any other way in without asking.
```

2. In `## Bot protection (Cloudflare Turnstile)`, change `Challenged: \`/login\` and \`/forgot-password\`.` to `Challenged: \`/login\`, \`/forgot-password\` and \`/join/<token>\`.`, remove `; there is no signup form`, and add this bullet after the "Never also verify in the server action" bullet:

```markdown
- **The exception is `/join`**: its account is created by the service role, not `signUp()`, so no Supabase check runs and `register` verifies the token itself (`utils/turnstile-verify.ts`, secret `TURNSTILE_SECRET_KEY`, server-only, fails closed without it). Because the token is redeemed there, the form cannot sign the athlete in afterwards: it redirects to `/login?registered=1`.
```

3. Add a new section before `## Forced password change`:

```markdown
## Invite registration (`/join`, `/pending`, `/members/requests`)

Spec: `docs/superpowers/specs/2026-10-02-gym-invite-registration-design.md`.

- **One link per gym** (`gym_invite`, its own table because every member reads their gym row). Generated and regenerated on `/gym` by user managers through `regenerate_invite_token()`; the old link stops at once, sent requests stay. `gym_for_invite()` (service role) resolves a link only for an **active** gym; anything else is a 404.
- **Signup** (`app/join/actions.ts` `register`): Turnstile, link re-read, `parseRegistration()` (`utils/registration.ts`, the one validation for signup and approval), then `createUser` with the athlete's own password, `email_confirm: true` (no email), `app_metadata.pending_gym_id` and **no** `gym_id` (so the auth trigger creates no profile), then the `registration_request` row; any failure after `createUser` deletes the account. A taken email gets the generic error; a taken username (race with the live check) gets its own.
- **Username reserved at signup**, unique across `person` and `registration_request` (trigger `username_cross_unique`, 23505). The live check (`checkUsername`) answers only behind a valid link — an accepted trade-off against the login's username secrecy. `login_email_for_username()` also resolves pending accounts.
- **Pending account**: `requireAdmin()` and the proxy send it to `/pending` (`/privacy`, `/auth/*` exempt); `current_gym_id()` is null, so RLS shows nothing anyway. "Check again" refreshes the session (the JWT keeps `pending_gym_id` until refreshed); a failed refresh (rejected = deleted account) signs out.
- **Approval** (`app/members/requests/actions.ts`, `requireUserManager`): request read through the user's client (gym proof), edited values re-validated, email change first (a taken address stops everything), then `app_metadata = { gym_id, pending_gym_id: null }` → trigger creates or **links** the person (an account-less row with the same email keeps its own grade and dates; the page warns), profile filled with the service role as in `addPerson`, role `student` unless the linked row has an open role, request deleted. A failure after the gym is assigned puts the account back as pending. Idempotent, so concurrent approvals converge.
- **Rejection** deletes the auth account (the request cascades); refused when the account already has a gym or is not pending for this gym, and for a platform admin.
```

In `docs/claude/members-and-promotions.md`, in the paragraph about `/members/criteria` and `/members/new` being sub-routes, add:

```markdown
**`/members/requests`** (pending self-registrations, see `auth-and-access.md` "Invite registration") is the third sub-route: `requireUserManager()` (404), reached from a "Registration requests (N)" chip shown only when N > 0. Requesters are not members yet, so it is not a second list of people.
```

In `docs/claude/gyms.md`:
1. In `## Isolation`, first bullet, add `gym_invite`, `registration_request` to the list of domain tables.
2. In `## Deleting a gym`, add: `Accounts of never-approved registration requests are read before the delete too (they have no person row) and deleted with the rest.`
3. In `## Per-gym settings`, in the **Location** bullet about `/gym`, add: `/gym also holds the gym's registration link (see auth-and-access.md "Invite registration").`

- [ ] **Step 3: Memory**

In `C:\Users\zhouy\.claude\projects\D--DEVS-faixabjj\memory\faixabjj-account-creation-policy.md`:
1. Change the frontmatter `description` to: `In FAIXABJJ, staff-created accounts are active at once on a unique temporary password; self-registration exists only through a gym's invite link and needs staff approval.`
2. Replace the first section's paragraph ("The user confirmed explicitly that FAIXABJJ must never have a self-serve signup flow…") with:

```markdown
The user first confirmed that FAIXABJJ must never have a self-serve signup flow.
On 2026-10-02 the user explicitly asked for a narrow exception: a gym manager or
head coach shares **one invite link per gym**; whoever opens it registers for
that gym (choosing their own password and username), and the account sees
nothing until a manager or head coach **approves** the request, correcting the
data if needed. There is still no open signup page and Supabase's public signup
stays off. Any other way for a visitor to create an account still needs asking
first. The user also accepted that the form checks username availability live,
behind a valid link, although the login hides whether a username exists.
```

Update the matching line in `MEMORY.md` to the new description.

- [ ] **Step 4: Verify**

Run (from `frontend/`): `npm test`, `npm run lint`, `npm run build`. Expected: all succeed. Open `/privacy` in the three languages: the new paragraph shows in section 2.

- [ ] **Step 5: Commit**

```bash
git add frontend/utils/i18n/dictionaries frontend/app/privacy CLAUDE.md docs/claude
git commit -m "docs: self-registration through the gym's invite link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(The memory file lives outside the repository and is not committed.)

---

## Deployment order (for the user)

1. Apply `supabase/migrations/20261002000000_gym_invite_registration.sql` by hand to `poksgledkecwviypspmi`.
2. Set `TURNSTILE_SECRET_KEY` on Vercel (Production and Preview).
3. Deploy the app.
