# Username Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every account sign in with either its email or a platform-unique username that the maestro proposes at creation and the person can change from `/account`.

**Architecture:** `person.username` (format-checked, globally unique) is backfilled for existing accounts by a migration. The login action tells email from username by `@`; a username is resolved to the account's email on the server with the service role and then goes through the unchanged `signInWithPassword`. Unknown usernames still make a sign-in attempt against a fixed non-existent address, so replies stay identical. Creation paths claim a free username (`base`, `base2`, …) with the service role and show it once with the temporary password.

**Tech Stack:** Next.js App Router (breaking-change version, read `frontend/node_modules/next/dist/docs/` before using an unfamiliar API), Supabase (Postgres + Auth + RLS), Vitest for `frontend/utils/*.test.ts`, Docker for the migration replay.

**Spec:** `docs/superpowers/specs/2026-09-29-username-login-design.md`

## Global Constraints

- Username format `^[a-z0-9._-]{3,30}$`; input is trimmed and lower-cased before it is checked; no `@`.
- Unique across the whole platform, not per gym.
- Email stays mandatory; password recovery stays email only; the platform superadmin has no username.
- Anti-enumeration: an unknown username and a wrong password give the same generic `t.auth.wrongCredentials`.
- A collision at creation never becomes an error: append `2`, `3`, … (at most 50 tries), keeping the whole ≤ 30 characters.
- No user-facing string hardcoded: every string in `it.ts` (authoring, defines the type), `en.ts`, `pt-BR.ts`. Dictionary files use CRLF line endings — edit them with the Edit tool, not `sed`.
- DB error text never reaches the screen; log it with `logDbError(scope, where, error)` from `@/utils/log`.
- The migration is applied **by hand** to project `poksgledkecwviypspmi` (never via MCP) and must run twice cleanly; verify with `bash supabase/tests/replay.sh --isolation` from the repo root (Docker Desktop must be running).
- Every service-role action re-checks its guard before touching the admin client.
- Commands run from `frontend/` unless stated: `npx tsc --noEmit -p .`, `npm run lint`, `npm test`, `npm run build`.

## Review Focus

1. A username typed with capitals or surrounding spaces (`" Mario.Rossi "`) must sign in exactly like `mario.rossi` — pinned in Task 2's `parseLoginIdentifier` tests.
2. A name with no Latin letters (`"李雷"`) or of one letter must still produce a valid username (`user`, `a.user`) — pinned in Task 2's `suggestUsername` tests.
3. A very long name plus a numeric suffix must stay ≤ 30 characters and valid — pinned in Task 2's `withSuffix` tests.
4. Changing the username in `/account` to one used by another gym must say "already taken", never show DB text — pinned by T20 (DB) in Task 1 and the error mapping in Task 6.
5. Signing in with a username when `SUPABASE_SECRET_KEY` is missing must give the generic message, not a crash — pinned in Task 3 (lookup returns `null`, action falls back to the fixed address).

---

### Task 1: Database — column, backfill, guard, tests

**Files:**
- Create: `supabase/migrations/20260930000000_person_username.sql`
- Modify: `supabase/tests/tenant-isolation.sql` (insert T20 immediately **before** the line `-- T11: deleting gym B, as the superadmin, removes all of it and nothing of A.`, currently ~line 507 — gym B must still exist)

**Interfaces:**
- Produces: column `public.person.username text` (nullable, check `person_username_format`, unique index `person_username_unique`); members may change their own `username` (added to the guard's allowlist).

- [ ] **Step 1: Write the failing test (T20)** — insert before the T11 block:

```sql
-- T20: usernames are unique across gyms, well-formed, and a member changes
-- only their own.
update public.person set username = 'shared.name' where email = 'b2@test';
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
do $$ begin
  update public.person set username = 'a2.new' where auth_user_id = auth.uid();
  if not found then
    raise exception 'FAIL T20: a2 could not change their own username';
  end if;
  begin
    update public.person set username = 'shared.name' where auth_user_id = auth.uid();
    raise exception 'FAIL T20: a2 took a username already used in gym B';
  exception when unique_violation then null;
  end;
  begin
    update public.person set username = 'A2@X' where auth_user_id = auth.uid();
    raise exception 'FAIL T20: the format check let an invalid username through';
  exception when check_violation then null;
  end;
  begin
    update public.person set username = 'a2.other' where email = 'a1@test';
    if found then
      raise exception 'FAIL T20: a2 changed a1''s username';
    end if;
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run (repo root): `bash supabase/tests/replay.sh --isolation`
Expected: FAIL — `column "username" of relation "person" does not exist`.

- [ ] **Step 3: Write the migration** `supabase/migrations/20260930000000_person_username.sql`:

```sql
-- FAIXABJJ — sign in with a username as well as the email
--
-- A convenience: every account keeps its email; the username is a shorter,
-- second way in. The login action resolves it to the account's email on the
-- server with the service role (utils/supabase/login-identifier.ts), so no
-- function here maps usernames to emails for the API.
--
-- Unique across the whole platform, not per gym: at login the gym is not yet
-- known. Lower case only and never an `@`, which is how the login tells a
-- username from an email.
--
-- Existing accounts get one generated from their name — the same rule as
-- suggestUsername() in frontend/utils/username.ts — with a number appended on a
-- collision. Rows without an account get none; restoreAccess gives them one.
--
-- Redefines guard_person_auth_link() (last: 20260927000000) only to add
-- `username` to what a member may change on their own row. Replay-safe.

alter table public.person add column if not exists username text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'person_username_format'
      and conrelid = 'public.person'::regclass
  ) then
    alter table public.person
      add constraint person_username_format
      check (username ~ '^[a-z0-9._-]{3,30}$');
  end if;
