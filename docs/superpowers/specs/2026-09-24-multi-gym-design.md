---
type: spec
date: 2026-09-24
status: in revisione — da approvare prima del piano di implementazione
tags: [multi-tenant, palestre, superadmin, rls, impostazioni, gdpr]
---

# Gestione multi-palestra — design

## Obiettivo

Faixa BJJ (il nome del **prodotto**) diventa un SaaS che ospita più palestre
**isolate**: nessun dato è condiviso tra palestre. Un **superadmin di
piattaforma**, esterno a ogni palestra, fa il CRUD completo delle palestre e ne
crea i gestori. Dentro ogni palestra tutto funziona come oggi: gestore (ruolo
`admin` di palestra), head_coach, instructor, assistant e student gestiscono
maestri, istruttori e allievi con le pagine esistenti.

## Decisioni prese

| # | Decisione | Alternativa scartata |
| - | --------- | -------------------- |
| 1 | Palestre isolate (SaaS), nessun dato condiviso | Rete/affiliazione con persone e storico condivisi tra sedi |
| 2 | Superadmin di piattaforma + gestore per palestra (ruolo `admin` esistente) | Solo il superadmin gestisce le persone; login unico "di palestra" |
| 3 | Un account = una palestra | Account in più palestre con selettore di palestra attiva |
| 4 | Per palestra: requisiti di promozione, data di avvio tracciamento, fuso orario, durata lezione, lezioni/settimana | Costanti globali |
| 5 | Il superadmin vede solo la palestra, i conteggi aggregati e i gestori | Accesso completo; "entra come gestore" con audit |
| 6 | Sospendi (reversibile) + elimina definitiva solo da sospesa, con conferma del nome | Solo sospensione; eliminazione diretta |
| 7 | Isolamento con `gym_id` su ogni tabella + RLS su `current_gym_id()` | `gym_id` nel JWT; schema/progetto per palestra |
| 8 | Superadmin e gestori non hanno cintura | — |

Nomi e account iniziali:
- Prima palestra: **ASD Little Gym**. Riceve tutti i dati esistenti.
- Superadmin: **admin@bjj.com**. Oggi è admin di palestra: esce dalla palestra e diventa superadmin.
- Gestore di ASD Little Gym: **littlegym@bjj.com**, creato dall'interfaccia `/gyms/[id]` dopo il deploy.

Fuori scope: fatturazione e piani, registrazione self-service delle palestre,
dominio o brand per palestra, "entra come gestore", persone condivise tra
palestre.

## 1. Dati e isolamento

### Tabelle nuove

- `gym`
  - `id uuid pk`, `name text not null unique`
  - `status` enum `gym_status` (`active` | `suspended`, default `active`)
  - `timezone text not null default 'Europe/Rome'`
  - `tracking_started_on date not null`
  - `session_length_hours numeric not null default 1 check (> 0)`
  - `lessons_per_week numeric not null default 3 check (> 0)`
  - `created_at timestamptz default now()`
- `platform_admin(auth_user_id uuid pk references auth.users on delete cascade, created_at)`. Il superadmin non ha una riga `person`, quindi niente cintura per costruzione.

### `gym_id` sulle tabelle esistenti

`gym_id uuid not null references gym on delete cascade`, con indice, su:
`person`, `assigned_role`, `course`, `class_session`, `attendance`,
`promotion`, `promotion_criteria`, `role_threshold`.

- `promotion_criteria`: la chiave diventa `(gym_id, belt, stripe)`.
- Una palestra nuova riceve una **copia** dei requisiti di default, poi modificabile da `/members/criteria`.

### Funzioni

- `current_gym_id()`
  - `stable`, `security definer`, `search_path` fisso.
  - Legge la palestra dalla riga `person` di `auth.uid()`.
  - Restituisce null per il superadmin, per chi non ha profilo e **se la palestra è sospesa**.
  - La sospensione rende invisibili i dati e nega le scritture da un punto solo.
- `is_platform_admin()`: esistenza della riga in `platform_admin`.
- `current_gym_status()`: stato della palestra dell'utente anche se sospesa, per il redirect a `/suspended`.
- `gym_timezone(gym_id)` sostituisce `gym_timezone()` e legge `gym.timezone`. Usata da `session_checkin_open`, `session_overview` e `record_promotion`.

### RLS

