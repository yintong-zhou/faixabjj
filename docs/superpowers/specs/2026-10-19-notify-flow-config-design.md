# notify-flow configuration page (superadmin) — design

Date: 2026-10-19. Status: draft for approval.

## Intent

Faixa BJJ sends every email through notify-flow (`docs/claude/auth-and-access.md` → Email). Today the
only way to change what those emails say, or to try one, is the command line
(`execution/notify_templates.py`, `execution/notify_smoke.py`). Those scripts stay, for developers. The
superadmin (jurion) — not a developer — wants to do the same from the web app, and to see how much
email the app is sending and for which gyms.

The user's framing: *every* web/mobile project that uses notify-flow should have its own configuration
page for it. This is the first one; the others will follow the same idea in their own codebase (no
shared package — user didn't ask for one, builder's note).

## Who

The platform superadmin only (`requirePlatformAdmin()`, 404 for anyone else). Gym managers never see it.

## Goals

1. **Connection check** — at a glance: is notify-flow reachable, is our key accepted, is everything the
   email flows need configured.
2. **Statistics, last 7 days** — total emails sent **per gym**, and the **most-sent email types**.
3. **Templates, CRUD** — list, open, edit, create, delete/restore the app's templates, in the three
   locales (`it`, `en`, `pt-BR`).
4. **Editor: HTML written by hand, with a live rendered preview side by side** (layout "A", chosen by the
   user on the mockup), and the **plain-text version also written by hand** (user's choice — no
   auto-generation).
5. **Send a test** of the template being edited, and show its delivery status.

## Non-goals (decided with the user)

- **No API key management and no "variables management".** The user explicitly dropped both.
- No SMTP / sender / from-name settings: they are notify-flow Worker secrets, global to every app, not
  reachable through its API.
- No stats beyond 7 days, no per-recipient delivery lists (notify-flow's own `/admin/` dashboard already
  has deliveries/logs across all apps).
- No changes to the notify-flow repo.

## Anti-goals

- A save from this page must never make a real email fail to send. (notify-flow rejects a send whose
  variables don't match the template's declared list exactly — `invalid_variables`.)
- Template HTML must never run inside the app page.
- No email address, link or variable value is ever logged or stored (existing rule).

## Constraints from what exists

notify-flow `/v1` API, authenticated by our client key (`NOTIFY_FLOW_API_KEY`, server-only):

- `GET /v1/templates` → `[{name, locale, updated_at, builtin}]` (own rows + built-ins not overridden).
- `GET /v1/templates/{name}/{locale}` → `{name, locale, subject, html, text, variables, builtin}`; falls
  back to the built-in.
- `PUT /v1/templates/{name}/{locale}` body `{subject, html, text, variables}`; name `^[a-z0-9-]{1,64}$`;
  subject 1–255 chars, one line; html ≤ 100 KB; text ≤ 50 KB; every `{{ placeholder }}` must be in
  `variables`.
- `DELETE /v1/templates/{name}/{locale}` → 204, 404 if no own row. Deleting an override brings the
  built-in back.
- Built-ins (in notify-flow code, 3 locales): `welcome`, `verify-email`, `password-reset`,
  `password-changed`, `login-alert`, `generic-notification`.
- Placeholders `{{ name }}` (`[a-zA-Z0-9_]`). Values are HTML-escaped in html, CR/LF stripped in subject,
  raw in text. Locale fallback at send: requested → `en`.
- `GET /health` (no auth). `POST /v1/email/send`, `GET /v1/email/{id}` → `{id, status, error_code}`.
- **No preview endpoint.** **No stats on `/v1`** (notify-flow's stats are behind its own admin cookie
  session, unreachable from another origin).

Faixa BJJ side:

- Emails the app sends, and the variables the code passes (`utils/account-emails.ts`,
  `app/members/requests/actions.ts`):

  | template | built-in? | variables | when |
  | --- | --- | --- | --- |
  | `password-reset` | yes | `appName`, `name`, `resetUrl` | /forgot-password |
  | `password-changed` | yes | `appName`, `name` | password changed by its owner |
  | `email-change` | no (custom) | `appName`, `name`, `confirmUrl` | email change requested on /account |
  | `email-changed` | no (custom) | `appName`, `name`, `newEmail` | email change confirmed |
  | `welcome` | yes | `appName`, `name` | signup approved |

  `appName` is added to every send by `sendEmail()` (`utils/notify-flow.ts`, from
  `NOTIFY_FLOW_APP_NAME`), so every template declares it. (Verify the exact variable sets against the
  code when building — they are the contract.)
- notify-flow rate limits: per client 60 requests/minute shared with every real email
  (`CLIENT_RATE_LIMITER`), and at most `RECIPIENT_LIMIT_PER_HOUR` (default 5) sends per recipient +
  template per hour (429; `sendEmail()` never retries a 429).
- `docs/claude/gyms.md` (platform superadmin): the superadmin sees **counts only, aggregated inside the
  database** — anything new for it is a definer function returning aggregates,
  `where public.is_platform_admin()`.
- `app_log` (`20261006000000`): one row per send, scope `notify`, action = template, level `event` +
  code `accepted` (message = notify-flow id) or level `error` + `status code`; `subject_id` = the
  recipient account; **`gym_id` is null** on these rows (sent in `after()`, no session). Retention: 7
  days / 2000 rows, pruned by trigger.
- `execution/notify_templates.py` PUTs the custom templates idempotently — **running it overwrites any
  edit made from the web page.**

## Decisions

### Placement

- One page for the platform superadmin, URL in English. **Builder's call:** `/email` (add to
  `PROTECTED_PREFIXES` and `PLATFORM_PATHS`), with a nav link next to `/logs`. Editor at
  `/email/[name]/[locale]`, creation at `/email/new`.
- Strings in all three languages; dates via `formatDate()`; semantic colour tokens (CLAUDE.md rules).

### Connection check (top of `/email`)

Each line green/red, no secret values shown:
- `NOTIFY_FLOW_URL` / `NOTIFY_FLOW_API_KEY` / `NOTIFY_FLOW_APP_NAME` / `AUTH_LINK_SECRET` (≥ 32 chars)
  / `NEXT_PUBLIC_SITE_URL` present.
- `GET /health` answers.
- The key is accepted (`GET /v1/templates` → 200; 401 → "key refused").
- Every template the app uses resolves in every locale (own row or built-in) — a missing custom one
  (e.g. `email-change` never uploaded) is flagged, since that email would fail. Worked out from the one
  `GET /v1/templates` list, **not** one GET per template × locale (rate limit shared with real emails —
  my call). The same list feeds the templates table, so `/email` costs one `/v1` call plus `/health`.

### Statistics (last 7 days, from `app_log`)

- **Emails per gym**: `app_log` rows `scope = 'notify'`, last 7 days; gym = the recipient account's
  `person.gym_id` (via `subject_id` → `person.auth_user_id`). An account with no person row (the
  superadmin) or a deleted one goes under a "no gym" bucket. Columns: gym name, sent (event rows),
  failed (error rows).
- **Most-sent types**: same rows grouped by `action` (template), sorted desc, sent/failed.
- **Counted inside the database** (gyms.md rule): a new `security definer` function, e.g.
  `platform_email_stats(days int)`, `set search_path = ''`, returning only aggregates (per gym: gym id,
  gym name, sent, failed; per template: action, sent, failed) and nothing unless
  `public.is_platform_admin()`; executable by `authenticated`, called with the superadmin's own client.
  It goes in a **new, replay-safe migration** (`create or replace`, `revoke … from public, anon`),
  verified by replaying in Docker and applied by hand to `poksgledkecwviypspmi` before deploy
  (`docs/claude/database.md`). Test sends (below) are excluded. Volumes are tiny (≤ 2000 rows by
  construction).
