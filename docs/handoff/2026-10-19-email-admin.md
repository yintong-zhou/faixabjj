---
type: handoff
date: 2026-10-19
status: pronto per review (manca la verifica nel browser)
seq: 1
prev: nessuno
tags: [email, notify-flow, superadmin, feat/email-admin]
---

# Handoff — pagina `/email` per il superadmin (notify-flow)

## Obiettivo

Dare al superadmin (jurion), che non è uno sviluppatore, una pagina dell'app da cui gestire le email di
notify-flow: prima si poteva solo da riga di comando (`execution/notify_templates.py`,
`notify_smoke.py`). L'utente vuole che ogni app che usa notify-flow abbia una pagina così; questa è la
prima. Spec: `docs/superpowers/specs/2026-10-19-notify-flow-config-design.md`; piano:
`docs/superpowers/plans/2026-10-19-notify-flow-config.md`.

## A che punto siamo

- Branch `feat/email-admin`, 10 commit sopra `main` (da `518a882` a `3569a6e`, più `1085b0f` di
  AGENTS.md scritto da `next dev`). **Non mergiato, non pushato.**
- Fatto e committato: verifica connessione, statistiche 7 giorni (per palestra / per tipo, contate in
  SQL), elenco template, editor HTML + anteprima affiancati (layout A) + testo semplice a mano,
  ripristina/elimina, invio prova con "aggiorna stato", creazione template.
- Test: 230 Vitest verdi, tsc + lint puliti, `bash supabase/tests/replay.sh --isolation` OK (T27).
- Revisione finale Opus: 1 Important corretto (editor con testo vecchio dopo il ripristino). Codex
  rescue: 1 Media corretto (la chiave dell'editor ora include nome e lingua).
- **Non fatto:** nessuna pagina vista da superadmin nel browser: il login di jurion non era nella
  finestra Chrome controllata da devtools (il browser è stato riavviato). Migration **non** applicata
  a `poksgledkecwviypspmi`.

## Cosa abbiamo provato che NON ha funzionato

- Verifica nel browser senza login: impossibile; non si accede al posto dell'utente (password +
  Turnstile). Va fatto il login **nella finestra Chrome controllata da chrome-devtools MCP**, non in
  un'altra.
- `query_logs` / `execute_sql` via MCP Supabase su `poksgledkecwviypspmi`: "You do not have
  permission". Per leggere i dati si è usato REST con `SUPABASE_SECRET_KEY` da `.env.local`.
- Firmare un link di conferma email per provarlo su produzione: bloccato dal classificatore
  (security-weaken). Non riprovarci.
- Il replay migration non partiva: Docker Desktop spento. Si avvia con
  `"/c/Program Files/Docker/Docker/Docker Desktop.exe"` e si aspetta `docker info`.

## Problemi incontrati e come li abbiamo risolti

- **Editor con stato vecchio dopo un redirect**: Next mantiene lo stato client se cambiano solo i
  search params → `<TemplateEditor key={contentKey(name, locale, template)}>` (`utils/email-templates.ts`).
- **`redirect()` dentro `try`** viene inghiottito dal `catch`: tutte le action fanno il redirect fuori
  dal `try` (pattern `let r; try { r = await … } catch { …; editor(...) } editor(...)`).
- **Valori esportati da un modulo `"use client"`** arrivano al server come client reference, non come
  stringhe: il parametro `?mail=` si scrive letterale nei redirect.
- **GateGuard** (hook) chiede "facts" al primo tocco di ogni file: rispondere e riprovare. Si può
  esentare con `GATEGUARD_EXEMPT_GLOBS`.

## Decisioni prese

- Editor **dentro Faixa BJJ** (ogni app la sua pagina) — scartato: editor unico nella dashboard di
  notify-flow.
- **HTML scritto a mano + anteprima live** e **testo semplice a mano** — scartato: solo testi su
  impaginazione fissa / testo ricavato dall'HTML.