- Ogni policy esistente diventa "predicato attuale **and** `gym_id = current_gym_id()`". Con `current_gym_id()` null non passa niente.
- `gym`
  - Select/insert/update/delete per `is_platform_admin()`.
  - Select della propria riga per i membri, tramite `id = current_gym_id()`. Serve per nome e impostazioni.
- `platform_admin`: nessuna policy di scrittura; select solo della propria riga.
- `gym_overview()`
  - **Funzione** `security definer`, non vista, che restituisce `id`, `name`, `status`, `created_at`, numero di persone attive, di corsi e di gestori.
  - Se `is_platform_admin()` è falso non restituisce righe.
  - È una funzione perché il superadmin non ha select su `person`: una vista `security_invoker` conterebbe zero, e una vista definer violerebbe la regola "ogni vista è invoker".
  - Restituisce **solo aggregati**, mai righe di persone.

### Trigger di coerenza

- `gym_id` è compilato automaticamente all'inserimento con `current_gym_id()` quando non è fornito, e poi congelato: un update che lo cambia viene rifiutato.
- Righe figlie nella stessa palestra della madre:
  - `assigned_role.person_id`
  - `class_session.course_id`
  - `attendance.person_id` e `session_id`
  - `promotion.person_id`
  - `course.instructor_id`, `class_session.instructor_id`

  L'RLS controlla il `gym_id` della riga nuova, non quello delle righe referenziate: senza questo trigger un inserimento potrebbe collegarsi a una sessione di un'altra palestra.

### Account

- Il trigger su `auth.users`, che crea o collega `person`, prende la palestra da `raw_app_meta_data.gym_id`. Lo imposta chi crea l'account (gestore o superadmin), mai l'utente, perché va in `app_metadata`.
- Senza `gym_id` non viene creato nessun profilo.
- Il collegamento a una riga esistente con la stessa email (`20260911160000`) avviene **solo dentro la stessa palestra**.
- L'email resta unica a livello globale (vincolo di `auth.users`), coerente con "un account = una palestra".

## 2. Permessi, login e account

### Privilegio e guard

- `current_access()` aggiunge `isPlatformAdmin` e `gymStatus` (`active` | `suspended` | null).
- La definizione finale sta nell'**ultima** migrazione della serie (vedi §5).
- `getAccess()` li espone; nuova guard `requirePlatformAdmin()`, che risponde 404.

### Superadmin

- Dopo il login, e su `/` e `/dashboard`, va a `/gyms`.
- Nav: *Palestre*, *Account*.
- Le pagine di palestra rispondono 404 (nessun flag di palestra) e l'RLS non restituisce righe.
- `/account`: solo email e password. Nessuna cintura, data, ora o ruolo di palestra.
- `getOrCreateProfile()` non crea mai un profilo per un superadmin.

### Palestra sospesa

- `requireAdmin()` legge `gymStatus`. Se è `suspended` reindirizza a `/suspended`: pubblica, tradotta, raggiungibile anche con il cambio password obbligatorio in sospeso. Offre solo il logout.
- L'RLS nega comunque letture e scritture.

### Gestore di palestra

- È il ruolo `admin` esistente: stessi poteri di oggi, limitati alla propria palestra.
- Non ha cintura, per la regola "solo `{admin}`" già in vigore (`isPortalOnly()`).
- `addPerson`, `inviteToPortal`, `setTemporaryPassword` e la revoca:
  - ricavano `gym_id` lato server da `current_gym_id()`, mai dal form;
  - prima di usare la service role verificano che la persona bersaglio appartenga alla palestra di chi agisce.

### Account creati dal superadmin

- Solo gestori: nome, email, ruolo `admin`.
- Password di default condivisa (`utils/default-password.ts`) e `app_metadata.must_change_password`, più `app_metadata.gym_id`.
- Sui gestori di una palestra il superadmin può reimpostare la password (riarmando il cambio obbligatorio) e revocare l'accesso. Non può agire su chi non ha il ruolo `admin` in quella palestra.
- Più gestori per palestra sono ammessi.

### Bootstrap

Script manuale `supabase/scripts/bootstrap-platform-admin.sql`, non una migrazione, perché concede privilegi:

1. Verifica che admin@bjj.com non abbia presenze né promozioni registrate; altrimenti si ferma con errore.
2. Inserisce il suo `auth_user_id` in `platform_admin`.
3. Elimina le sue righe `assigned_role` e `person`.

