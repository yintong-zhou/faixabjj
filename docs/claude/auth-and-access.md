# Authentication, access and accounts

## Authentication

**No open signup** (decided with the user, 2026-10-02). Accounts are created in the Supabase Dashboard, via `/members` (`addPerson`), or by a person registering through **their gym's invite link** and then being approved — see "Invite registration" below. Supabase's own public signup stays disabled. Don't add any other way in without asking.

- `app/login/page.tsx` + `actions.ts` — `"use server"` `signInWithPassword`. Failure → `/login?error=...` with a deliberately generic message; never surface the raw Supabase error (email enumeration).
- **Email or username** (`20260930000000`): one field (`name="email"`, `autocomplete="username"`). `parseLoginIdentifier()` (`utils/login-identifier.ts`) tells them apart by `@`; a username is resolved to the **account's** email by `emailForUsername()` (`utils/supabase/login-identifier.ts`, server-only) with **one** RPC, `login_email_for_username()` (`20260930010000`, security definer, executable by `service_role` only — found and not-found cost the same round trip, so timing does not reveal a username) and goes through the same `signInWithPassword`. An unknown or invalid username signs in against a **fresh random** `nobody-<uuid>@faixabjj.invalid` (`unknownAccountEmail()`; a fixed sentinel could be registered as a real account, and every unknown username would then sign in as it), so the reply and the Turnstile consumption match a wrong password. Recovery stays email only; the superadmin has no username.
- **Password recovery:** `/forgot-password` calls `resetPasswordForEmail(email, { redirectTo: "<origin>/reset-password" })` and always redirects to `?sent=1`. `/reset-password` must be a **Client Component** (`reset-form.tsx`, server page wraps it for i18n): tokens are in the URL **hash**, never sent to the server. Listen for `onAuthStateChange` `"PASSWORD_RECOVERY"` plus a `getSession()` fallback; "invalid link" after 2s if neither fires.
- `app/auth/signout/route.ts` — POST, signs out, → `/login`. `isLoggedIn` computed server-side in `app/layout.tsx` (`getClaims()`), passed as prop to `nav-shell.tsx`.
- `utils/supabase/proxy.ts`: logged-out visitors on protected routes → `/login?next=<path>`; logged-in visitors on `/login` → `/dashboard`. **`PROTECTED_PREFIXES` is the single source of truth** for gated routes.
- Every protected page **also** calls `requireAdmin()` (`utils/supabase/require-admin.ts`) — proxy cookie checks are spoofable.
- Use `supabase.auth.getClaims()`, not `getUser()`.
- `/` is for **signed-out visitors only**: `VISITOR_ONLY` in the proxy redirects authenticated users to `/dashboard`; nav drops Home when signed in, logo points at `/dashboard`.

## Bot protection (Cloudflare Turnstile)

Challenged: `/login`, `/forgot-password` and `/join/<token>`. `/reset-password` is not (the recovery token is the gate).