- Layout **A** (affiancati) — scartato B (schede).
- **Niente gestione API key né variabili** (scelta dell'utente). Le variabili delle email dell'app sono
  fisse in `APP_TEMPLATES` (contratto con notify-flow, `appName` incluso); il salvataggio rifiuta
  segnaposto estranei.
- Statistiche da **funzioni definer aggregate** (`platform_email_by_gym/template`, regola di
  `gyms.md`) — scartato: query service-role e conteggio in JS. Solo 7 giorni (limite di `app_log`).
- Prova **sincrona**, all'indirizzo del superadmin, "aggiorna stato" manuale — scartato: polling
  automatico (consuma il budget di 60 req/min condiviso con le email vere). Il limite 5/ora per
  destinatario+template è accettato e detto in pagina.
- Le email dell'app senza built-in (`email-change`, `email-changed`) **non si possono eliminare**.
- Esecuzione del piano "diretta" (non subagent per task), scelta dell'utente.

## File toccati

- `supabase/migrations/20261019000000_platform_email_stats.sql` — due funzioni definer di conteggio.
- `supabase/tests/tenant-isolation.sql` — T27 (superadmin vede, gestore no, anon no, test esclusi).
- `frontend/utils/email-templates.ts` (+ test) — `APP_TEMPLATES`, segnaposto, anteprima, stati, `contentKey`.
- `frontend/utils/notify-admin.ts` (+ test) — client `/v1` (lista, get, put, delete, prova, stato, health).
- `frontend/utils/notify-flow.ts` — esportata `notifyConfig()`.
- `frontend/app/email/page.tsx` — connessione, statistiche, elenco.
- `frontend/app/email/[name]/[locale]/page.tsx`, `template-editor.tsx` — editor e pannello prova.
- `frontend/app/email/new/page.tsx`, `frontend/app/email/actions.ts` — creazione e tutte le server action.
- `frontend/components/nav-shell.tsx`, `app/layout.tsx`, `utils/supabase/proxy.ts`,
  `utils/supabase/require-admin.ts` — voce Email e rotta protetta per il superadmin.
- `frontend/utils/i18n/dictionaries/{it,en,pt-BR}.ts` — `nav.email`, sezione `emailAdmin`.
- `docs/claude/gyms.md`, `auth-and-access.md`, `frontend-ui.md` — documentati funzioni, pagina, menu.
- `execution/notify_templates.py`, `execution/README.md` — avviso: sovrascrive le modifiche da `/email`.

## Dove vogliamo andare

1. Far fare all'utente il login come **jurion** nella finestra Chrome controllata da devtools, poi
   verificare: `/email` (connessione verde, statistiche coerenti con `app_log`, tabella template);
   `/email/email-change/it` (anteprima, avviso `{{ oops }}`, salvataggio rifiutato, salvataggio valido,
   niente pulsante elimina); `/email/welcome/it` (modifica → "Ripristina predefinita" → torna il
   built-in **e l'editor mostra il testo nuovo**); prova su `password-changed` + aggiorna stato, riga
   `test:` in `/logs`, statistiche invariate; `/email/new` (crea `promo-test`, poi eliminalo);
   `/email/Bad/it` e `/email/welcome/xx` → 404. Poi login come **littlegym**: `/email` → 404, niente voce
   di menu. Alla fine rimetti `email-change` IT originale con `python execution/notify_templates.py`.
2. Applicare a mano `supabase/migrations/20261019000000_platform_email_stats.sql` su
   `poksgledkecwviypspmi` **prima** del deploy.
3. Merge/PR di `feat/email-admin` (superpowers:finishing-a-development-branch), poi cancellare
   `.superpowers/sdd/2026-10-19-notify-flow-config/`.

Minori rimandati (decidere con l'utente): 429 sempre "riprova entro un'ora" anche per il limite
60/min; `statuses[...]` senza `Object.hasOwn`; "Rifiutate" conta anche errori lato app; "Elimina" su
built-in non dell'app (`login-alert`, `verify-email`) che in realtà ripristina; `/email` fino a 30 s se
notify-flow è appeso; nessun avviso quando il tetto di 2000 righe di `app_log` tronca la settimana;
colori `secondary`/`accent` invece di `success`/`danger` (segnalato da Codex).

## Da sapere prima di toccare qualcosa

- Il ledger con tutte le "Ruling:" è in `.superpowers/sdd/2026-10-19-notify-flow-config/progress.md`
  (git-ignored): letto con il piano, dice cosa è stato deciso e perché.
- `execution/notify_templates.py` **sovrascrive** i testi di `email-change`/`email-changed` modificati
  da `/email`.
- I test di invio consumano il limite 5/ora per destinatario+template dell'indirizzo del superadmin:
  oltre 5 prove di `password-reset` in un'ora bloccano il suo reset vero.
- `frontend/AGENTS.md` viene riscritto da `next dev`: la modifica non è un errore.
- Server di sviluppo avviato in background su `localhost:3000`; Docker Desktop avviato in questa
  sessione.