littlegym@bjj.com viene creato dal superadmin da `/gyms/[id]`: è anche il primo test reale del flusso.

## 3. Pagine del superadmin

Regole comuni:
- Guardate da `requirePlatformAdmin()` (404); `/gyms` va in `PROTECTED_PREFIXES`.
- Testi nei dizionari (it, en, pt-BR), date dd/mm/yyyy, token dei temi, menu kebab (`components/row-menu.tsx`).

### `/gyms`

- Riga: nome, stato, persone attive, corsi, gestori, data di creazione (da `gym_overview()`).
- Filtri nell'URL: `q` (nome), `stato`, `p`, con form `method="get"`.
- Chip *Nuova palestra* → `/gyms/new`.
- Kebab: *Dettagli*, *Sospendi* / *Riattiva* (con conferma).

### `/gyms/new`

- Campi: nome, fuso orario (select da una lista breve in `utils/gym-defaults.ts`: Europe/Rome di default, Europe/Lisbon, Europe/London, Europe/Madrid, America/Sao_Paulo, America/New_York), data di avvio del tracciamento (default oggi), durata lezione, lezioni a settimana.
- Il server action valida lato server, crea la palestra, copia i requisiti di default e reindirizza a `/gyms/[id]`.

### `/gyms/[id]`

- **Impostazioni**
  - Gli stessi campi, modificabili.
  - Avviso visibile (non tooltip) quando cambiano fuso o data di avvio: spostano le finestre di check-in e le ore stimate di tutti i membri.
- **Gestori**
  - Lista con nome, email, stato dell'account.
  - *Aggiungi gestore* (nome, email).
  - Kebab con *Reimposta password* e *Revoca accesso*.
  - Non è una seconda lista delle stesse persone: il superadmin non vede il Registro, e qui compaiono solo i gestori.
- **Zona pericolosa**
  - Solo con palestra sospesa.
  - *Elimina definitivamente*, con conferma scrivendo il nome esatto.
  - Il server action ricontrolla sospensione e nome, cancella con la service role gli utenti auth della palestra, poi la riga `gym`: la cascata porta via tutto.
  - `guard_course_delete` va modificato perché lasci passare la cancellazione quando la riga `gym` madre è in cancellazione, e solo in quel caso. Rimane attivo per ogni cancellazione diretta di un corso.

### Header

- Dentro una palestra, accanto al logo Faixa BJJ compare il **nome della palestra**, letto dal suo record.
- Il nome del prodotto resta Faixa BJJ ovunque: landing, titoli, manifest.

## 4. Impostazioni per palestra nel codice

- `getGymSettings()` (`utils/supabase/gym.ts`, lato server, `cache()` di React) restituisce `{ id, name, status, timezone, trackingStartedOn, sessionLengthHours, lessonsPerWeek }`.
- `utils/hours.ts` e `utils/promotion.ts` non leggono più `TRACKING_STARTED_ON`, `LESSONS_PER_WEEK` e `SESSION_LENGTH_HOURS`: ricevono un parametro `settings`. Restano pure.
- I chiamanti da aggiornare sono `app/account/page.tsx`, `app/dashboard/member-dashboard.tsx`, `app/members/[id]/page.tsx`, più le pagine che chiamano `hoursFor()` e `promotionStatus()`.
- Le costanti di oggi sopravvivono solo come default di una palestra nuova, in `utils/gym-defaults.ts`.
- **Fuso orario solo in SQL**, come oggi:
  - `session_overview` calcola `checkin_opens_at`/`checkin_closes_at` con `gym_timezone(s.gym_id)`;
  - `record_promotion` usa la data odierna della palestra;
  - `checkinState()` resta un confronto tra istanti.
- Lo "oggi" del calendario si calcola nel fuso della palestra con un helper `todayIn(timezone)` in `utils/dates.ts`, testato.

## 5. Migrazioni, verifica, test

### Migrazioni nuove

Replay-safe secondo le regole di `docs/claude/database.md`:

1. `20260925000000_gym_tenancy.sql`
   - Enum `gym_status`, tabelle `gym` e `platform_admin`.
   - Inserimento di ASD Little Gym con `tracking_started_on` pari al `TRACKING_STARTED_ON` attuale.
   - `gym_id` nullable, backfill su ASD Little Gym, poi `not null`.
   - Indici; chiave di `promotion_criteria`.
