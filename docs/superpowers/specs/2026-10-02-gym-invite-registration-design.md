# Gym invite link and self-registration with approval

Date: 2026-10-02. Status: approved in conversation, awaiting spec review.

## Goal

A gym manager or head coach shares one link; whoever opens it registers for **that gym**. The request waits in a
list where staff approve it, correcting the data first if needed. Until approved, the new account sees nothing.

This **reverses the "no self-serve signup" rule**, by explicit request of the user, and only partly. The new rule:
**no open signup; registration only through a gym's invite link, and only staff approval admits anyone.**
CLAUDE.md, `docs/claude/auth-and-access.md` and the memory `faixabjj-account-creation-policy` must say so.

## Decisions (from the conversation)

| Question | Decision |
| --- | --- |
| Who generates the link and approves | `head_coach` and `admin` (`can_manage_users()`, `requireUserManager()`); instructor excluded (approval edits belts) |
| Link model | One reusable link per gym; "Regenerate" invalidates the old one |
| Before approval | Account exists and can sign in, but sees only a "request pending" page; rejection deletes the account |
| Email confirmation | None (consistent with "no email is sent"); staff approval is the check |
| Name, birth date | Both required |
| Experience | "Have you trained BJJ before?" Yes → belt, stripe, belt date (optional), last stripe date (optional). No → white, 0 |
| Missing dates | Belt date and last stripe date default to the gym join date; staff can correct at approval |
| Role on approval | `student` |

## Data

Migration `supabase/migrations/20261002000000_gym_invite_registration.sql`, replay-safe:

- `gym.invite_token text unique` (`add column if not exists`), filled with a random value
  (`encode(extensions.gen_random_bytes(24), 'base64url')`-style, URL-safe) for gyms that have none.
- Table `registration_request`:
  `id uuid pk`, `gym_id not null references gym on delete cascade`,
  `auth_user_id uuid not null unique references auth.users on delete cascade`,
  `full_name`, `email`, `username not null` (reserved), `birth_date`, `joined_at`,
  `current_belt`, `current_stripes`, `rank_since`, `stripe_since`, `created_at default now()`.
  Same check constraints as `person` for belt/stripes/username format where they exist.
- `gym_scope` trigger + restrictive `"gym isolation"` policy, like every domain table.
- RLS: `select` and `delete` for `can_manage_users()`; **no insert or update policy** (only the service role writes).
- `gym_for_invite(p_token text) returns uuid`, `security definer`, `execute` granted to `service_role` only:
  the gym id if the token matches an **active** gym, else null.
- `regenerate_invite_token()`, `security definer`: own gym only, `can_manage_users()` re-checked, `42501` otherwise
  (the manager has no update on `gym`, same pattern as `set_gym_location()`). Returns the new token.
- `supabase/tests/tenant-isolation.sql` gets a check for `registration_request` (another gym's requests are
  invisible and undeletable; a student sees none).

### Username reserved at signup

The athlete picks a username checked live, and can sign in with it while pending. Uniqueness therefore spans
two tables, `person.username` and `registration_request.username`:

- `unique` index on `registration_request.username`, plus trigger `username_cross_unique` on both tables:
  takes `pg_advisory_xact_lock(hashtext(username))` and refuses (`23505`) a username present in the other table,
  **except the same account** (`request.auth_user_id = person.auth_user_id`) so approval can move it across.
  The existing `person` partial unique index stays.
- `username_available(p_username text) returns boolean`, `security definer`, `service_role` only: false if the
  username is in either table.
- `login_email_for_username()` is redefined in this migration to look in `registration_request` too
  (still one statement, a `union all ... limit 1`), so a pending account signs in with its username and lands on `/pending`.

**Trade-off accepted by the user:** the login hides whether a username exists, the live check reveals it. Kept
small: the check answers only with a valid invite token (server action, token re-resolved on every call), never
as a public endpoint; login brute force stays behind Turnstile.

## Flow

### 1. The link: `/gym`

Next to the check-in QR, for `requireUserManager()`: the link `SITE_URL/join/<token>` with click-to-copy
(`components/copy-password.tsx` / `use-copy.ts` already do clipboard) and a confirmed "Regenerate" button.

### 2. Public form: `/join/[token]`

Public route (not in `PROTECTED_PREFIXES`; signed-in users are redirected to `/dashboard` like on `/login`).
Server page resolves the token with `gym_for_invite()`; unknown, regenerated or suspended → `notFound()`.
Shows the gym name. Fields:

- full name*, email*, username* (pre-filled from the name with `NameUsernameFields`; availability shown live,
  "available" / "already taken", after a 400 ms pause via server action `checkUsername(token, username)`; format
  errors shown before asking), password*, repeat password*,
  birth date*, gym join date*
- "Have you trained BJJ before?" yes/no*. Yes reveals: belt* (Belt graphic selector, ladder by age),
  stripe*, belt date, last stripe date (both "if you remember"). No: hint "white belt, 0 stripes"
- privacy consent* (link to `/privacy`), Turnstile

Native date inputs; the reveal is a small Client Component, the rest server-rendered.

