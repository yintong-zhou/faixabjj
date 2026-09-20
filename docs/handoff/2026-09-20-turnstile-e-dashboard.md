---
type: handoff
date: 2026-09-20
status: in corso — Turnstile wired, in attesa della prova di login con le chiavi vere
seq: 5
prev: docs/handoff/2026-09-20-cinture-bambini-e-idempotenza.md
tags: [turnstile, captcha, supabase-auth, migrazioni, dashboard, corsi, pwa]
---

# Handoff — Turnstile, regressioni di accesso, ritocchi a dashboard e corsi

## Obiettivo

Chiudere le due regressioni di accesso rimaste aperte dalla sessione
precedente, e mettere una protezione antibot sulle due uniche form che un
visitatore non autenticato può raggiungere. La protezione serve perché il login
è l'unica porta d'ingresso (non esiste registrazione self-serve) e perché il
recupero password è l'unica azione dell'app che manda email, verso un indirizzo
scelto da chi compila il form.

## A che punto siamo

Tutto committato **e pushato**: `origin/main` è a `bd29c27`, working tree
pulito, nessun branch di lavoro aperto. `tsc`, `eslint`, 65 test e build di
produzione puliti all'ultimo giro.

Chiuso in questa sessione:

- **Regressione `current_access()`** — istruttore, maestro e admin non vedevano
  più Corsi né la dashboard della palestra. Migrazione correttiva applicata dal
  utente e verificata.
- **Dashboard staff a zero** — tutte le card a 0 mentre il Registro funzionava.
  Migrazione correttiva scritta e applicata.