2. `20260925010000_gym_functions.sql`: `current_gym_id`, `is_platform_admin`, `current_gym_status`, `gym_timezone(gym_id)`, trigger di compilazione, congelamento e coerenza, trigger `auth.users` aggiornato, `guard_course_delete` aggiornato.
3. `20260925020000_gym_rls.sql`
   - Tutte le policy riscritte con il vincolo di palestra: `drop policy if exists` dello **stesso** nome prima di ogni `create`.
   - Policy su `gym` e `platform_admin`.
4. `20260925030000_gym_views.sql`
   - `drop view if exists` + `create view` di `person_hours`, `person_rank_hours`, `member_overview`, `session_overview`, `course_overview`.
   - Tutte `security_invoker = on`; funzione `gym_overview()`.
   - `session_checkin_open`, `record_promotion` e `sync_course_sessions` aggiornate.
5. `20260925040000_gym_final_definitions.sql`: definizioni finali di `current_access()` (con `isPlatformAdmin`, `gymStatus`) e di `member_overview`. Chiudono la serie, così vincono qualunque cosa venga rieseguita prima.

### Verifica del database

- Replay in Docker (`postgres:17-alpine` + stub Supabase) da database vuoto, **due volte**, con `ON_ERROR_STOP=1`.
- `supabase/scripts/tenant-isolation-test.sql`: crea due palestre con un utente per ruolo ciascuna, simula `auth.uid()` e verifica che:
  - nessun utente legga o scriva righe dell'altra palestra;
  - il superadmin non legga `person`, `attendance` né `promotion`, e legga `gym` e `gym_overview()`;
  - una palestra sospesa non veda nulla e non scriva nulla;
  - `attendance` con `session_id` di un'altra palestra, `promotion` o `assigned_role` su persona di un'altra palestra vengano rifiutati;
  - `gym_id` non si possa cambiare con un update;
  - l'eliminazione di una palestra sospesa porti via tutti i suoi dati e nessun dato dell'altra.

  Lo script sta nel repo: va rilanciato a ogni nuova policy.

### Vitest

- `hours` e `promotion` con `settings` come parametro: ASD Little Gym più un caso a 1,5 h e uno con altra data di avvio.
- `todayIn()`.
- Validazione del form palestra: nome non vuoto, fuso tra quelli ammessi, valori > 0, conferma del nome per l'eliminazione.

### Verifica manuale sull'app

1. Login come admin@bjj.com → `/gyms`. Le pagine di palestra rispondono 404.
2. Creazione di una palestra di prova; da ASD Little Gym, creazione di littlegym@bjj.com.
3. Login come littlegym@bjj.com: cambio password obbligatorio, nessuna cintura in `/account`, Registro con i dati esistenti, creazione di un allievo.
4. Login come l'allievo: check-in dentro la finestra.
5. Sospensione di ASD Little Gym da superadmin → l'allievo finisce su `/suspended`. Riattivazione → tutto torna.
6. Eliminazione della palestra di prova (sospesa, conferma del nome).

### Documentazione

- Nuovo `docs/claude/gyms.md`.
- Aggiornati `docs/claude/database.md`, `docs/claude/auth-and-access.md` e la tabella in `CLAUDE.md`.
- `/privacy`: la piattaforma è responsabile del trattamento per conto di ogni palestra. È un testo ancora in bozza e va segnalato come tale.

## Rischi

- **È la migrazione più grande della storia del progetto**: tocca ogni policy e ogni vista. Una policy dimenticata senza vincolo di palestra è una fuga di dati tra clienti. Lo script di isolamento esiste per questo e va eseguito prima del deploy.
- Le migrazioni si applicano a mano: vanno incollate **tutte e cinque, in ordine**, sul progetto `poksgledkecwviypspmi`, e il frontend nuovo va deployato subito dopo.
  - Tra le due operazioni il vecchio frontend continua a funzionare per chi è in ASD Little Gym: le viste ricreate aggiungono colonne ma non ne tolgono.
  - Il superadmin, invece, non ha pagine finché il deploy non arriva.
  - `gym_timezone()` senza argomenti viene eliminata nella migrazione 4, dopo che tutte le funzioni e le viste che la usavano sono state ricreate.
- Una palestra appena creata e senza gestore non è raggiungibile da nessuno tranne il superadmin: è voluto.