- **Supabase verifies; the app only draws the widget.** Supabase Auth → Attack Protection (provider Turnstile) holds the secret. `components/turnstile.tsx` renders; `turnstileToken()` in `utils/turnstile.ts` passes `captchaToken` to `signInWithPassword` / `resetPasswordForEmail`.
- **Never also verify in the server action.** A token is redeemed exactly once: our siteverify consumed it, Supabase got none → `captcha_failed` → correct password reported as wrong. Supabase's check is the one that matters (anyone can POST straight to the endpoint). Trade-off: GoTrue does not check `action`/`hostname`.
- **The exception is `/join`**: its account is created by the service role, not `signUp()`, so no Supabase check runs and `register` verifies the token itself (`utils/turnstile-verify.ts`, secret `TURNSTILE_SECRET_KEY`, server-only, fails closed without it). Because the token is redeemed there, the form cannot sign the athlete in afterwards: it redirects to `/login?registered=1`.
- Only the sitekey is an env var (`NEXT_PUBLIC_TURNSTILE_SITEKEY`, public). Supabase's secret is not in the repo/deployment; `/join` alone uses `TURNSTILE_SECRET_KEY` (server-only env var, see the `/join` bullet above). No sitekey → no token → Supabase refuses: fails closed with no app logic.
- `captcha_failed` is the one login error with its own message (`t.auth.captchaFailed`); everything else stays generic. Real reason → `logDbError()`.
- A refused reset still answers `?sent=1`; the call's result is deliberately not read.
- No reset logic: token single-use, both actions redirect → fresh widget.
- Widget theme `auto` (Cloudflare iframe, can't follow our toggle); language follows the app via `data-language`.
- Diagnose from outside: POST `/auth/v1/token?grant_type=password` with the publishable key and a junk address; `captcha protection: request disallowed` means protection is on.

## Permission model

Not flat. Role = an **active** `assigned_role` (`end_date is null`); no active role = allievo.

| Role         | Registro    | Corsi / Presenze                 | Write registry | Manage accounts |
| ------------ | ----------- | -------------------------------- | -------------- | --------------- |
| `student`    | not visible | Presenze only, check-in for self | no             | no              |
| `assistant`  | not visible | Presenze only, check-in for self | no             | no              |
| `instructor` | read-only   | full                             | no             | no              |
| `head_coach` | full        | full                             | yes            | yes             |
| `admin`      | full        | full                             | yes            | yes             |
| platform superadmin | not visible | not visible                | no              | only gym managers, from `/gyms` |

`assistant` with `student` was an explicit decision. `admin` = runs the portal without teaching. The platform superadmin sits outside every gym — see `docs/claude/gyms.md` for `isPlatformAdmin`, `gymStatus` and the `/suspended` redirect.

- SQL predicates: `can_view_registry()`, `can_edit_registry()`, `can_manage_users()`, `can_manage_classes()`; `current_access()` returns all four as JSON. Frontend uses `getAccess()`, `requireRegistryViewer()`, `requireRegistryEditor()`, `requireUserManager()`, `requireClassManager()` — never re-implement rules; one definition per privilege.
- `getAccess()` **fails closed**: RPC error = no access.
- Layered enforcement: nav hides links → `require*` guard answers **404, not 403** → RLS. **Hiding a nav link is never the access control.**
- `can_manage_classes()` ≠ `can_edit_registry()`: an instructor runs classes but never changes a belt. Don't collapse.

**`current_access()` fault signature:** defined in `20260911120000` (3 flags), `20260912010000` (4 flags), restated in `20260920000000`. Re-pasting the first alone removed `canManageClasses` from everyone: staff lost Corsi and gym dashboard but **kept the Registro** (hangs on `canViewRegistry`). New privilege → new migration. A permission fix shows only after a **full page load** (Next.js client Router Cache); nothing to clear server-side.

Looks simplifiable, is not:
- Writes to `assigned_role` are manager-only, or anyone could grant themselves `head_coach`.
- Trigger `guard_person_auth_link` on `person` freezes `auth_user_id` against non-managers; for non-editors it is an **allowlist** — on their own row only `full_name`, `phone`, `birth_date`, `notes` may change (`joined_at` feeds eligibility). Nobody, editors included, changes their own rank columns or `joined_at`; belt/stripes change only inside `record_promotion()`, the only writer of `promotion` too (`20260927000000`). RLS can't: a member legitimately UPDATEs their own row. It skips when `auth.uid()` is null (service role, and the FK `ON DELETE SET NULL` cascade — otherwise deleting a user fails).
- `admin` is never a literal in migration SQL (`role::text = any(...)`): a freshly added enum value can't be used in the same transaction, breaking a from-scratch replay.

**Bootstrap:** after migrations nobody has a role. The first `head_coach` is inserted by hand; the statement is commented out at the bottom of both migrations on purpose (no hidden privilege grants). The first platform superadmin is granted the same way, by hand: `supabase/scripts/bootstrap-platform-admin.sql` (not a migration — see `docs/claude/gyms.md`).

## Account management (`/account`, `/members`)

- `/account` — own profile. **No "delete my account"** (out of scope). Editable: `full_name`, `email`, `phone`, `birth_date`, `notes`, password. `current_belt`, `current_stripes`, `rank_since` **read-only** — promotion is never self-service. Email change via `auth.updateUser({ email })`, applies after confirmation.
- `/members` is where accounts are managed; no separate user-management page (see members doc).
- Profile = `person` row linked by `person.auth_user_id`. `getOrCreateProfile()` (`utils/supabase/profile.ts`) creates it on demand as fallback to the trigger.
- Service-role actions in `app/members/actions.ts` each re-check `requireUserManager()`. Without the key the page renders but destructive controls are disabled.
- Revoking access deletes the `auth` user only; `auth_user_id` is `ON DELETE SET NULL` so registry and attendance survive. Deleting the record is a separate, later step (`deletePerson`, see members doc), refused by the policy while an account is linked.

## Invite registration (`/join`, `/pending`, `/members/requests`)

Spec: `docs/superpowers/specs/2026-10-02-gym-invite-registration-design.md`.

- **One link per gym** (`gym_invite`, its own table because every member reads their gym row). Generated and regenerated on `/gym` by user managers through `regenerate_invite_token()`; the old link stops at once, sent requests stay. `gym_for_invite()` (service role) resolves a link only for an **active** gym; anything else is a 404.
- **Signup** (`app/join/actions.ts` `register`): Turnstile, link re-read, `parseRegistration()` (`utils/registration.ts`, the one validation for signup and approval), then `createUser` with the athlete's own password, `email_confirm: true` (no email), `app_metadata.pending_gym_id` and **no** `gym_id` (so the auth trigger creates no profile), then the `registration_request` row; any failure after `createUser` deletes the account. A taken email gets the generic error; a taken username (race with the live check) gets its own.
- **Username reserved at signup**, unique across `person` and `registration_request` (trigger `username_cross_unique`, 23505). The live check (`checkUsername`) answers only behind a valid link — an accepted trade-off against the login's username secrecy. `login_email_for_username()` also resolves pending accounts.
- **Pending account**: `requireAdmin()` and the proxy send it to `/pending` (`/privacy`, `/auth/*` exempt); `current_gym_id()` is null, so RLS shows nothing anyway. "Check again" refreshes the session (the JWT keeps `pending_gym_id` until refreshed); a failed refresh (rejected = deleted account) signs out.
- **Approval** (`app/members/requests/actions.ts`, `requireUserManager`): request read through the user's client (gym proof), edited values re-validated, refused with "no longer pending" if the account already has a gym; email change first (a failure stops everything, with the generic error — never "address taken"), then `app_metadata = { gym_id, pending_gym_id: null }` → trigger creates or **links** the person (an account-less row with the same email keeps its own grade and dates; the page warns). Whether the row was linked is decided after the trigger, from the row itself (`person.created_at` earlier than the request), and a linked row's undo restores its previous username while unlinking. Profile filled with the service role as in `addPerson`, role `student` unless the linked row has an open role, request deleted. A failure after the gym is assigned puts the account back as pending. Idempotent, so concurrent approvals converge.
- **Rejection** deletes the auth account (the request cascades); refused when the account already has a gym or is not pending for this gym, and for a platform admin.

## Forced password change

Accounts from `addPerson` / `addManager`, and every staff reset, start on a **temporary password unique to that account** (`generateTemporaryPassword()`); nothing else opens until it's replaced. **Never a shared default**: a shared password let anyone who knew it take over any pending account, a manager's in another gym included (removed 2026-09-25; `supabase/scripts/pending-temporary-passwords.sql` lists accounts that may still be on it).
- The password reaches the maestro **once**, through `flashTemporaryPassword()` (`utils/temporary-password-flash.ts`): an httpOnly 5-minute cookie, with only a random `pw` id in the redirect URL; `<TemporaryPasswordNotice>` shows it when the id matches. Never put it in `?ok=` (browser history, request logs). The notice lists Username / Email / Password provvisoria; the password is a click-to-copy button and "Copia le credenziali" copies all three plus the reminder to replace it at first sign-in, composed on the server in the maestro's language (`components/copy-password.tsx`, Client Components, words as props; `use-copy.ts`: `navigator.clipboard`, then a throwaway textarea + `execCommand("copy")`, else a failure message with the password left selected). The `?ok=` messages name the person (`full_name`, email only as fallback), never the bare address.
- Flag in **`app_metadata.must_change_password`** (only service role can write; rides in the JWT). Never `user_metadata` (user could clear it).
- Enforced in `proxy.ts` (every path → `/change-password`, `/auth/*` and `/privacy` exempt) and in `requireAdmin()`.
- `requireSession()` = `requireAdmin()` minus that check; `/change-password` is the only page using it (else infinite redirect).
- The action refuses the current (temporary) password — GoTrue's `same_password` → `t.auth.sameAsTemporary` — clears the flag with the admin client, then **`refreshSession()`** (old JWT still carries the flag).