- **Registrazione delle migrazioni** in `supabase_migrations.schema_migrations`
  (punto 3 dell'handoff precedente): fatto dall'utente con lo script.
- **Verifica a runtime delle promozioni** (punto 5): scritta come script
  eseguibile e fatta girare su Postgres in Docker, 16 casi, nessun FAIL. **Non
  ancora eseguita sul database vero.**
- **Replay delle migrazioni**: 23 file su 23 da database vuoto, 22 su 22 al
  secondo giro.
- Icona per la schermata home, form "Aggiungi corso" su pagina propria, righe
  del grafico cinture cliccabili, vista personale per lo staff sulla dashboard.

**In attesa di una prova sola**: il login con Turnstile attivo. L'ultimo
tentativo dell'utente falliva, la causa è stata trovata e corretta, ma la
riprova non è stata riportata.

## Cosa abbiamo provato che NON ha funzionato

- **Verificare il token Turnstile nella nostra server action** (`siteverify` in
  `utils/turnstile.ts`, che è la forma canonica della skill `turnstile-spin`).
  Supabase Auth ha la sua CAPTCHA protection attiva e un token Turnstile si
  riscatta **una volta sola**: il nostro controllo lo consumava, Supabase
  riceveva una richiesta senza token e rifiutava con `captcha_failed`, e il
  login riportava come sbagliata una password giusta. Due verifiche dello
  stesso token non possono coesistere. Non rimetterla.
- **Creare il widget Turnstile via API Cloudflare**, come vuole la skill.
  Impossibile qui: manca `CLOUDFLARE_API_TOKEN`, e gli helper della skill
  richiedono `python3` e `jq`, entrambi assenti su questa macchina (`python3` è
  lo stub del Microsoft Store). Il widget è stato creato a mano dal dashboard,
  che la skill prevede esplicitamente.
- **Diagnosticare la regressione della dashboard leggendo il codice.** Le query
  scartavano l'errore e rendevano zeri: una query rotta e una palestra vuota
  erano la stessa schermata. La causa è saltata fuori solo ragionando su quali
  migrazioni ridefiniscono `member_overview`.
- **`perl -0pi -e` su file con terminatori CRLF.** Metà dei file SQL e alcuni
  `.ts` sono CRLF: le sostituzioni multi-riga falliscono **in silenzio**. Usare
  lo strumento di edit, o `\r?\n`.
- **Un `CASE` scritto dentro la condizione di un `IF` in plpgsql.** Il parser
  chiude la condizione al primo `then`, che il `CASE` si porta dentro, e
  l'intero blocco non compila. Calcolare in una variabile prima.

## Problemi incontrati e come li abbiamo risolti

- **Istruttore, maestro e admin senza Corsi né dashboard palestra.**
  `current_access()` è definita in due migrazioni: `20260911120000` la crea con
  tre flag, `20260912010000` la sostituisce con quattro. Ri-incollare a mano la
  prima l'ha riportata a tre, e `canManageClasses` è sparito per tutti, mentre
  il Registro reggeva perché dipende da `canViewRegistry`. **Quell'asimmetria è
  la firma del guasto.** Corretto da `20260920000000_restore_current_access.sql`.
- **Dashboard staff con ogni card a 0, Registro funzionante.** Stesso difetto
  sull'altro oggetto: `member_overview` è definita in tre migrazioni, e la
  versione vecchia non ha `stripe_since`, che la dashboard nomina nella select.
  Il Registro sopravviveva perché elenca con `select("*")`. Corretto da
  `20260920010000_restore_member_overview.sql`.
- **Le query ingoiavano gli errori.** Introdotto `utils/log.ts` con
  `logDbError()` condiviso, usato dalla dashboard staff, dal Registro e dal
  login. Le pagine continuano a degradare a zeri invece di dare 500 — una
  dashboard non vale un errore in faccia — ma il motivo ora finisce nel log.
- **Login rifiutato con password giusta** dopo l'arrivo del widget. Vedi sopra:
  doppia verifica dello stesso token. Diagnosticato con **una sola richiesta**,
  non leggendo codice:
  ```
  POST /auth/v1/token?grant_type=password  con publishable key e indirizzo finto
  → {"error_code":"captcha_failed","msg":"captcha protection: request disallowed"}
  ```
- **Il ri-login necessario dopo la correzione dei permessi.** Non è un secondo
  difetto: il Router Cache di Next.js tiene il payload RSC già reso, quindi la
  nav e la dashboard restano quelle vecchie finché non c'è un caricamento pieno.

## Decisioni prese

- **La verifica del captcha resta a Supabase, non all'app.** Scartato il
  contrario. La nostra proteggeva la nostra form, ma chi attacca fa POST
  diretta su `/auth/v1/token`, dove stanno davvero le credenziali. Si perde il
  legame con `action` e `hostname`, che GoTrue non controlla; resta il costo di
  una challenge risolta per tentativo, che è il punto della challenge.
- **`TURNSTILE_SECRET` e `TURNSTILE_HOSTNAMES` non sono più variabili
  dell'app.** Il secret sta nel dashboard Supabase. Resta solo
  `NEXT_PUBLIC_TURNSTILE_SITEKEY`, pubblico per definizione.
- **`captcha_failed` è l'unico errore di login con messaggio proprio.** Tutto
  il resto resta il generico "credenziali non corrette", che non deve
  distinguere un indirizzo sconosciuto da una password sbagliata. Dire
  "password sbagliata" quando è la challenge a essere stata rifiutata manda a
  resettare una password che funziona.
- **Un reset password rifiutato risponde comunque `?sent=1`**, e il risultato
  della chiamata non viene nemmeno letto: quella pagina non deve diventare un
  oracolo su quali indirizzi hanno un account.
- **`/reset-password` non è protetto**, scelta esplicita: il token di recupero
  nel link è già il gate, e il form è un Client Component con i token nel
  fragment.
- **Una migrazione correttiva nuova, mai una modifica a una già applicata.**
  Entrambe le riparazioni ridichiarano la definizione finale e ordinano per
  ultime, così vincono qualunque sia l'ordine in cui il resto è stato applicato.
- **Il form "Aggiungi corso" ha una pagina propria** (`/courses/new`), come
  "Aggiungi persona". Non viola la regola "una sola lista di persone": un form
  non elenca nessuno. Il form di modifica resta inline su ogni riga, perché è
  già collassato per riga e non spinge via niente.
- **Le righe del grafico cinture portano a `/members?cintura=<c>&attivi=1`.**
  `attivi=1` viaggia con la cintura perché il grafico conta solo gli attivi:
  senza, la lista risponderebbe con un numero diverso da quello della riga.
- **Lo staff può passare alla propria dashboard** con un controllo segmentato
  (`v=mia`), default palestra. **Un allievo non vede il controllo**: non ha
  niente fra cui scegliere, e offrirlo suggerirebbe una vista che non può
  aprire.
- **Le icone della home screen sono fuse sullo sfondo chiaro del brand**, mai
  trasparenti: iOS compone su nero e l'artwork è nero.
- **Il manifest è statico e in inglese.** Viene scaricato senza i cookie di
  sessione in diversi browser, quindi leggere la lingua lì renderebbe dinamica
  una rotta cacheabile per restituire quasi sempre la lingua di default.

## File toccati

Migrazioni e script (tutti applicati al database vero dall'utente):

- `supabase/migrations/20260920000000_restore_current_access.sql` — quattro flag.
- `supabase/migrations/20260920010000_restore_member_overview.sql` — ricrea
  `person_hours` e `member_overview` nella forma finale.
- `supabase/scripts/register-applied-migrations.sql` — registra le 23 versioni.
- `supabase/scripts/diagnose-access.sql` — sola lettura, distingue i guasti che
  finiscono tutti con uno staff che vede la vista allievo.
- `supabase/scripts/verify-promotions.sql` — impersona account reali, esegue i
  sette rifiuti e i due casi accettati, stampa una tabella e fa `rollback`.

Frontend:

- `frontend/utils/turnstile.ts` — ora solo sitekey e lettura del token.
- `frontend/components/turnstile.tsx` — il widget, rendering implicito.
- `frontend/app/login/actions.ts`, `frontend/app/forgot-password/actions.ts` —
  `captchaToken` passato a Supabase; log dell'errore di login.
- `frontend/app/login/page.tsx`, `frontend/app/forgot-password/page.tsx` — widget.
- `frontend/utils/log.ts` — `logDbError()` condiviso.
- `frontend/app/dashboard/page.tsx` — controllo segmentato palestra/mia.
- `frontend/app/dashboard/staff-dashboard.tsx` — righe cinture cliccabili, log.
- `frontend/app/members/page.tsx` — log delle tre query di idoneità.
- `frontend/app/courses/new/page.tsx`, `frontend/app/courses/course-fields.tsx`,
  `frontend/app/courses/page.tsx` — form su pagina propria.
- `frontend/app/manifest.ts`, `frontend/app/apple-icon.png`,
  `frontend/public/icons/*` — icona per la schermata home.
- `frontend/utils/i18n/dictionaries/*` — `captchaFailed`, `viewGym`, `viewMine`.
- `frontend/.env.example`, `CLAUDE.md` — documentazione.

## Dove vogliamo andare

1. **Pulire i branch e la radice del repo.**
   - Cancellare `feat/presenze` e `feat/promotion-system`: entrambi già
     mergiati in `main` e senza controparte remota (`git branch --merged main`
     li conferma).
   - Togliere `turnstile.md` dalla radice. È il testo della skill Cloudflare,
     committato per errore insieme all'integrazione in `016325c`; quello che
     serviva al progetto è ora nella sezione "Bot protection" di `CLAUDE.md`.
   - Già che si è lì: `frontend/public/` contiene ancora `file.svg`,
     `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` dallo scaffold di
     `create-next-app`, che nessuna pagina referenzia.
2. **Chiudere Turnstile con una prova vera.** Verificare che il secret
   configurato in Supabase sia quello del sitekey
   `0x4AAAAAAE99mPuro2-l0_cB`, riprovare il login, e togliere
   `TURNSTILE_SECRET` e `TURNSTILE_HOSTNAMES` da `.env.local` e da Vercel, dove
   non servono più.
3. **Eseguire `supabase/scripts/verify-promotions.sql` sul database vero.**
   Gira in transazione e fa `rollback`, ma non è mai stato lanciato lì.
4. **Sistemare `README.md`**, che dichiara ancora "React + Vite + Tailwind"
   mentre lo stack è Next.js.

## Da sapere prima di toccare qualcosa

- **Diversi oggetti sono definiti in più migrazioni**, e vince solo l'ultima
  eseguita: `current_access()`, `member_overview`, `person_hours`. Idempotente
  non vuol dire indipendente dall'ordine. Un campo nuovo va in una migrazione
  **nuova**; riapplicare a mano vuol dire riapplicare **tutta** la storia in
  ordine di nome.
- **Metà dei file SQL e alcuni `.ts` sono CRLF.** Le patch `perl` con `\n`
  falliscono in silenzio.
- **L'MCP Supabase di sessione punta al progetto sbagliato.** Il progetto è
  `poksgledkecwviypspmi`; l'MCP espone `szxiviyiavzdkaxasvic`. Ogni verifica sul
  database passa da query consegnate all'utente, o dall'endpoint REST con la
  publishable key letta da `.env.local`.
- **`python3` e `jq` non ci sono** su questa macchina, e `python3` risponde con
  lo stub del Microsoft Store. Per lo stesso motivo gli script della skill
  Turnstile non sono eseguibili qui.
- **Docker Desktop va avviato a mano**
  (`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`), poi
  risponde in una ventina di secondi. Lo stub Supabase per il replay ha bisogno
  anche di `grant all on all tables in schema public to authenticated`, o le
  prove RLS falliscono per il motivo sbagliato.
- **Un cambio di permessi si vede solo a caricamento pieno**, non al click
  successivo: Router Cache di Next.js.
- **Le cinture bambini nell'enum si scrivono `gray_*`**, non `grey_*`. "Grey"
  esiste solo nella prosa dei documenti.
- **Non rimettere `siteverify` nella server action**: vedi la prima voce di
  "cosa NON ha funzionato".
