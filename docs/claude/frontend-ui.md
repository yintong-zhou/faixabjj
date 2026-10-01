# Frontend: UI, languages, privacy

## Languages (en, it, pt-BR)

- **English is the default** (`DEFAULT_LOCALE`, `utils/i18n/locales.ts`); **Italian is the authoring language**: `dictionaries/it.ts` defines the `Dictionary` type, `en.ts`/`pt-BR.ts` are typed as it (missing key = compile error). No `as const` on the Italian object. Don't collapse default and authoring language.
- Read by property: `const { t } = await getDictionary()` → `t.registro.title`. Interpolating/pluralising values are functions (`t.dashboard.ofTotal(12)`).
- **Locale lives in a cookie, not the URL** (explicit). Trade-off: the landing page has one URL in three languages.
- `getLocale()`: saved cookie → closest `Accept-Language` (only when no cookie) → default.
- **Client Components get words as props** (`NavShell`, `ThemeToggle`, `PasswordInput`, reset-password form). `Belt` is an async Server Component reading the dictionary itself.
- **Pure utils take the dictionary as a parameter with an English default** (`formatDays`, `formatHours`, `formatWeekdays`, `formatDayHeading`, `beltLabel`, `roleLabel`); `formatMonthHeading` takes a `Locale` (months from `Intl`). Weekday names from the dictionary.
- **URL paths are English** (`/members`, `/attendance`, `/courses`, `/change-password`, `#how-it-works`); dictionary keys keep Italian names (`t.registro`, `t.presenze`, `t.corsi`) — deliberate.
- **Dates dd/mm/yyyy in every language.**
- Server actions look up their own messages (`t.msg.*`).
- Language names never translated (`LOCALE_LABELS`), used as each option's `aria-label`/`title`.
- **Never hardcode a user-facing string.**

## Privacy and cookies

`/privacy` = privacy notice + cookie policy, public, three languages, linked from every footer.
- **The banner informs, it does not ask**: only technical/preference storage (Supabase session cookie, language cookie, `theme` and acknowledgement in `localStorage`), exempt under ePrivacy. So `components/cookie-notice.tsx` has **one button** — a fake "reject" is worse than none. **The day analytics is added, it must become a real consent gate.**
- Acknowledgement stored under a version string (bump `NOTICE_VERSION` to re-show); read via `useSyncExternalStore`, `null` on the server (no flash).
- **The notice is a draft and says so on the page** (placeholders `[NOME DELLA PALESTRA]`, `[EMAIL DI CONTATTO]`, retention; visible warning).
- `/privacy` reachable in every state: in `PUBLIC_PATHS`, not in `PROTECTED_PREFIXES`/`VISITOR_ONLY`, exempt from the forced-password redirect.
- Text in dictionaries (`privacy`, `cookieNotice`); `UPDATED_ON` hardcoded on purpose.

## Theme and colours

- **Brand colours are not semantic tokens.** The five brand values (`brand-guidelines.md`) are fixed; themed tokens are `--background`, `--foreground`, `--surface`, `--border`, `--muted`. Use those for anything that must read in both themes.
- Dark specifics: `--surface` lifted just off `--background`; `--border` distinct from `--surface`; `--color-accent` lightened to `#7d97ee` (contrast). `bg-muted` is the hover wash, never a fixed grey. Exception: the logo plate sits on `bg-secondary` (fixed light) in both themes.
- `--success`/`--danger` are the only meaning-bearing colours (present/absent), flipped per theme.
- **Toggle** (`components/theme-toggle.tsx`): `localStorage["theme"]` (`light`|`dark`|absent = system) → `data-theme` on `<html>`. Keep in sync:
  - `app/globals.css`: light on `:root`, `prefers-color-scheme: dark` guarded by `:not([data-theme="light"])`, plus unconditional `[data-theme="dark"]`/`[data-theme="light"]` blocks.
  - Blocking inline script in `app/layout.tsx` `<head>` applies the stored theme before paint. Never move it to an effect.
  - **`color-scheme` in all four token blocks** (native date picker, spinners, selects, scrollbars). `accent-color` = brand. Selects: `appearance: none` + `--select-arrow` data URI defined once per theme (same chevron as `icons.tsx`); the extra `select[class]` rule gives arrow clearance over `px-3.5`. Date/time fields: `appearance: none`, `min-width: 0`, `font-family: inherit`, all inside **`:where()`** so Tailwind classes still win.
  - The toggle reads via `useSyncExternalStore`; a `faixabjj-theme-change` event syncs instances.
