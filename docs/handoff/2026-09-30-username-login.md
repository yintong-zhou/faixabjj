---
type: handoff
date: 2026-09-30
status: pronto per review
seq: 1
prev: nessuno
tags: [auth, login, username, supabase, migrations, feat/generic]
---

## Obiettivo

Permettere il login con **email o username**. È una comodità: l'email resta obbligatoria per tutti. Lo username è unico su tutta la piattaforma, lo propone il maestro alla creazione, precompilato dal nome, e la persona lo può cambiare da `/account`. Deve restare anti-enumerazione: uno username sconosciuto dà lo stesso errore di una password sbagliata.

## A che punto siamo

- Tutto implementato e committato su `feat/generic`: da `d6581da` a `d42b73d`. Il working tree è pulito. Niente push e niente merge: l'utente ha scelto "lascia così".
- Sul DB live (`poksgledkecwviypspmi`) l'utente ha applicato **entrambe** le migrazioni, `20260930000000` e `20260930010000`. L'ho verificato in sola lettura:
  - la colonna `username` è popolata;
  - la RPC `login_email_for_username` risponde con la chiave di servizio e rifiuta anon con `42501`.
- Verifiche fatte:
  - replay Docker ×2 più isolamento (T20, T21) OK;
  - Vitest 125/125;
  - tsc, lint e build puliti.
- Non ancora verificato nell'app dall'utente: un login reale con username, dopo l'ultima migrazione.
- Aperto: il P2 dell'ultima `/codex:review`, vedi "Dove vogliamo andare".
- Questo branch contiene anche lavoro precedente, già committato e mai mergiato su `main`:
  - "Riattiva accesso" al posto dell'invito via email;
  - ricerca nel Registro senza accenti (migrazione `20260929000000`);
  - blocco schermo con la cintura durante le azioni;
  - ricerca live nel Registro.

## Cosa abbiamo provato che NON ha funzionato

- **Ricerca username in due chiamate** (`person`, poi `auth.admin.getUserById`): il tempo di risposta rivelava se lo username esiste, prima di Turnstile. Sostituita dalla RPC unica `login_email_for_username`.
- **Indirizzo fittizio fisso** `nobody@faixabjj.invalid` per gli username sconosciuti: se qualcuno registrasse quell'indirizzo, tutti gli username sconosciuti entrerebbero nel suo account (segnalazione di Codex). Ora `unknownAccountEmail()` genera un `nobody-<uuid>@faixabjj.invalid` nuovo a ogni tentativo.
- **Funzione aggiunta dentro `20260930000000` dopo che l'utente l'aveva già applicata**: il live non l'aveva, e ogni login con username andava in errore con `PGRST202`. Spostata in `20260930010000`.

## Problemi incontrati e come li abbiamo risolti

- **Il login con username va in errore**
  - Sintomo: "credenziali errate" anche con i dati giusti.
  - Causa: la RPC mancava sul DB live (`PGRST202`).
  - Correzione: migrazione `20260930010000`, applicata a mano.
  - Diagnosi: script Node in sola lettura con la chiave da `frontend/.env.local`. Va copiato dentro `frontend/` per risolvere `@supabase/supabase-js`, e poi cancellato.
- **`$$` diventa `$`** quando si inserisce SQL con `String.prototype.replace` in Node: la stringa di sostituzione interpreta `$$`. Usare il tool Edit, oppure `replace(a, () => b)`.
- **Line ending**: i dizionari e alcuni file sono in LF, altri in CRLF. Negli script: `split(/\r?\n/)` e preservare l'EOL che c'era.
- **Docker Desktop spento**: il replay fallisce. Avviarlo con `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"` e aspettare `docker info`.

## Decisioni prese

- **Username su `person`, risolto nel server con il ruolo di servizio.** Scartate:
  - una RPC pubblica, che esporrebbe l'email;
  - un'email finta in Auth, perché Supabase non ha alias.