### 3. Submit: server action `register` (`app/join/actions.ts`)

1. **Turnstile verified in the action** (siteverify with `TURNSTILE_SECRET_KEY`, server-only env var). Supabase
   cannot verify here: the account is created with the service role, not `signUp()`. Enabling Supabase's public
   signup instead would open the signup API to anyone and bypass the invite. Missing secret → refuse (fail closed).
   This is the one place the app verifies Turnstile itself; login and recovery keep the rule "never verify in the action".
2. `parseRegistration(formData, today)` (`utils/registration.ts`, pure, tested) validates and normalises.
3. Token re-resolved with `gym_for_invite()` (it may have been regenerated meanwhile).
4. `admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { pending_gym_id } })`.
   No `gym_id`, so the auth trigger creates no person. Duplicate email or weak password → **generic** error
   (anti-enumeration), except password-policy errors, which reveal nothing and are shown.
5. Insert `registration_request` with the service role. On failure, delete the account just created. A `23505`
   on the username (taken between the live check and submit) → "username already taken", form kept; any other
   failure → generic error.
6. Redirect to `/login?registered=1` with a "request sent, sign in to follow it" message. **No automatic
   sign-in**: login requires a Turnstile token checked by Supabase, and the form's token was already redeemed in step 1.

### 4. Pending: `/pending`

`requireAdmin()`/`requireSession()` and `proxy.ts` send an account whose `app_metadata` has `pending_gym_id`
and no `gym_id` to `/pending` (exempt: `/auth/*`, `/privacy`, `/pending`). The page says the request was sent to
the gym (name shown) and offers sign-out. The JWT has no gym, so `current_gym_id()` is null and RLS returns
nothing; this is fail-closed even without the redirect.

### 5. Approval: `/members/requests`

Sub-route like `/members/new`, `requireUserManager()` (404), reached from a "Requests (N)" chip in the Registro
chip strip (shown only when N > 0, managers only). Not a second list of members: requesters are not members yet.

Each request: name, email, dates (`formatDate()`), Belt graphic, sent date, and a collapsed edit form pre-filled
with every field. If an **account-less person with the same email** exists in the gym, a warning says approval
will link the account to that record (the `link_invited_person` trigger does it) and the form's rank data will not
overwrite it.

**Approve** (`approveRegistration`, `app/members/actions.ts`):
1. `requireUserManager()`; read the request through the user's client (RLS = proof it is in the caller's gym).
2. Validate the edited values with `parseRegistration()` (approval mode: no password fields).
3. Service role: write `app_metadata = { gym_id, pending_gym_id: null }` → trigger creates (or links) the person.
4. Service role, addressed by the account and the caller's gym, as in `addPerson`: full name, birth date,
   `joined_at`, belt, stripes, `rank_since`, `stripe_since` (rank data skipped when the trigger linked an existing
   row). `person.username` = the request's username (allowed by the same-account exception; staff do not edit it,
   as elsewhere). Role `student` inserted on the user's client.
5. Delete the request with `.select("id")`; zero rows = someone else acted first → report it.
6. On failure after step 3: restore `pending_gym_id`, remove `gym_id` so nothing is half-done; the person row the
   trigger created is deleted with the service role.
7. Redirect with `?ok=` naming the person.

**Reject** (`rejectRegistration`): confirmed; request read through the user's client, then
`admin.auth.admin.deleteUser(auth_user_id)` (cascade removes the request). Refused if the account has a `gym_id`
or is a platform admin.

Both revalidate `/members` and `/members/requests`.

## Validation (`parseRegistration`)

- Required fields present; email shape; username via `isValidUsername()`; passwords equal (signup mode).
- No date in the future; `stripe_since >= rank_since`; `rank_since` may precede `joined_at` (belt from another academy).
- No experience → `white`, `0`, `rank_since = stripe_since = joined_at`.
- Missing belt/stripe dates → `joined_at`.
- Belt must be on the ladder for the age at `today` (`ADULT_BELTS` / `KID_BELTS`); stripes `0..4`, kid belts `0..3`.

## UI rules that apply

All strings in en / it / pt-BR; URL paths English (`/join`, `/pending`, `/members/requests`); dates via
`formatDate()`; belts as the `Belt` graphic; semantic colour tokens; DB errors only through `logDbError()`.
`/privacy` gains a paragraph: data of pending registrants, kept until approval, deleted on rejection.

## Testing

- Vitest: `utils/registration.ts`.
- Isolation/replay: username cross-table uniqueness (request vs person, same-account move allowed), `username_available()` and `login_email_for_username()` not executable by anon/authenticated.
- `bash supabase/tests/replay.sh --isolation` after the migration (replay twice).
- Manual in the running app: copy link, register (with and without experience), live username check, sign in while pending with username and with email, approve
  with a correction, reject, regenerate token (old link 404), suspended gym (link 404), duplicate email (generic error).

## Out of scope

Multiple or expiring links, email confirmation or notifications, a count on the staff dashboard, choosing a role
other than `student` at approval (roles are managed from `/members/[id]` afterwards), clean-up of never-approved requests.