end;
$$;

create unique index if not exists person_username_unique
  on public.person (username)
  where username is not null;

-- Backfill. Oldest row first, so the earlier member keeps the plain name.
-- Base cut to 26 characters, leaving room for a suffix of up to 4 digits.
do $$
declare
  r record;
  v_base text;
  v_candidate text;
  n int;
begin
  for r in
    select id, full_name
    from public.person
    where auth_user_id is not null
      and username is null
    order by created_at, id
  loop
    v_base := lower(extensions.unaccent(coalesce(r.full_name, '')));
    v_base := regexp_replace(v_base, '\s+', '.', 'g');
    v_base := regexp_replace(v_base, '[^a-z0-9._-]', '', 'g');
    v_base := regexp_replace(v_base, '\.{2,}', '.', 'g');
    v_base := btrim(v_base, '.');
    v_base := rtrim(left(v_base, 26), '.');
    if length(v_base) = 0 then
      v_base := 'user';
    elsif length(v_base) < 3 then
      v_base := v_base || '.user';
    end if;

    v_candidate := v_base;
    n := 1;
    while exists (select 1 from public.person where username = v_candidate) loop
      n := n + 1;
      v_candidate := left(v_base, 30 - length(n::text)) || n::text;
    end loop;

    update public.person set username = v_candidate where id = r.id;
  end loop;
end;
$$;

-- Identical to 20260927000000 except `username` in v_self_editable.
create or replace function public.guard_person_auth_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- What /account lets a member edit about themselves. updated_at is set by its
  -- own trigger and must not count as a change.
  v_self_editable text[] := array['full_name', 'phone', 'birth_date', 'notes', 'username', 'updated_at'];
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.auth_user_id is distinct from old.auth_user_id
     and not public.can_manage_users()
  then
    raise exception
      'Solo un maestro o un admin può cambiare l''account collegato a una persona.'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.can_edit_registry() then
    if (to_jsonb(new) - v_self_editable) is distinct from (to_jsonb(old) - v_self_editable) then
      raise exception
        'Della propria scheda si possono modificare solo nome, username, telefono, data di nascita e note.'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if old.auth_user_id = auth.uid()
     and (new.current_belt is distinct from old.current_belt
          or new.current_stripes is distinct from old.current_stripes
          or new.rank_since is distinct from old.rank_since
          or new.stripe_since is distinct from old.stripe_since
          or new.joined_at is distinct from old.joined_at)
  then
    raise exception
      'Nessuno può modificare il proprio grado, le relative date o la data di iscrizione.'
      using errcode = 'insufficient_privilege';
  end if;

  if (new.current_belt is distinct from old.current_belt
      or new.current_stripes is distinct from old.current_stripes)
     and current_setting('faixa.recording_promotion', true) is distinct from 'on'
  then
    raise exception
      'Cintura e tacche cambiano solo registrando una promozione.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;
```

- [ ] **Step 4: Run to verify it passes, and check the backfill**

Run (repo root): `KEEP=1 bash supabase/tests/replay.sh --isolation`
Expected: `tenant isolation: all checks passed` then `OK` (both passes).
Then: `docker exec faixabjj-replay psql -h 127.0.0.1 -U postgres -tAc "select count(*) from public.person where auth_user_id is not null and username is null"` → `0`; then `docker rm -f faixabjj-replay`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260930000000_person_username.sql supabase/tests/tenant-isolation.sql
git commit -m "feat(db): person.username, unique across gyms, backfilled"
```

---

### Task 2: Pure helpers — username rules and login identifier

**Files:**
- Create: `frontend/utils/username.ts`, `frontend/utils/username.test.ts`
- Create: `frontend/utils/login-identifier.ts`, `frontend/utils/login-identifier.test.ts`

**Interfaces:**
- Consumes: `foldForSearch(text: string): string` from `frontend/utils/search.ts` (exists).
- Produces:
  - `USERNAME_MAX = 30`
  - `normalizeUsername(raw: string): string` — trim + lower case
  - `isValidUsername(username: string): boolean`
  - `suggestUsername(fullName: string): string` — always valid
  - `withSuffix(base: string, n: number): string` — `n <= 1` → `base`; else base cut so the result ≤ 30
  - `type LoginIdentifier = { kind: "email"; email: string } | { kind: "username"; username: string } | { kind: "invalid" }`
  - `parseLoginIdentifier(raw: string): LoginIdentifier`

