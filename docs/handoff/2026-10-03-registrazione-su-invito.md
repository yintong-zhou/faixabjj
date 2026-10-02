---
type: handoff
date: 2026-10-03
status: pronto per review (codice completo, non ancora in main né in produzione)
seq: 1
prev: nessuno
tags: [join, invito, registrazione, approvazione, turnstile, supabase]
---

# Registrazione su invito della palestra

## Obiettivo

Gestore (`admin`) e maestro (`head_coach`) condividono un link di invito per palestra; chi lo apre si iscrive a quella palestra (email, username, password, nome, nascita, data iscrizione, esperienza → cintura/tacca/date). L'account non vede nulla finché lo staff non approva, correggendo i dati se serve. Serve a togliere al maestro l'inserimento a mano di ogni allievo senza aprire un signup libero.

Spec: `docs/superpowers/specs/2026-10-02-gym-invite-registration-design.md`. Piano: `docs/superpowers/plans/2026-10-02-gym-invite-registration.md`.

## A che punto siamo

- Branch `feat/gym-invite-registration` (14 commit da `main` @ 3274f33, ultimo `bed2645`), working tree pulito.
- **Fatto e revisionato** (7 task, revisione per task + revisione finale opus, tutto corretto):
  - `parseRegistration()` puro + 11 test Vitest (162/162 totali).
  - Migrazione `20261002000000_gym_invite_registration.sql` + test isolamento T22 (replay Docker verde).
  - Stato "in attesa": proxy + `requireAdmin` → `/pending` con "Verifica di nuovo".
  - Link su `/gym` (genera / rigenera / copia).
  - Form pubblico `/join/<token>` con Turnstile verificato sul server e controllo username live.
  - `/members/requests` (approva con correzione / rifiuta) + chip nel Registro + `deleteGym` cancella gli account pending.
  - Privacy (3 lingue), CLAUDE.md, `docs/claude/*`, memoria `faixabjj-account-creation-policy` aggiornati.
- **Non fatto:**
  - migrazione **non applicata** a `poksgledkecwviypspmi`;
  - `TURNSTILE_SECRET_KEY` **non impostata** (né `.env.local` né Vercel);
  - **nessun controllo a mano** sull'app avviata;
  - branch non mergiato né pushato: l'utente deve scegliere merge locale / PR / lasciare.

## Cosa abbiamo provato che NON ha funzionato

- **Token di invito come colonna su `gym`**: scartato, ogni membro legge la propria riga `gym`, un allievo vedrebbe il link → tabella `gym_invite` leggibile solo da `can_manage_users()`.
- **Riservare lo username solo all'approvazione** (per non rivelare se esiste): scartato su richiesta dell'utente, che vuole controllo live e login con username già da pending → username unico su `person` + `registration_request` (trigger `username_cross_unique`), trade-off accettato.
- **Login automatico dopo l'iscrizione**: impossibile, il token Turnstile è già consumato dalla verifica del form e il login richiede un token verificato da Supabase → redirect a `/login?registered=1`.
- **Usare `signUp()` di Supabase** (così Supabase verificherebbe Turnstile): scartato, richiede il signup pubblico attivo e scavalcherebbe l'invito.
- **Ordine "crea account, poi inserisci richiesta" senza pre-check username**: rivelava se un'email esiste (username preso + email nuova → "username in uso"; email esistente → generico) → ora `username_available()` prima di `createUser`.
- **Decidere "scheda collegata" prima del trigger** (`linkedPersonFor` pre-approvazione): una seconda approvazione sovrascriveva grado di un membro esistente o lo cancellava nell'undo → ora rifiuto se l'account ha già `gym_id`, e collegata = `person.created_at < request.created_at` letto dopo il trigger.
- **Messaggi distinti `passwordWeak` / `emailTaken`**: potenziali oracoli sull'esistenza di un'email → rimossi, risposta generica.

## Problemi incontrati e come li abbiamo risolti

- **Docker Desktop spento** → `replay.sh` fallisce con "dockerDesktopLinuxEngine not found". Avviarlo (`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`) e attendere `docker info`.
- **Id utenti di test T22 (`…e1/e2/e3`) collidevano** con un test esistente più avanti nel file → rinominati `…d4/d5/d6` (email rimaste `e1..e3@pending`, solo estetico).
- **Undo dell'approvazione su scheda collegata falliva** per `username_cross_unique` (23505) → l'undo ripristina lo username precedente nello stesso update che toglie `auth_user_id`.
- **`.superpowers/` non era ignorata** → aggiunta in `.git/info/exclude` (locale, non committato).

## Decisioni prese

- Link: **uno per palestra, riutilizzabile, rigenerabile** (scartati link multipli/scadenza e link monouso).
- Prima dell'approvazione l'atleta **può accedere** e vede solo `/pending` (scartato: account bloccato con errore generico).
- **Nessuna conferma email** (coerente con "nessuna email inviata"); il controllo è l'approvazione. Rischio di presa di una scheda revocata tramite email altrui → avviso in approvazione "indirizzo non verificato, conferma di persona".
- Nome e data di nascita **obbligatori**; "Hai già praticato?" No → bianca 0, date = iscrizione; Sì → cintura, tacca, date facoltative (cintura → iscrizione, ultima tacca → data cintura).
- Approvazione/rifiuto **solo `head_coach`/`admin`** (`requireUserManager`), istruttore escluso; ruolo assegnato sempre `student`.
- Approva/rifiuta in `app/members/requests/actions.ts` (non nel già enorme `app/members/actions.ts`).
- Cinture nel form **non filtrate per età** (il server rifiuta con messaggio chiaro).
- Caso limite accettato: due maestri che approvano nello stesso istante + errore successivo possono lasciare un account pending senza richiesta.
- La palestra va **sospesa prima di eliminarla** (già garantito da `deleteGym`; sospesa → link 404, nessuno approva).

