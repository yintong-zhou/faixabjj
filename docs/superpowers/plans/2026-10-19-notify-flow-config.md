# notify-flow configuration page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A superadmin-only `/email` area in Faixa BJJ that checks the notify-flow connection, shows 7-day
email stats per gym and per template, and edits (CRUD) the app's notify-flow templates with a live HTML
preview and a test send.

**Architecture:** Server Components + server actions under `app/email/`, guarded by
`requirePlatformAdmin()`. notify-flow `/v1` is called server-side only, through a new `utils/notify-admin.ts`
that reuses the env and `NotifyError` of `utils/notify-flow.ts`. Pure logic (template registry,
placeholders, preview, statuses) lives in `utils/email-templates.ts` with Vitest tests. Stats come from two
new `security definer` aggregate functions over `app_log`.

**Tech Stack:** Next.js 16 App Router (read `frontend/node_modules/next/dist/docs/` before writing Next
code — AGENTS.md), Tailwind v4, Supabase Postgres, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-notify-flow-config-design.md`

## Global Constraints

- Work on a branch (`feat/email-admin`), never commit to `main`.
- Superadmin only: every page and action calls `requirePlatformAdmin("/email…")`; anyone else 404.
- notify-flow key `NOTIFY_FLOW_API_KEY` server-only; never logged, never sent to the client.
- Never log or store email content, addresses, links or variable values (`app_log` gets ids, codes, names of templates only).
- No user-facing string hardcoded: `en` default, `it`, `pt-BR` — new section `t.emailAdmin` in all three dictionaries (`Dictionary = typeof it`).
- Dates via `formatDate()`; semantic colour tokens only (`--background`, `--foreground`, `--surface`, `--border`, `--muted`).
- notify-flow / DB error text never reaches the screen: translated generic message + `logDbError()`.
- Migration replay-safe (`create or replace`, `revoke`/`grant` idempotent), verified with `bash supabase/tests/replay.sh --isolation`, applied **by hand** to `poksgledkecwviypspmi`.
- Template name `^[a-z0-9-]{1,64}$`; locales `it`, `en`, `pt-BR`; subject 1–255 chars, single line; html ≤ 100 KB; text ≤ 50 KB.
- Placeholder syntax `{{ name }}`, name `[a-zA-Z0-9_]+`, spaces inside the braces optional.
- No new dependency (plain monospace `<textarea>`, no code editor).
- One `/v1` call per `/email` load (`GET /v1/templates`) plus `GET /health`; no automatic polling.

## Review Focus

1. **A save that would break real sends** — content using a placeholder outside an app template's fixed list must be refused before the PUT (test in Task 2: `unknownPlaceholders`), and the PUT must always declare the full fixed list incl. `appName` (test in Task 2: `declaredVariables`).
2. **Template HTML running in the app** — preview is an `<iframe sandbox="" srcdoc>` (no `allow-scripts`); sample values escaped (test in Task 2: `renderPreview` escapes `<script>`).
3. **notify-flow down or key refused** — `/email` must still render: connection lines red, templates section shows a translated "unavailable" note instead of crashing (test in Task 3: `listTemplates` throws `NotifyError(401, …)`; page handles it in Task 4).
4. **429 on a test send** — shows the translated "too many tests of this email, retry within the hour" (test in Task 3: `sendTest` maps 429 to `NotifyError(429, "rate_limited")`; Task 6 maps it to the message).
5. **URL params from the address bar** — `/email/<name>/<locale>` with an invalid name or locale → 404, not a notify-flow call (test in Task 2: `isTemplateName`; `isLocale` reused).

---

### Task 1: Stats functions (migration + isolation tests)

**Files:**
- Create: `supabase/migrations/20261019000000_platform_email_stats.sql`
- Modify: `supabase/tests/tenant-isolation.sql` (new block T27 before the final `select 'tenant isolation: all checks passed'`)
- Modify: `docs/claude/gyms.md:22` (list the two new definer functions next to the existing four)

**Interfaces:**
- Produces:
  - `public.platform_email_by_gym(p_days integer default 7) returns table (gym_id uuid, sent bigint, failed bigint)` — `gym_id` null = recipient with no person row.
  - `public.platform_email_by_template(p_days integer default 7) returns table (template text, sent bigint, failed bigint)`.
  - Both: `language sql stable security definer set search_path = ''`; rows only `where public.is_platform_admin()`; `revoke all … from public, anon; grant execute … to authenticated`.

Semantics (both): rows of `public.app_log` with `scope = 'notify'`, `action not like 'test:%'`,
`created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 7)))`;
`sent = count(*) filter (where level = 'event')`, `failed = count(*) filter (where level = 'error')`.
By gym: `left join public.person p on p.auth_user_id = l.subject_id`, group by `p.gym_id`. By template:
group by `l.action`. Order by `sent + failed desc`.

- [ ] **Step 1: Write the failing isolation test T27** in `tenant-isolation.sql`, following T24's pattern:
  as `postgres`, insert into `app_log` (scope `notify`): 2 `event` rows action `email-change` with
  `subject_id` = the gym-A admin's auth id (`00000000-0000-0000-0000-0000000000a1`), 1 `error` row action
  `welcome` with `subject_id` null, 1 `event` row action `test:email-change` (must be ignored). (No
  8-day-old row: `prune_app_log()` deletes it on its own insert, T26 already covers that.) Then:
  - as `…f0` (platform admin): `platform_email_by_gym(7)` row for `test.gym_a` has `sent = 2, failed = 0`; the `gym_id is null` row has `failed = 1`; `platform_email_by_template(7)` has `email-change` sent 2 and no `test:email-change` row → else `raise exception 'FAIL T27: …'`.
  - as `…a1` (gym admin): both functions return no rows.
  - as `anon`: calling either raises `insufficient_privilege`.
  Wrap each part in `begin; … rollback;` like T24.
- [ ] **Step 2: Run** `bash supabase/tests/replay.sh --isolation` — Expected: FAIL (function does not exist).
- [ ] **Step 3: Write the migration** with the two functions above, a header comment (why: superadmin sees counts only — gyms.md), and the revoke/grant lines.
- [ ] **Step 4: Run** `bash supabase/tests/replay.sh --isolation` — Expected: `tenant isolation: all checks passed`, and the replay runs every file twice without error.
- [ ] **Step 5: Update `docs/claude/gyms.md:22`** — "four definer functions" → six, naming `platform_email_by_gym(days)` and `platform_email_by_template(days)` (`20261019000000`, counts of notify sends from `app_log`, tests excluded).
- [ ] **Step 6: Commit** — `feat(email): platform email stats functions`.

### Task 2: Pure template logic

**Files:**
- Create: `frontend/utils/email-templates.ts`
- Test: `frontend/utils/email-templates.test.ts`

**Interfaces:**
- Consumes: `type EmailTemplate` from `@/utils/notify-flow` (type-only import), `LOCALES`/`isLocale`/`Locale` from `@/utils/i18n/locales`.
- Produces:
  - `APP_TEMPLATES: Record<EmailTemplate, { variables: readonly string[]; builtin: boolean }>` — values exactly: `password-reset` `["appName","name","resetUrl"]` builtin; `password-changed` `["appName","name"]` builtin; `email-change` `["appName","name","confirmUrl"]` custom; `email-changed` `["appName","name","newEmail"]` custom; `welcome` `["appName","name"]` builtin. (Re-check against `utils/account-emails.ts` and `app/members/requests/actions.ts` + `appName` added in `sendEmail()`.)
  - `isAppTemplate(name: string): name is EmailTemplate`
  - `isTemplateName(name: string): boolean` — `^[a-z0-9-]{1,64}$`.
  - `placeholders(text: string): string[]` — unique names in order of first appearance.
  - `unknownPlaceholders(parts: string[], allowed: readonly string[]): string[]`
  - `declaredVariables(name: string, parts: string[]): string[]` — app template → its fixed list; otherwise `placeholders` of all parts ∪ `appName`, sorted.
  - `sampleValues(siteUrl: string, appName: string): Record<string, string>` — `appName`, `name: "Mario Rossi"`, `resetUrl: ${siteUrl}/reset-password?token=example`, `confirmUrl: ${siteUrl}/confirm-email?token=example`, `newEmail: "mario.rossi@example.com"`.
  - `renderPreview(html: string, values: Record<string, string>): string` — replaces placeholders with HTML-escaped values (`& < > " '`); a placeholder with no value stays as written.
  - `type LocaleState = "builtin" | "customised" | "custom" | "missing"`
  - `templateStates(list: { name: string; locale: string; builtin: boolean }[]): Map<string, Record<Locale, LocaleState>>` — includes every `APP_TEMPLATES` name even if absent from `list` (→ `missing`); own row over a built-in name → `customised`; own row otherwise → `custom`. Built-in-ness of a name: `APP_TEMPLATES[name]?.builtin` or any list entry with `builtin: true`.
  - `missingAppTemplates(states: Map<string, Record<Locale, LocaleState>>): { name: EmailTemplate; locale: Locale }[]`