- [ ] **Step 1: Write the failing tests**

`frontend/utils/username.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isValidUsername, normalizeUsername, suggestUsername, withSuffix } from "./username";

describe("normalizeUsername", () => {
  it("trims and lower-cases", () => {
    expect(normalizeUsername("  Mario.Rossi ")).toBe("mario.rossi");
  });
});

describe("isValidUsername", () => {
  it("accepts the allowed alphabet, 3 to 30 characters", () => {
    expect(isValidUsername("mario.rossi")).toBe(true);
    expect(isValidUsername("a_b-c.9")).toBe(true);
    expect(isValidUsername("abc")).toBe(true);
    expect(isValidUsername("a".repeat(30))).toBe(true);
  });

  it("refuses @, capitals, spaces and wrong lengths", () => {
    expect(isValidUsername("a@b")).toBe(false);
    expect(isValidUsername("Mario")).toBe(false);
    expect(isValidUsername("mario rossi")).toBe(false);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("a".repeat(31))).toBe(false);
  });
});

describe("suggestUsername", () => {
  it("joins the words with dots, without accents", () => {
    expect(suggestUsername("Mario Rossi")).toBe("mario.rossi");
    expect(suggestUsername("  José   Gonçalves ")).toBe("jose.goncalves");
    expect(suggestUsername("Søren Straße")).toBe("soren.strasse");
  });

  it("drops characters outside the alphabet", () => {
    expect(suggestUsername("Anna-Maria O'Neil")).toBe("anna-maria.oneil");
    expect(suggestUsername("Luca (Jr.)")).toBe("luca.jr");
  });

  it("always returns a valid username", () => {
    expect(suggestUsername("李雷")).toBe("user");
    expect(suggestUsername("")).toBe("user");
    expect(suggestUsername("Al")).toBe("al.user");
    const long = suggestUsername("Maximiliano Alessandro Bartolomeo Rossi");
    expect(long.length).toBeLessThanOrEqual(26);
    expect(isValidUsername(long)).toBe(true);
    expect(long.endsWith(".")).toBe(false);
  });
});

describe("withSuffix", () => {
  it("leaves the first try alone", () => {
    expect(withSuffix("mario.rossi", 1)).toBe("mario.rossi");
  });

  it("appends the number", () => {
    expect(withSuffix("mario.rossi", 2)).toBe("mario.rossi2");
    expect(withSuffix("mario.rossi", 50)).toBe("mario.rossi50");
  });

  it("keeps a 30-character base within 30", () => {
    const base = "a".repeat(30);
    expect(withSuffix(base, 2)).toBe("a".repeat(29) + "2");
    expect(withSuffix(base, 12).length).toBe(30);
    expect(isValidUsername(withSuffix(base, 12))).toBe(true);
  });
});
```

`frontend/utils/login-identifier.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseLoginIdentifier } from "./login-identifier";

describe("parseLoginIdentifier", () => {
  it("treats anything with @ as an email, trimmed", () => {
    expect(parseLoginIdentifier(" Mario@Example.com ")).toEqual({
      kind: "email",
      email: "Mario@Example.com",
    });
  });

  it("normalises a username", () => {
    expect(parseLoginIdentifier(" Mario.Rossi ")).toEqual({
      kind: "username",
      username: "mario.rossi",
    });
  });

  it("marks what can be neither as invalid", () => {
    expect(parseLoginIdentifier("")).toEqual({ kind: "invalid" });
    expect(parseLoginIdentifier("   ")).toEqual({ kind: "invalid" });
    expect(parseLoginIdentifier("ab")).toEqual({ kind: "invalid" });
    expect(parseLoginIdentifier("mario rossi")).toEqual({ kind: "invalid" });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run utils/username.test.ts utils/login-identifier.test.ts`
Expected: FAIL — cannot resolve `./username` / `./login-identifier`.

- [ ] **Step 3: Implement**

`frontend/utils/username.ts`:

```ts
import { foldForSearch } from "./search";

// The rules of a username, shared by the forms, the actions and the login.
// The backfill in 20260930000000 follows suggestUsername() — change both
// together. Lower case only and never an `@`: the login tells a username from
// an email by the `@` alone.

export const USERNAME_MAX = 30;

const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

// Room left at the end of a suggestion for a numeric suffix (`mario.rossi2`).
const SUFFIX_ROOM = 4;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

// "José Gonçalves" → "jose.goncalves". Always valid: a name with nothing left
// after the strip becomes "user", a too-short one gets ".user" appended.
export function suggestUsername(fullName: string): string {
  const base = foldForSearch(fullName)
    .trim()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, USERNAME_MAX - SUFFIX_ROOM)
    .replace(/\.+$/, "");
  if (base.length === 0) return "user";
  if (base.length < 3) return `${base}.user`;
  return base;
}

// The n-th candidate for a wanted username: the name itself first, then
// name2, name3…, cut so the whole never exceeds the maximum.
export function withSuffix(base: string, n: number): string {
  if (n <= 1) return base;
  const tail = String(n);
  return base.slice(0, USERNAME_MAX - tail.length) + tail;
}
```