- Tokens are CSS variables in `app/globals.css` (Tailwind v4 `@theme inline`, no `tailwind.config.js`). Fonts: Sora (`font-heading`), Work Sans (`font-body`) via `next/font/google`.

## Shell and navigation

- `components/nav-shell.tsx`: sticky header nav at `sm:`+, fixed bottom tab bar below. Wraps `{children}` in the root layout — don't duplicate nav in pages. **Lessons get one tab:** *Corsi* for `canManageClasses` (with a "Presenze" button on `/courses`; the tab stays active on `/attendance`), *Presenze* for students, who can't open `/courses`.
- Role-aware `navItemsFor()`: Home for visitors only; Dashboard + Account for allievi; full set for staff. `canViewRegistry` computed server-side in `app/layout.tsx`. Hiding links is not access control.
- **The landing page links to `/login`, never into the app.**

## Components and assets

- **Dates:** `formatDate()` (`utils/dates.ts`) is the single `YYYY-MM-DD` → dd/mm/yyyy formatter; `formatDayHeading()` builds on it ("lunedì 14/09/2026"). Both format in **UTC**. Never render a raw date column. Only `<input type="date">` values stay ISO.
- `components/icons.tsx` — hand-rolled inline SVG; no icon library.
- **Language switcher** (`components/language-switcher.tsx`, flags in `components/flags.tsx`): flag + two-letter code. SVG flags, **never emoji** (Windows renders "IT"). Each flag on a `ring-1 ring-border` plate. Built on `<details>`/`<summary>` with submit buttons — works without JS; the effect only adds Escape/outside close. Don't replace with a `useState` popover.
- **Belts are drawn, not spelled out** (`components/belt.tsx`) everywhere a rank shows. Artwork `frontend/public/belts/{adults,kids}/<colour>-<n>-stripe.png` (1000×300, transparent), named after the `belt_rank` value with `_`→`-` (no mapping table; `violet-*` was renamed to purple). White lives in `adults/` only. `MAX_STRIPES` (black 7, others 4) lists colours with artwork; `ADULT_ARTWORK`/`KID_ARTWORK` complete but lookup can fail → falls back to words. Bordered tinted plate makes white/black visible. `alt` = colour + stripes. `BELT_LABELS` still needed for chips and `<select>`.
- Logos in `frontend/public/logo/`, belts in `frontend/public/belts/`.
- **Pending feedback** (`components/pending-feedback.tsx`, mounted once in `app/layout.tsx` inside `<Suspense>`): listeners on **`window` in the capture phase**, no per-button state. **Never move them after React**: React calls `preventDefault()` on every server-action submit and every `<Link>` click, so a later listener sees them all as cancelled (the first version showed nothing for that reason). A submit also **locks the screen** at once for input and, after 350 ms, dims it behind a card with a rolled belt turning (`.pending-overlay`); links only run the bar. Forms that handle their own submit opt out with `data-pending-ignore` (live search). A submitted form gets `data-pending` (a second submit is refused) and its submitter `data-pending` + `aria-busy` → `globals.css` draws three belt stripes filling beside the label in `currentColor`, button not pressable. A submit or in-app link also runs the **belt bar** across the top (accent belt, dark rank-bar tip, two stripes; themed tokens). Ends when the URL changes (every action redirects), on `pageshow`, or after 8 s. A cancelled confirm dialog stops the click, so no submit fires. Announces `faixabjj-navigation-start` on `window` — the live search cancels its debounce on it. Reduced motion: static bar, full stripes. New buttons get it for free; don't add per-button spinners.
- `components/coming-soon.tsx` — unused placeholder; replace a route's `ComingSoon` rather than adding a parallel page.

## SEO and home-screen icon

- `utils/site.ts`: `SITE_URL` (`NEXT_PUBLIC_SITE_URL`), public paths. `app/layout.tsx`: `metadataBase` (required), title template, Open Graph, per-theme `themeColor`. `app/robots.ts` + `app/sitemap.ts` publish only public pages.
- Home-screen icon needs all of: `app/icon.png` (favicon), `app/apple-icon.png` (180×180, iOS), `app/manifest.ts` (Android), `appleWebApp` in layout. **Icons baked on `#f4f5f7`, never transparent** (iOS composites onto black). Maskable keeps the belt in the 80% safe zone. All generated from `public/logo/faixabjj_only-removebg-preview.png` with `sharp`; regenerate together.
- Manifest is static and English (fetched without cookies); its colours are the light values.