- **Unico su tutta la piattaforma**: al login la palestra non è nota. Scartata l'unicità per palestra.
- **Obbligatorio per i nuovi account**, e generato dalla migrazione per gli esistenti. Scartati "facoltativo" e "precompilato ma svuotabile".
- **Collisione alla creazione**: suffisso automatico `x2`, `x3`… (al massimo 50 tentativi), senza errore. Scartato l'errore al maestro, perché con l'unicità globale le collisioni sono frequenti.
- **Account creati fuori dall'app** (Dashboard) restano senza username. Su `/account` il campo è obbligatorio solo quando lo username esiste già. Scartata l'assegnazione nel trigger (YAGNI).
- **Password recovery solo via email**; superadmin senza username; lo staff non modifica lo username dopo la creazione.
- **Rimandati (minori)**:
  - SQL `unaccent` e `foldForSearch` differiscono su lettere rare (ħ, NBSP);
  - senza chiave di servizio, ogni tentativo di login con username scrive una riga di log;
  - uno username occupato digitato dal maestro diventa `x2` in silenzio, e lo si vede solo nell'avviso.

## File toccati

- `supabase/migrations/20260930000000_person_username.sql`: colonna, check, indice unico, riempimento, `guard_person_auth_link()` con `username` nella allowlist.
- `supabase/migrations/20260930010000_login_username_lookup.sql`: RPC `login_email_for_username`, eseguibile solo da `service_role`.
- `supabase/tests/tenant-isolation.sql`: T20 (unicità tra palestre, formato, solo la propria riga) e T21 (RPC negata ad anon e agli utenti autenticati).
- `frontend/utils/username.ts` e `.test.ts`: `normalizeUsername`, `isValidUsername`, `suggestUsername`, `withSuffix`.
- `frontend/utils/login-identifier.ts` e `.test.ts`: `parseLoginIdentifier`, `unknownAccountEmail`.
- `frontend/utils/supabase/login-identifier.ts`: `emailForUsername()` con una sola RPC.
- `frontend/utils/supabase/username.ts`: `claimUsername()`, che prova il primo libero con il ruolo di servizio.
- `frontend/app/login/{actions,page}.tsx`: campo "Email o username" e risoluzione dell'identificativo.
- `frontend/app/members/actions.ts`: username in `addPerson`, `restoreAccess`, `setTemporaryPassword`, e `personInMyGym` seleziona `username`.
- `frontend/app/gyms/actions.ts` e `app/gyms/[id]/page.tsx`: username per i responsabili di palestra.
- `frontend/components/name-username-fields.tsx`: nome e username precompilato.
- `frontend/components/temporary-password-notice.tsx` e `utils/temporary-password-flash.ts`: l'avviso mostra lo username.
- `frontend/app/account/{actions,page}.tsx`: cambio username; 23505 → "già in uso", 23514 → "formato".
- `frontend/app/members/[id]/page.tsx` e `utils/supabase/profile.ts`: username in sola lettura nella scheda.
- `frontend/utils/i18n/dictionaries/{it,en,pt-BR}.ts`: nuove chiavi `auth.emailOrUsername`, `account.username*`, `registro.temporaryUsernameIs`, `msg.username*`.
- `docs/claude/{auth-and-access,members-and-promotions,database}.md`, e la spec e il piano in `docs/superpowers/`.

## Dove vogliamo andare

1. **Decidete sul P2 dell'ultima Codex review**: "ripristina la funzione in `20260930000000`, perché era già applicata". Secondo me è un falso positivo. La versione applicata sul live **non** conteneva la funzione, ed è proprio per questo che il login falliva. Toglierla fa corrispondere il file a ciò che è stato applicato, e `20260930010000` la crea. Se l'utente è d'accordo, chiudetelo senza modifiche; altrimenti rimettete la definizione, che è idempotente con `create or replace`, in entrambi i file.
2. **Fate provare all'utente un login reale con username** su `/login`, per esempio `francesca.ho`, oppure il suo username da `/account`.
3. **Chiedete all'utente se fare merge o PR** di `feat/generic` su `main`, ricordando che le migrazioni `20260928000000`, `20260929000000`, `20260930000000` e `20260930010000` vanno applicate **prima** del deploy.

## Da sapere prima di toccare qualcosa

- Le migrazioni si applicano **solo a mano** su `poksgledkecwviypspmi`, mai via MCP. Devono potersi eseguire due volte senza danni. Verificarle con `bash supabase/tests/replay.sh --isolation` dalla root, con Docker acceso.
- Il dev server dell'utente è già attivo su `localhost:3000` e punta al **DB live**: le funzioni che richiedono una migrazione non applicata vanno in errore in locale.
- Committare solo se l'utente lo chiede. L'utente spesso committa da solo.
- La modalità ADHD è attiva: rispondere con l'azione per prima, a passi numerati, e con un solo passo successivo alla fine.
- Il P2 di Codex del 2026-09-28, la race tra eliminazione e invito, è chiuso: l'invito via email non esiste più.