`frontend/utils/login-identifier.ts`:

```ts
import { isValidUsername, normalizeUsername } from "./username";

// What the login's single field holds. An `@` means an email, passed on as
// typed; anything else is a username, normalised the way it was stored. What
// is neither still reaches a sign-in attempt (see login/actions.ts), so it
// fails like a wrong password rather than with a message of its own.
export type LoginIdentifier =
  | { kind: "email"; email: string }
  | { kind: "username"; username: string }
  | { kind: "invalid" };

export function parseLoginIdentifier(raw: string): LoginIdentifier {
  const value = raw.trim();
  if (!value) return { kind: "invalid" };
  if (value.includes("@")) return { kind: "email", email: value };
  const username = normalizeUsername(value);
  return isValidUsername(username) ? { kind: "username", username } : { kind: "invalid" };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run utils/username.test.ts utils/login-identifier.test.ts`
Expected: PASS. If `"Luca (Jr.)"` yields `luca.jr.` → the trailing-dot strip is wrong; the expected value is `luca.jr`.

- [ ] **Step 5: Commit**

```bash
git add frontend/utils/username.ts frontend/utils/username.test.ts frontend/utils/login-identifier.ts frontend/utils/login-identifier.test.ts
git commit -m "feat(utils): username rules and login identifier parsing"
```

---

### Task 3: Login with email or username

**Files:**
- Create: `frontend/utils/supabase/login-identifier.ts`
- Modify: `frontend/app/login/actions.ts` (the `login` function)
- Modify: `frontend/app/login/page.tsx:31-40` (the email field)
- Modify: `frontend/utils/i18n/dictionaries/it.ts`, `en.ts`, `pt-BR.ts` (`auth` block, after `email:`)

**Interfaces:**
- Consumes: `parseLoginIdentifier` (Task 2); `createAdminClient` from `@/utils/supabase/admin`; column `person.username` (Task 1).
- Produces: `emailForUsername(username: string): Promise<string | null>` (server-only); dictionary key `t.auth.emailOrUsername`.

- [ ] **Step 1: Add the dictionary key** — in each `auth` block, directly after `email: ...,`:
  - `it.ts`: `emailOrUsername: "Email o username",`
  - `en.ts`: `emailOrUsername: "Email or username",`
  - `pt-BR.ts`: `emailOrUsername: "E-mail ou nome de usuário",`

- [ ] **Step 2: Create `frontend/utils/supabase/login-identifier.ts`**

```ts
import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";
import { logDbError } from "@/utils/log";

// The email to sign in with for a username, or null. Service role, because the
// caller is not signed in yet and RLS would show them nothing; the address
// never leaves the server — the login action passes it straight to
// signInWithPassword. The account's own email, not person.email, which is a
// convenience copy and may lag behind a change still awaiting confirmation.
export async function emailForUsername(username: string): Promise<string | null> {
  let admin;
  try {
    admin = createAdminClient();
  } catch (cause) {
    logDbError("login", "emailForUsername:admin", {
      code: "no-admin-client",
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return null;
  }

  const { data, error } = await admin
    .from("person")
    .select("auth_user_id")
    .eq("username", username)
    .not("auth_user_id", "is", null)
    .maybeSingle();
  if (error) {
    logDbError("login", "emailForUsername:person", error);
    return null;
  }
  const authUserId = (data as { auth_user_id: string | null } | null)?.auth_user_id;
  if (!authUserId) return null;

  const { data: found, error: userError } = await admin.auth.admin.getUserById(authUserId);
  if (userError) {
    logDbError("login", "emailForUsername:user", {
      code: userError.code ?? null,
      message: userError.message,
    });
    return null;
  }
  return found.user?.email ?? null;
}
```

- [ ] **Step 3: Change the action** — in `frontend/app/login/actions.ts` add imports:

```ts
import { parseLoginIdentifier } from "@/utils/login-identifier";
import { emailForUsername } from "@/utils/supabase/login-identifier";
```

add above `export async function login`:

```ts
// Where a username that matches no account signs in: an address no account can
// have (.invalid is reserved). The attempt still goes to Supabase, so the reply
// is the same "wrong credentials" as a wrong password and the Turnstile token
// is checked and spent exactly as for a real account — nothing tells the two
// apart.
const NO_SUCH_ACCOUNT = "nobody@faixabjj.invalid";
```

and replace `const email = formData.get("email") as string;` with:

```ts
  // One field, email or username (see utils/login-identifier.ts).
  const identifier = parseLoginIdentifier((formData.get("email") as string | null) ?? "");
  const email =
    identifier.kind === "email"
      ? identifier.email
      : identifier.kind === "username"
        ? ((await emailForUsername(identifier.username)) ?? NO_SUCH_ACCOUNT)
        : NO_SUCH_ACCOUNT;
```

Nothing else in the action changes.

- [ ] **Step 4: Change the field** in `frontend/app/login/page.tsx` — the label text becomes `{t.auth.emailOrUsername}` and the input becomes:

```tsx
          <input
            id="email"
            name="email"
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent"
          />
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit -p . && npm run lint && npm test`
Expected: clean, all tests pass.
Manual (after Task 1's migration is applied to the dev database): on `/login`, sign in with a known username + right password → dashboard; with the same username in capitals → dashboard; with an unknown username → "wrong credentials", the same text as a wrong password for a real email.

- [ ] **Step 6: Commit**

```bash
git add frontend/utils/supabase/login-identifier.ts frontend/app/login frontend/utils/i18n/dictionaries
git commit -m "feat(login): sign in with email or username"
```

---

### Task 4: Username at creation in the Registro, and in the temporary-password notice

**Files:**
- Create: `frontend/utils/supabase/username.ts`
- Create: `frontend/components/name-username-fields.tsx`
- Modify: `frontend/utils/temporary-password-flash.ts`
- Modify: `frontend/components/temporary-password-notice.tsx`
- Modify: `frontend/app/members/actions.ts` (`personInMyGym`, `addPerson`, `restoreAccess`, `setTemporaryPassword`)
- Modify: `frontend/app/members/new/page.tsx:65-70` (the name field)
- Modify: dictionaries (`account` block, `registro` block, `msg` block)

**Interfaces:**
- Consumes: `normalizeUsername`, `isValidUsername`, `suggestUsername`, `withSuffix` (Task 2).
- Produces:
  - `claimUsername(admin: ReturnType<typeof createAdminClient>, personId: string, wanted: string): Promise<string | null>` (server-only)
  - `TemporaryPasswordFlash = { email: string; password: string; username?: string | null }`
  - `NameUsernameFields({ nameLabel, usernameLabel, usernameHelp, fieldClass })` (Client Component; renders inputs `full_name` and `username`)
  - dictionary keys `t.account.username`, `t.account.usernameHelp`, `t.registro.temporaryUsernameIs`, `t.msg.usernameInvalid`, `t.msg.usernameTaken`

- [ ] **Step 1: Dictionary keys**
  - `account` block, after `fullName: ...,`:
    - it: `username: "Username",` and `usernameHelp: "Da 3 a 30 caratteri: lettere minuscole, cifre, punto, trattino e trattino basso. Si usa al posto dell'email per accedere.",`
    - en: `username: "Username",` and `usernameHelp: "3 to 30 characters: lower-case letters, digits, dot, hyphen and underscore. It can be used instead of the email to sign in.",`
    - pt-BR: `username: "Nome de usuário",` and `usernameHelp: "De 3 a 30 caracteres: letras minúsculas, números, ponto, hífen e sublinhado. Pode ser usado no lugar do e-mail para entrar.",`
  - `registro` block, after `temporaryPasswordFor: ...,`:
    - it: `temporaryUsernameIs: "Username:",` · en: `temporaryUsernameIs: "Username:",` · pt-BR: `temporaryUsernameIs: "Nome de usuário:",`
  - `msg` block (top-level `msg`), anywhere:
    - it: `usernameInvalid: "Username non valido: da 3 a 30 caratteri tra lettere minuscole, cifre, punto, trattino e trattino basso.",` and `usernameTaken: "Questo username è già in uso.",`
    - en: `usernameInvalid: "Invalid username: 3 to 30 characters among lower-case letters, digits, dot, hyphen and underscore.",` and `usernameTaken: "This username is already taken.",`
    - pt-BR: `usernameInvalid: "Nome de usuário inválido: de 3 a 30 caracteres entre letras minúsculas, números, ponto, hífen e sublinhado.",` and `usernameTaken: "Este nome de usuário já está em uso.",`

- [ ] **Step 2: Create `frontend/utils/supabase/username.ts`**

```ts
import "server-only";

import type { createAdminClient } from "@/utils/supabase/admin";
import { logDbError } from "@/utils/log";
import { isValidUsername, withSuffix } from "@/utils/username";

// Usernames are unique across every gym, so "mario.rossi" is often taken
// already — by somebody the maestro cannot even see. A collision is therefore
// never an error at creation: the first free of wanted, wanted2, wanted3… is
// written, and returned so it can be shown with the temporary password.
//
// Service role: the caller has already checked, on their own client, that the
// row is theirs (personInMyGym / the gym lookup); this only writes the column.
const MAX_TRIES = 50;

export async function claimUsername(
  admin: ReturnType<typeof createAdminClient>,
  personId: string,
  wanted: string,
): Promise<string | null> {
  if (!isValidUsername(wanted)) return null;
  for (let n = 1; n <= MAX_TRIES; n++) {
    const candidate = withSuffix(wanted, n);
    const { data, error } = await admin
      .from("person")
      .update({ username: candidate })
      .eq("id", personId)
      .select("id");
    if (!error) {
      if (data && data.length > 0) return candidate;
      logDbError("members", "claimUsername", { code: "no-rows", message: "person row not found" });
      return null;
    }
    // 23505 = unique_violation: taken, try the next number.
    if (error.code !== "23505") {
      logDbError("members", "claimUsername", error);
      return null;
    }
  }
  logDbError("members", "claimUsername", {
    code: "exhausted",
    message: `no free username after ${MAX_TRIES} tries`,
  });
  return null;
}
```

- [ ] **Step 3: Flash carries the username** — in `frontend/utils/temporary-password-flash.ts`:
  - type becomes `export type TemporaryPasswordFlash = { email: string; password: string; username?: string | null };`
  - in `readTemporaryPassword`, add `username?: unknown;` to the parsed type and return:

```ts
    return {
      email: parsed.email,
      password: parsed.password,
      username: typeof parsed.username === "string" ? parsed.username : null,
    };
```

- [ ] **Step 4: Notice shows it** — in `frontend/components/temporary-password-notice.tsx`, inside the `flex min-w-0 flex-col gap-1` div, **before** the password `<span>`:

```tsx
        {flash.username ? (
          <span>
            {t.registro.temporaryUsernameIs}{" "}
            <code className="select-all rounded bg-muted px-1.5 py-0.5 font-medium">
              {flash.username}
            </code>
          </span>
        ) : null}
```

- [ ] **Step 5: Create `frontend/components/name-username-fields.tsx`**

```tsx
"use client";

import { useState } from "react";
import { suggestUsername } from "@/utils/username";

// The name and username fields of a new account. The username follows the
// name as it is typed (Mario Rossi → mario.rossi) until the maestro edits it
// by hand; from then on it is theirs. Without JavaScript the field stays
// empty and the action suggests one from the name.
export function NameUsernameFields({
  nameLabel,
  usernameLabel,
  usernameHelp,
  fieldClass,
}: {
  nameLabel: string;
  usernameLabel: string;
  usernameHelp: string;
  fieldClass: string;
}) {
  const [name, setName] = useState("");
  const [typed, setTyped] = useState<string | null>(null);
  const username = typed ?? (name.trim() ? suggestUsername(name) : "");

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="full_name" className="text-sm font-medium">
          {nameLabel}
        </label>
        <input
          id="full_name"
          name="full_name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="text-sm font-medium">
          {usernameLabel}
        </label>
        <input
          id="username"
          name="username"
          required
          value={username}
          onChange={(event) => setTyped(event.target.value)}
          maxLength={30}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={fieldClass}
        />
        <p className="text-xs text-foreground/55">{usernameHelp}</p>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Use it in `/members/new`** — in `frontend/app/members/new/page.tsx` import `NameUsernameFields` from `@/components/name-username-fields` and replace the `full_name` block (the `<div>` holding `<label htmlFor="full_name">` and `<input id="full_name" …/>`) with:

```tsx
          <NameUsernameFields
            nameLabel={t.account.fullName}
            usernameLabel={t.account.username}
            usernameHelp={t.account.usernameHelp}
            fieldClass={fieldClass}
          />
```

- [ ] **Step 7: Actions** — in `frontend/app/members/actions.ts`:
  - imports: `import { claimUsername } from "@/utils/supabase/username";` and `import { isValidUsername, normalizeUsername, suggestUsername } from "@/utils/username";`
  - `personInMyGym`: select `"id, auth_user_id, email, full_name, username"` and add `username: string | null;` to **both** the return type and the cast.
  - `addPerson`: after the `stripes` check and before `current_gym_id`, add:

```ts
  // Proposed by the form from the name; suggested here too when it arrives
  // empty (no JavaScript). Checked before the account exists, so a bad value
  // never leaves a half-created account.
  const username = normalizeUsername(text(formData, "username") ?? "") || suggestUsername(fullName);
  if (!isValidUsername(username)) {
    back({ error: t.msg.usernameInvalid }, query);
    return;
  }
```

    then after the `if (error || !person) { … }` block of the profile update, before the role insert:

```ts
  const claimed = await claimUsername(admin, person.id, username);
  if (!claimed) {
    back({ error: t.msg.accountCreatedNoProfile(email) }, query);
    return;
  }
```

    and the final flash becomes `pw: await flashTemporaryPassword({ email, password, username: claimed }),`.
  - `restoreAccess`: after the link check (`if (linkError || !linked || linked.length === 0) { … }`) and before `updateUserById`, add:

```ts
  // A row revoked after usernames existed keeps its own; an older one gets
  // one from the name, as the backfill would have given it.
  const username =
    target.username ?? (await claimUsername(admin, target.id, suggestUsername(target.full_name ?? "")));
  if (!username) {
    await undo("username", { code: "no-username", message: "claimUsername found no free username" });
    return;
  }
```

    and its flash becomes `pw: await flashTemporaryPassword({ email, password, username }),`.
  - `setTemporaryPassword`: replace `if (!(await personInMyGym(supabase, { authUserId: targetId }))) {` with

```ts
  const person = await personInMyGym(supabase, { authUserId: targetId });
  if (!person) {
```

    and its flash becomes `pw: await flashTemporaryPassword({ email: who, password, username: person.username }),`.

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit -p . && npm run lint && npm test && npm run build`
Expected: clean; build prints `✓ Compiled successfully`.
Manual: `/members/new` — typing "José Gonçalves" fills `jose.goncalves`; editing the username stops it following the name; creating the person shows "Username: jose.goncalves" and the password. Creating a second "José Gonçalves" (other email) shows `jose.goncalves2`. "Reimposta password" on a row shows its username too.

- [ ] **Step 9: Commit**

```bash
git add frontend/utils/supabase/username.ts frontend/components frontend/utils/temporary-password-flash.ts frontend/app/members frontend/utils/i18n/dictionaries
git commit -m "feat(members): username at creation and in the temporary password notice"
```

---

### Task 5: Username for gym managers (`/gyms`)

**Files:**
- Modify: `frontend/app/gyms/actions.ts` (`addManager`, `resetManagerPassword`)
- Modify: `frontend/app/gyms/[id]/page.tsx:206-218` (the add-manager form)

**Interfaces:**
- Consumes: `claimUsername` (Task 4), `NameUsernameFields` (Task 4), `normalizeUsername` / `isValidUsername` / `suggestUsername` (Task 2), `t.account.username`, `t.account.usernameHelp`, `t.msg.usernameInvalid` (Task 4).

- [ ] **Step 1: Form** — in `frontend/app/gyms/[id]/page.tsx` import `NameUsernameFields` and replace the `full_name` `<div>` of the `addManager` form with:

```tsx
            <NameUsernameFields
              nameLabel={t.gyms.managerName}
              usernameLabel={t.account.username}
              usernameHelp={t.account.usernameHelp}
              fieldClass={fieldClass}
            />
```

- [ ] **Step 2: `addManager`** — in `frontend/app/gyms/actions.ts` add imports `import { claimUsername } from "@/utils/supabase/username";` and `import { isValidUsername, normalizeUsername, suggestUsername } from "@/utils/username";`. After `if (!fullName || !email) to(detail, { error: t.gyms.msg.managerMissing });` add:

```ts
  const username = normalizeUsername(field(formData, "username") ?? "") || suggestUsername(fullName);
  if (!isValidUsername(username)) to(detail, { error: t.msg.usernameInvalid });
```

  Change the person lookup to `.select("id, username")`. Directly after the `if (!person) { … } else { … }` block that sets `roleError`, add:

```ts
  // A re-added manager's row keeps the username it already has.
  let claimed: string | null = null;
  if (!roleError && person) {
    claimed =
      (person as { username: string | null }).username ??
      (await claimUsername(admin, person.id, username));
    if (!claimed) {
      roleError = { code: "no-username", message: "claimUsername found no free username" };
    }
  }
```

  The existing `if (roleError) { … cleanup … }` then covers it. The final flash becomes `pw: await flashTemporaryPassword({ email, password, username: claimed }),`.

- [ ] **Step 3: `resetManagerPassword`** — before the final `to(detail, { ok: … })`, add:

```ts
  const { data: row, error: rowError } = await admin
    .from("person")
    .select("username")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (rowError) logDbError("gyms", "resetManagerPassword:username", rowError);
```

  and the flash becomes `pw: await flashTemporaryPassword({ email: manager.email ?? "", password, username: (row as { username: string | null } | null)?.username ?? null }),`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . && npm run lint && npm run build`
Expected: clean.
Manual (as superadmin): add a manager on `/gyms/<id>` → notice shows username and password; "reset password" on that manager shows the username too.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/gyms
git commit -m "feat(gyms): username for gym managers"
```

---

### Task 6: Change it from `/account`; show it on the member page

**Files:**
- Modify: `frontend/utils/supabase/profile.ts:9-25` (`Profile`, `PROFILE_COLUMNS`)
- Modify: `frontend/app/account/actions.ts` (`updateProfile`)
- Modify: `frontend/app/account/page.tsx` (after the `full_name` field, ~line 185)
- Modify: `frontend/app/members/[id]/page.tsx` (member type ~line 34, select ~line 115, `Field` list ~line 262)

**Interfaces:**
- Consumes: `normalizeUsername`, `isValidUsername` (Task 2); `t.account.username`, `t.account.usernameHelp`, `t.msg.usernameInvalid`, `t.msg.usernameTaken` (Task 4); guard allowlist (Task 1).

- [ ] **Step 1: Profile** — add `username: string | null;` to `Profile` after `full_name`, and `username` to `PROFILE_COLUMNS` after `full_name`.

- [ ] **Step 2: `updateProfile`** — add imports `import { isValidUsername, normalizeUsername } from "@/utils/username";` and `import { logDbError } from "@/utils/log";`. After the `fullName` check:

```ts
  // Left as it is when the field arrives empty; the member's own client and
  // RLS write it (the guard lets a member change their own username).
  const rawUsername = text(formData, "username");
  const username = rawUsername ? normalizeUsername(rawUsername) : profile.username;
  if (username !== null && !isValidUsername(username)) {
    back({ error: t.msg.usernameInvalid });
    return;
  }
```

  add `username,` to the `.update({ … })` object, and replace the `if (error) { back({ error: t.msg.profileSaveFailed }); return; }` block with:

```ts
  if (error) {
    // 23505: somebody — possibly in another gym — already has it. 23514: the
    // format check, for a value that slipped past the one above.
    if (error.code !== "23505" && error.code !== "23514") {
      logDbError("account", "updateProfile", error);
    }
    back({
      error:
        error.code === "23505"
          ? t.msg.usernameTaken
          : error.code === "23514"
            ? t.msg.usernameInvalid
            : t.msg.profileSaveFailed,
    });
    return;
  }
```

- [ ] **Step 3: `/account` field** — in `frontend/app/account/page.tsx`, after the `full_name` `<div>`:

```tsx
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-sm font-medium">
              {t.account.username}
            </label>
            <input
              id="username"
              name="username"
              required
              defaultValue={profile.username ?? ""}
              maxLength={30}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className={fieldClass}
            />
            <p className="text-xs text-foreground/55">{t.account.usernameHelp}</p>
          </div>
```

- [ ] **Step 4: Member page** — in `frontend/app/members/[id]/page.tsx` add `username: string | null;` to the member type, `username` to the select string after `full_name`, and before the email `Field`:

```tsx
          <Field label={t.account.username} value={member.username ?? t.common.dash} />
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit -p . && npm run lint && npm test && npm run build`
Expected: clean.
Manual: `/account` shows the username; change it to `Mario.Nuovo` → saved as `mario.nuovo`, and signing in with it works; change it to a username another account has → "Questo username è già in uso."; `mario rossi` → the format message. `/members/<id>` shows the username read-only.

- [ ] **Step 6: Commit**

```bash
git add frontend/utils/supabase/profile.ts frontend/app/account "frontend/app/members/[id]/page.tsx"
git commit -m "feat(account): change your own username; show it on the member page"
```

---

### Task 7: Docs and memory

**Files:**
- Modify: `docs/claude/auth-and-access.md`, `docs/claude/members-and-promotions.md`, `docs/claude/database.md`
- Modify: `C:\Users\zhouy\.claude\projects\D--DEVS-faixabjj\memory\faixabjj-account-creation-policy.md`

- [ ] **Step 1: `auth-and-access.md`** — in the login section add one bullet: "**Email or username** (`20260930000000`): one field; `parseLoginIdentifier()` (`utils/login-identifier.ts`) tells them apart by `@`; a username is resolved to the **account's** email by `emailForUsername()` (`utils/supabase/login-identifier.ts`, service role, server-only) and goes through the same `signInWithPassword`. An unknown/invalid username signs in against `nobody@faixabjj.invalid`, so reply and Turnstile consumption match a wrong password. Recovery stays email only; the superadmin has no username."
- [ ] **Step 2: `members-and-promotions.md`** — in "Account actions" add: "**Username** (unique across all gyms, `^[a-z0-9._-]{3,30}$`, rules in `utils/username.ts`): `/members/new` and `/gyms/<id>` pre-fill it from the name (`NameUsernameFields`); `claimUsername()` (`utils/supabase/username.ts`) writes the first free of `x`, `x2`, … (≤ 50 tries) with the service role; the notice shows it with the temporary password (`TemporaryPasswordFlash.username`). `restoreAccess` keeps an existing one or suggests one. Members change it from `/account`; staff do not edit it after creation."
- [ ] **Step 3: `database.md`** — note `person.username` (check `person_username_format`, unique index `person_username_unique`, backfill mirrors `suggestUsername()`), and that `guard_person_auth_link()` was last redefined in `20260930000000` (allowlist now includes `username`).
- [ ] **Step 4: Memory** — append to the "Adding a person creates their account too" section: "Since 2026-09-29 every account also has a **username** (convenience, email stays mandatory): the maestro proposes it at creation, pre-filled from the name, the person can change it from `/account`, and it is shown once together with the temporary password."
- [ ] **Step 5: Commit**

```bash
git add docs/claude
git commit -m "docs: username login"
```

After all tasks: remind the user to apply `supabase/migrations/20260930000000_person_username.sql` by hand to `poksgledkecwviypspmi` **before** deploying the frontend (the login and `/account` select `username`).