- Labelled honestly: "accepted by notify-flow", not "delivered" (final delivery isn't recorded).
- `ponytail:` ceiling — app_log's 2000-row cap could cut a busy week short; a dedicated send table is the
  upgrade if that ever happens. Show a note when the oldest row is younger than 7 days *and* the table is
  at the cap.

### Templates list

From `GET /v1/templates`, joined with the table above. One row per template name; per locale: *built-in*,
*customised* (own row over a built-in), *custom* (own row, no built-in) or *missing*. Plus "used by the
app: when …" for the five above; other names (built-ins the app doesn't send, templates created here)
shown as "not sent by the app".

### Editor (`/email/[name]/[locale]`) — layout A

- Locale switcher (IT / EN / PT), subject input, then **HTML textarea left, preview right** (stacked on
  a phone), plain-text textarea below (written by hand), then the variables with their sample values.
- **Preview**: client-side render of `{{ var }}` with sample values (HTML-escaped, as notify-flow does),
  shown in an `<iframe sandbox srcdoc>` with no `allow-scripts` — the email's HTML never runs in the app.
  Updates as you type.
- **Variables are not editable** (user dropped variable management):
  - For a template the app sends: the declared list is the table above, fixed in code. Saving is refused
    if subject/html/text contain a `{{ placeholder }}` outside that list. Placeholders from the list may
    be left out of the content (the PUT still declares the full list, so sends keep matching).
  - For a template created here (not sent by the app): the declared list is whatever placeholders the
    content uses, derived on save, **always plus `appName`** (every send carries it).
- Sample values: fixed per variable in code (e.g. `name` → "Mario Rossi", URLs → `SITE_URL/...`), so the
  preview and the test look real.
- Buttons:
  - **Save** → PUT (server action, re-guarded). notify-flow's validation errors map to a generic,
    translated message per field (never its raw text on screen; logged with `logDbError`).
  - **Send test to me** → `POST /v1/email/send` with the **saved** template, the superadmin's own
    address, the current locale and the sample values; then show the returned status, with a
    **"refresh status" button** for `GET /v1/email/{id}` — no automatic polling (my call: every poll
    spends the request budget real emails share). Goes through `deliver()`-style logging (`app_log`,
    action `test:<template>` so it doesn't inflate the stats — builder may choose another marker).
  - Tests count against notify-flow's per-recipient limit (5 per template per hour by default): too many
    tests of e.g. `password-reset` would hold back the superadmin's *own* real reset for up to an hour.
    Accepted (my call: the superadmin is one person, and a real reset of their own is rare); a 429 shows
    a clear translated "too many tests of this email, retry within the hour" instead of a generic error,
    and the button says the limit next to it.
  - **Restore default** (customised over a built-in) → DELETE, confirm first.
  - **Delete** (custom, no built-in) → DELETE, confirm first. **Refused for a template the app sends**
    (deleting `email-change` would break every email change).
- Every save / restore / delete / create → an `app_log` event (scope `email`, action, subject = template
  name in the message). Never the content.

### Create (`/email/new`)

Name (validated `^[a-z0-9-]{1,64}$`, not already existing), locale, then the same editor. Builder's
call: allowed so the CRUD is complete; the page says plainly that the app sends it only once code uses
it.

### Scripts

`execution/notify_templates.py` stays for developers. Add a warning to it and to `execution/README.md`:
it overwrites what was edited from `/email`.

## Left to the builder

File/component split; the definer function's exact name and return shape (one function returning both
groupings, or two); textarea vs a code editor (no new dependency unless clearly worth it — default: plain
textarea, monospace); docs updates in `docs/claude/auth-and-access.md` (Email) and `gyms.md` if
superadmin pages are listed there.

## Verification

- Unit tests (Vitest, `utils/`): placeholder extraction, preview rendering (escaping), "placeholder
  outside the allowed list" check, gym bucketing of log rows.
- In the running app as the superadmin: connection lines green; stats match `app_log`; edit
  `email-change` IT → preview updates → save → send test → status shows; restore a built-in override;
  delete refused for an app template; a gym manager gets 404 on `/email`.