## File toccati

- `frontend/utils/registration.ts`, `registration.test.ts` — validazione unica signup/approvazione.
- `supabase/migrations/20261002000000_gym_invite_registration.sql` — `gym_invite`, `registration_request`, trigger username, `regenerate_invite_token()`, `gym_for_invite()`, `username_available()`, `login_email_for_username()` ridefinita.
- `supabase/tests/tenant-isolation.sql` — T22.
- `frontend/utils/supabase/proxy.ts` — redirect pending, `/pending` protetta, `/join` solo visitatori.
- `frontend/utils/supabase/require-admin.ts` — `pendingApproval`, `PENDING_PATH`.
- `frontend/app/pending/page.tsx`, `actions.ts` — pagina attesa + refresh sessione.
- `frontend/app/gym/page.tsx`, `actions.ts` — sezione link, `regenerateInvite`.
- `frontend/utils/turnstile-verify.ts`, `frontend/utils/supabase/invite.ts` — siteverify (timeout 5s), lookup token.
- `frontend/app/join/actions.ts`, `join/[token]/page.tsx`, `join/[token]/join-form.tsx` — form pubblico.
- `frontend/app/login/page.tsx` — avviso `registered=1`.
- `frontend/app/members/requests/{page,actions,linked-person}.ts(x)`, `frontend/app/members/page.tsx` — approvazioni + chip.
- `frontend/app/gyms/actions.ts` — `deleteGym` cancella anche account pending.
- `frontend/utils/i18n/dictionaries/{it,en,pt-BR}.ts` — sezioni `pending`, `join`, `requests`, chiavi `myGym.invite*`, `auth.registeredNotice`, paragrafo privacy.
- `frontend/app/privacy/page.tsx` — data aggiornamento.
- `CLAUDE.md`, `docs/claude/{auth-and-access,database,gyms,members-and-promotions}.md` — regola "nessun signup aperto" → "solo su invito con approvazione".

## Dove vogliamo andare

1. Chiedi all'utente se fare merge locale in `main`, push + PR, o lasciare il branch (era la domanda aperta).
2. L'utente applica a mano la migrazione `20261002000000_gym_invite_registration.sql` su `poksgledkecwviypspmi` (**prima** del deploy: `/gym`, `/join`, `/members` e il login con username la chiamano).
3. L'utente imposta `TURNSTILE_SECRET_KEY` (secret dello **stesso** widget di `NEXT_PUBLIC_TURNSTILE_SITEKEY`, da Cloudflare → Turnstile → widget → Settings) in `frontend/.env.local` e su Vercel (Production + Preview).
4. Esegui i controlli a mano con la launch config `frontend`:
   - **link:** genera, copia, rigenera (vecchio link 404); palestra sospesa → 404; loggato su `/join` → `/dashboard`;
   - **iscrizione:** con e senza esperienza; quindicenne con blu rifiutato; username libero/preso/non valido/maiuscole; email già usata → errore generico; link rigenerato a form aperto → nessun account creato; dopo un errore il reinvio funziona (Turnstile resettato);
   - **pending:** login con username ed email; tutte le pagine → `/pending`; `/privacy` e logout ok;
   - **approvazione:** con correzione (cintura, data, email); "Verifica di nuovo" → dashboard; seconda approvazione → "non più in attesa";
   - **scheda collegata:** revoca un membro, iscriviti con la sua email → avviso; dopo l'approvazione la scheda conserva cintura e storico;
   - **rifiuto:** account cancellato; "Verifica di nuovo" → logout; la stessa email può reiscriversi;
   - **accessi:** istruttore → nessun chip, `/members/requests` 404;
   - **palestra eliminata** (sospesa prima) con richieste pending → account cancellati;
   - **grafica:** tema chiaro/scuro e 3 lingue.

## Da sapere prima di toccare qualcosa

- **Mai applicare migrazioni via MCP Supabase**: solo a mano su `poksgledkecwviypspmi`.
- `replay.sh --isolation` richiede Docker Desktop avviato; va lanciato dalla root del repo con bash.
- Per Turnstile **solo `/join` verifica nel server action**; login e recupero non devono mai verificare (il token si consuma una volta sola, Supabase lo verifica lui).
- `username_available()` **deve** restare prima di `createUser` in `register` (anti-enumerazione email). Non riordinare.
- `login_email_for_username()` ora è definita in due migrazioni (`20260930010000`, `20261002000000`): ri-incollare la prima rompe il login con username degli account pending.
- La regola in CLAUDE.md ora è "nessun signup aperto; solo invito + approvazione": non allargare senza chiedere.
- Alcuni commit hanno trailer `Claude Sonnet 5.5` (scritti da subagent Sonnet): voluto, non correggere.