- [ ] **Step 1: Write the failing tests** (`describe` per function), including:
  - `placeholders("Hi {{ name }} {{name}} {{ resetUrl }}")` → `["name","resetUrl"]`; `placeholders("{{ bad-name }}")` → `[]`.
  - `unknownPlaceholders(["{{ name }} {{ oops }}"], APP_TEMPLATES["password-changed"].variables)` → `["oops"]`.
  - `declaredVariables("email-change", ["no placeholders"])` → `["appName","name","confirmUrl"]`; `declaredVariables("promo", ["{{ name }}"])` → `["appName","name"]`.
  - `renderPreview("<p>{{ name }}</p>", { name: "<script>x</script>" })` → `"<p>&lt;script&gt;x&lt;/script&gt;</p>"`; `renderPreview("{{ other }}", {})` → `"{{ other }}"`.
  - `isTemplateName("email-change")` true; `"Email"`, `""`, `"a".repeat(65)`, `"../x"` false.
  - `templateStates([{name:"welcome",locale:"it",builtin:false},{name:"welcome",locale:"en",builtin:true}])` → welcome `{ it: "customised", en: "builtin", "pt-BR": "missing" }`; `email-change` all `missing`.
  - `missingAppTemplates` of the above contains `{ name: "email-change", locale: "it" }` and `{ name: "welcome", locale: "pt-BR" }`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run utils/email-templates.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `utils/email-templates.ts` (no `server-only`: the editor's client component uses `renderPreview`/`placeholders`). Placeholder regex `/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g`. Annotate `APP_TEMPLATES` with `satisfies Record<EmailTemplate, …>` so a new `EmailTemplate` without an entry fails `tsc`.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(email): template registry, placeholders and preview`.

### Task 3: notify-flow admin client

**Files:**
- Create: `frontend/utils/notify-admin.ts` (`import "server-only"`)
- Modify: `frontend/utils/notify-flow.ts` — export `notifyConfig(): { url: string; key: string; appName: string } | null` (the env read `sendEmail` already does; make `sendEmail` use it).
- Test: `frontend/utils/notify-admin.test.ts` (mock `server-only` and `fetch` as `notify-flow.test.ts` does)

**Interfaces:**
- Consumes: `NotifyError`, `notifyConfig` from `@/utils/notify-flow`.
- Produces (all throw `NotifyError`; status 0 + `not_configured` when `notifyConfig()` is null; 30 s timeout; `Authorization: Bearer <key>`; `cache: "no-store"`):
  - `checkHealth(): Promise<boolean>` — `GET /health` (no auth), true on 2xx, false otherwise (never throws).
  - `type TemplateSummary = { name: string; locale: string; updatedAt: string | null; builtin: boolean }`
  - `listTemplates(): Promise<TemplateSummary[]>` — `GET /v1/templates`; read notify-flow's `src/routes/templates.ts` for the exact response envelope and parse only that.
  - `type TemplateContent = { subject: string; html: string; text: string; variables: string[]; builtin: boolean }`
  - `getTemplate(name: string, locale: Locale): Promise<TemplateContent | null>` — 404 → null.
  - `putTemplate(name: string, locale: Locale, body: Omit<TemplateContent, "builtin">): Promise<void>`
  - `deleteTemplate(name: string, locale: Locale): Promise<void>` — 204 ok; 404 → `NotifyError(404, "not_found")`.
  - `sendTest(email: { template: string; to: string; locale: Locale; variables: Record<string, string> }): Promise<{ id: string; status: string }>` — `POST /v1/email/send` **synchronous** (no `Prefer: respond-async`), `Idempotency-Key: test:<crypto.randomUUID()>`; 502 with an id → `{ id, status: "failed" }`; 429 → `NotifyError(429, "rate_limited")`.
  - `emailStatus(id: string): Promise<{ status: string; errorCode: string | null }>` — `GET /v1/email/{id}`.
  - Other errors: code from body `error.code` when present, else `unexpected_response` (same shape as `notify-flow.ts` `post()`).

- [ ] **Step 1: Write failing tests:** `listTemplates` parses a 200 list into `TemplateSummary[]`; 401 → rejects `NotifyError` with `status 401`; `getTemplate` 404 → `null`; `putTemplate` sends `PUT …/v1/templates/email-change/it` with JSON body `{subject, html, text, variables}`; `deleteTemplate` 204 resolves; `sendTest` 200 `{id, status:"submitted"}` → returns it and the request has **no** `Prefer` header; `sendTest` 429 → `NotifyError(429, "rate_limited")`; `checkHealth` with fetch rejecting → `false`; missing env → `NotifyError(0, "not_configured")`; the API key never appears in any thrown error's message.
- [ ] **Step 2: Run** `cd frontend && npx vitest run utils/notify-admin.test.ts utils/notify-flow.test.ts` — Expected: new file FAIL, existing PASS.
- [ ] **Step 3: Implement** `notifyConfig()` in `notify-flow.ts` and the module above.
- [ ] **Step 4: Run** the same command — Expected: both PASS.
- [ ] **Step 5: Commit** — `feat(email): notify-flow admin client`.

### Task 4: `/email` overview page (connection, stats, template list) + navigation

**Files:**
- Create: `frontend/app/email/page.tsx`
- Modify: `frontend/utils/supabase/proxy.ts` (`PROTECTED_PREFIXES` add `"/email"`), `frontend/utils/supabase/require-admin.ts:97` (`PLATFORM_PATHS` add `"/email"`), `frontend/components/nav-shell.tsx` (an `EMAIL_ITEM` `{ href: "/email", key: "email", icon: MailIcon }` shown with `LOGS_ITEM` for the platform admin; add `MailIcon` to `components/icons.tsx` if absent), `frontend/app/layout.tsx` (label `email: t.nav.email`), the three dictionaries (`t.nav.email`, new `t.emailAdmin` section), `docs/claude/auth-and-access.md` (Email section: one paragraph on `/email`), `docs/claude/frontend-ui.md` (nav: platform admin items).

**Interfaces:**
- Consumes: Task 1 functions via `session.supabase.rpc("platform_email_by_gym", { p_days: 7 })` / `("platform_email_by_template", { p_days: 7 })`; gym names via `session.supabase.from("gym").select("id, name")`; Task 2 `templateStates`, `missingAppTemplates`, `APP_TEMPLATES`; Task 3 `checkHealth`, `listTemplates`, `notifyConfig`; `linkSecret()` from `@/utils/auth-link-token`; `SITE_URL` from `@/utils/site`.
- Produces: `t.emailAdmin` keys used by Tasks 5–7 (at least: `title`, `subtitle`, `connection.*`, `stats.*`, `templates.*`, `states.{builtin,customised,custom,missing}`, `when.<EmailTemplate>`, `notSentByApp`, `editor.*`, `test.*`, `errors.*`, `create.*`).

Page content, top to bottom:
1. **Connection** — one line per check, ok/ko icon + translated label, no values: env present (`NOTIFY_FLOW_URL`, `NOTIFY_FLOW_API_KEY`, `NOTIFY_FLOW_APP_NAME` via `notifyConfig()`; `AUTH_LINK_SECRET` via `linkSecret()`; `NEXT_PUBLIC_SITE_URL` set); `checkHealth()`; key accepted (= `listTemplates()` succeeded; 401 → "key refused", other → "unavailable"); app templates complete (`missingAppTemplates` empty, else list `name (locale)`).
2. **Last 7 days** — note "accepted by notify-flow, not necessarily delivered"; table *per gym* (name, sent, failed; null gym → `t.emailAdmin.stats.noGym`), table *per email type* (template, sent, failed). RPC error → `logDbError("email", "stats", error)` + translated note, page still renders.
3. **Templates** — table from `templateStates`: name, "when" (`t.emailAdmin.when[name]`, else `notSentByApp`), one cell per locale with the state, each linking to `/email/<name>/<locale>`; a "New template" link to `/email/new`. If `listTemplates()` failed: translated "unavailable" note instead of the table.

- [ ] **Step 1: Read** `frontend/node_modules/next/dist/docs/` for the current page/`params`/`searchParams` conventions, and `app/logs/page.tsx` + `app/gyms/page.tsx` for layout and table style.
- [ ] **Step 2: Implement** the page, the nav item, the route lists and the dictionary entries.
- [ ] **Step 3: Run** `cd frontend && npx tsc --noEmit -p . && npm run lint && npm test` — Expected: all clean/pass.
- [ ] **Step 4: Verify in the app** (launch config `frontend`), signed in as the superadmin: `/email` shows the connection lines green, stats matching `app_log` notify rows of the last 7 days, the template table with `email-change`/`email-changed` *custom* and the built-ins *builtin*. Signed in as a gym manager (e.g. littlegym): `/email` → 404 and no nav item. With `NOTIFY_FLOW_API_KEY` temporarily wrong in `.env.local`: page renders, "key refused" red, templates "unavailable".
- [ ] **Step 5: Commit** — `feat(email): superadmin email overview page`.

### Task 5: Template editor (edit, restore, delete)

**Files:**
- Create: `frontend/app/email/[name]/[locale]/page.tsx`, `frontend/app/email/[name]/[locale]/template-editor.tsx` (`"use client"`), `frontend/app/email/actions.ts` (`"use server"`)
- Modify: `execution/notify_templates.py` (top docstring: "overwrites what was edited from /email"), `execution/README.md` (same warning), dictionaries (`t.emailAdmin.editor.*`, `errors.*`).

**Interfaces:**
- Consumes: Task 2 `isTemplateName`, `isAppTemplate`, `APP_TEMPLATES`, `declaredVariables`, `unknownPlaceholders`, `sampleValues`, `renderPreview`; Task 3 `getTemplate`, `putTemplate`, `deleteTemplate`, `notifyConfig`; `isLocale`; `ConfirmSubmitButton` from `components/confirm-submit-button.tsx`; `logEvent`, `logDbError`.
- Produces (server actions in `app/email/actions.ts`, each starting with `requirePlatformAdmin` and re-validating name/locale, ending in `redirect` to `/email/<name>/<locale>?ok=…|error=…`):
  - `saveTemplate(formData: FormData)` — fields `name`, `locale`, `subject`, `html`, `text`.
  - `removeTemplate(formData: FormData)` — fields `name`, `locale`; used for both "Restore default" and "Delete".

Rules:
- Page: invalid `name` (`isTemplateName`) or `locale` (`isLocale`) → `notFound()`. `getTemplate` null → for an app template show an empty editor (state *missing*) so it can be created; for any other name `notFound()` (Task 7 adds `?new=1`). notify-flow error → translated "unavailable" note.
- Editor layout A: locale switcher (links to the three `/email/<name>/<locale>`), subject `<input>`, then `grid sm:grid-cols-2`: HTML `<textarea>` (monospace) | preview `<iframe sandbox="" srcDoc={renderPreview(html, samples)} title=…>`; plain-text `<textarea>` below; then the variable list with sample values; for an app template a line listing allowed placeholders, and any `unknownPlaceholders` shown live as a warning. Preview updates on input (client state).
- `saveTemplate`: subject trimmed, non-empty, no CR/LF, ≤ 255 chars; html non-empty ≤ 100 000 bytes; text non-empty ≤ 50 000 bytes (UTF-8 byte length); app template with `unknownPlaceholders([subject, html, text], APP_TEMPLATES[name].variables)` non-empty → error naming them; PUT with `variables = declaredVariables(name, [subject, html, text])`. notify-flow 4xx → generic `errors.saveRejected`, other → `errors.unavailable`; both `logDbError("email", "saveTemplate", { code: \`${status} ${code}\` })`. Success → `logEvent({ userId, gymId: null }, "email", \`save:${name}:${locale}\`)`.
- `removeTemplate`: app template that is **not** built-in → refused with `errors.deleteAppTemplate` (no DELETE call). Built-in name → label "Restore default", only shown when the state is *customised*; custom non-app → label "Delete". Both behind `ConfirmSubmitButton`. Success → `logEvent(…, "email", \`delete:${name}:${locale}\`)`, redirect to `/email` for a deleted custom template, to the same editor for a restored one.

- [ ] **Step 1: Implement** page, editor and the two actions; add the script/README warning.
- [ ] **Step 2: Run** `cd frontend && npx tsc --noEmit -p . && npm run lint && npm test` — Expected: clean/pass.
- [ ] **Step 3: Verify in the app** as the superadmin: open `/email/email-change/it` → current custom content loads, preview renders with "Mario Rossi"; type `{{ oops }}` in the HTML → live warning, Save → refused with the placeholder named, nothing changed on notify-flow (reload shows the old content); a valid edit → saved, reload shows it; on `email-change` no delete button and a crafted POST of `removeTemplate` is refused; `/email/welcome/it` after saving an edit shows "Restore default", which brings back the built-in; `/email/Bad/it` and `/email/welcome/xx` → 404. Put the original `email-change` IT content back afterwards (`python execution/notify_templates.py`).
- [ ] **Step 4: Commit** — `feat(email): template editor with live preview`.

### Task 6: Test send and status

**Files:**
- Modify: `frontend/app/email/actions.ts` (`sendTemplateTest`, `refreshTestStatus`), `frontend/app/email/[name]/[locale]/page.tsx` + `template-editor.tsx` (test panel), dictionaries (`t.emailAdmin.test.*`).

**Interfaces:**
- Consumes: Task 3 `sendTest`, `emailStatus`, `getTemplate`, `notifyConfig`; Task 2 `sampleValues`, `declaredVariables`; `logOutcome`, `logDbError`; `session.email`; `SITE_URL`.
- Produces:
  - `sendTemplateTest(formData: FormData)` — fields `name`, `locale`. Sends the **saved** template to `session.email` (no address → `errors.noOwnEmail`), variables = every name in `declaredVariables(name, [saved subject, html, text])` with its value from `sampleValues(SITE_URL, notifyConfig().appName)`, `"example"` for any name without one. Logs `logOutcome("notify", \`test:${name}\`, { code: status, message: id, subjectId: session.userId })` (excluded from stats by Task 1). Redirects to the editor with `?test=<id>&status=<status>`.
  - `refreshTestStatus(formData: FormData)` — field `id` (validated `^msg_[0-9a-f-]{36}$`), calls `emailStatus`, redirects with the new `status` (+ `error` code if any).

Rules: 429 → `t.emailAdmin.test.rateLimited` ("Too many tests of this email: notify-flow allows 5 per hour to the same address. Try again within the hour."); the button carries a hint with the same limit; other errors → `errors.unavailable` + `logDbError("email", "sendTemplateTest", …)`. Status shown with a translated label per notify-flow status (`accepted, queued, processing, submitted, failed, retrying`) and a "Refresh status" button (no polling).

- [ ] **Step 1: Implement** the two actions and the panel.
- [ ] **Step 2: Run** `cd frontend && npx tsc --noEmit -p . && npm run lint && npm test` — Expected: clean/pass.
- [ ] **Step 3: Verify in the app** as the superadmin: "Send test to me" on `/email/password-changed/it` → status `submitted` shown, email arrives at the superadmin's address with sample values; "Refresh status" updates it; `/logs` shows a `test:password-changed` row; `/email` stats unchanged by the test.
- [ ] **Step 4: Commit** — `feat(email): test send with status`.

### Task 7: Create a template

**Files:**
- Create: `frontend/app/email/new/page.tsx`
- Modify: `frontend/app/email/actions.ts` (`createTemplate`), `frontend/app/email/[name]/[locale]/page.tsx` (accept `?new=1` for a non-app name with no template), dictionaries (`t.emailAdmin.create.*`).

**Interfaces:**
- Consumes: Task 2 `isTemplateName`, `isAppTemplate`; Task 3 `listTemplates`; `isLocale`.
- Produces: `createTemplate(formData: FormData)` — fields `name`, `locale`. Refuses an invalid name (`errors.badName`); refuses with `errors.nameTaken` any name that is an app template, a built-in, or already has a row in that locale (all from one `listTemplates()`). On success redirects to `/email/<name>/<locale>?new=1`, where the editor starts empty and the first Save creates it.

Rules: the page states plainly (`t.emailAdmin.create.notUsedYet`) that the app sends a template only once code uses it.

- [ ] **Step 1: Implement** page, action and the `?new=1` branch.
- [ ] **Step 2: Run** `cd frontend && npx tsc --noEmit -p . && npm run lint && npm test` — Expected: clean/pass.
- [ ] **Step 3: Verify in the app**: create `promo-test` IT → editor opens empty → save with `{{ name }}` → appears in `/email` as *custom*, "not sent by the app"; `welcome` / `email-change` refused as taken; `Bad Name` refused; delete `promo-test` from the editor → gone from the list.
- [ ] **Step 4: Commit** — `feat(email): create custom templates`.

### Deploy note (after Task 7)

Apply `supabase/migrations/20261019000000_platform_email_stats.sql` by hand to `poksgledkecwviypspmi`
**before** deploying the frontend (the page calls the functions). Without it the stats section shows its
"unavailable" note and logs the error; the rest works.
