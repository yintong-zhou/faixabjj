---
type: handoff
date: 2026-09-20
status: bloccato — regressione di accesso: admin, maestro e istruttore non vedono più la dashboard della palestra né Corsi
seq: 4
prev: docs/handoff/2026-09-18-sistema-promozioni.md
tags: [cinture-bambini, ibjjf, migrazioni, idempotenza, permessi, registro, tema]
---

# Handoff — cinture bambini, idempotenza delle migrazioni, regressione permessi

## Obiettivo

Portare il sistema di graduazione dal solo percorso adulti a quello completo
IBJJF, bambini inclusi, e rendere la storia delle migrazioni applicabile da
capo senza errori. Serve perché la palestra ha corsi per bambini che finivano
tutti sotto "bianca", e perché ogni preview branch di Supabase falliva
rigiocando migrazioni già applicate a mano.

Il lavoro è in gran parte fatto e mergiato su `main`. **Si chiude bloccati su
una regressione di accesso emersa alla fine**, che va risolta prima di tutto il
resto.

## A che punto siamo

Mergiati su `main` (PR #3 e #4): sistema cinture bambini, ristrutturazione del
Registro, adattamento grafico dei campi data e dei dropdown, rinomina del brand
in "Faixa BJJ".

**Non committati**, 6 file sul working tree di `main`:

- l'idempotenza delle migrazioni (4 file SQL),
- il log dell'errore in `getAccess()`,
- `CLAUDE.md`.

`tsc`, `eslint`, 65 test e build di produzione erano puliti all'ultimo
controllo. Le migrazioni sono state verificate **eseguendole davvero** (vedi
"Da sapere"): 21 file su 21 da database vuoto.

**Il blocco.** L'utente riporta che admin, maestro e istruttore **non vedono
più** la dashboard della palestra né la sezione Corsi: tutti e tre cadono sulla
vista dell'allievo. All'inizio si era diagnosticato un singolo account senza
ruolo attivo — **quella diagnosi ora non regge più**, perché riguarda tutti e
tre i ruoli insieme. Non è stato ancora indagato con dati alla mano.

## Cosa abbiamo provato che NON ha funzionato

- **Rileggere le migrazioni per validarle.** Due giri di revisione a occhio non
  avevano visto né un `add column if not exists if not exists` (sostituzione
  applicata due volte) né due viste che fallivano il replay. Li ha trovati
  tutti l'esecuzione reale su Postgres in Docker. Non validare SQL leggendolo.
- **Rendere idempotente anche `20260910000000_init_schema.sql`.** Impossibile
  per costruzione: `20260912000000` elimina `attendance.class_date`, `led_by` e
  `duration_hours`, quindi gli indici e la vista iniziali su quelle colonne non
  hanno più nulla a cui attaccarsi. Avvolgerli in controlli di esistenza
  farebbe descrivere a quel file uno schema nato dopo. Lasciato così apposta.
- **`create or replace view` per una vista che cambia forma.** Non può
  aggiungere, togliere o rinominare colonne: `member_overview` falliva con
  "cannot drop columns from view". Convertite in `drop view if exists` +
  `create view`.
- **Seminare criteri di promozione per le cinture bambini.** Scartato in
  design: l'IBJJF per i bambini non dà né tempo minimo né ore, la promozione
  avviene completando i gradi del metodo scelto dal professore. Numeri inventati
  avrebbero messo ogni bambino in una coda che non misura niente.
- **Una scala unica di 17 cinture.** Percorrere `BELT_ORDER` per trovare il
  grado successivo proponeva la grigia a una cintura bianca adulta. Servono due
  scale che condividono il primo gradino.
- **Interrogare il database dall'MCP di sessione.** Espone solo
  `szxiviyiavzdkaxasvic` (ICPN_Main), mai `poksgledkecwviypspmi`. Ogni verifica
  sul database è passata da query scritte e consegnate all'utente.

## Problemi incontrati e come li abbiamo risolti

- **`policy ... already exists` sui preview branch.** Le migrazioni incollate
  nella SQL Editor non vengono registrate in
  `supabase_migrations.schema_migrations`, quindi Supabase le crede pendenti e
  le rigioca sopra uno schema che le contiene già. Risolto rendendo idempotente
  tutta la storia; la cura vera è registrarle (vedi "Dove vogliamo andare").
- **`add column if not exists if not exists`.** Errore di sintassi introdotto
  da una sostituzione `perl` eseguita due volte. È quasi certamente l'errore che
  l'utente ha visto applicando le migrazioni.
- **Metà dei file SQL ha terminatori CRLF.** Due giri di patch sono falliti in
  silenzio perché i pattern `\n...` non combaciavano. Usare `\r?\n`, o ancorare
  con `^` e `m`.
- **Le server action rifiutavano le cinture bambini.** `addPerson` e
  `recordPromotion` validavano contro un elenco di 5 cinture adulte scritto a
  mano: il pannello offriva la grigia e l'azione la respingeva. Ora importano
  `BELT_ORDER`.
- **Cinque stringhe italiane hardcoded** nel `<select>` dei ruoli — l'ultimo
  punto dell'app che non passava dai dizionari. Ora `roleLabels(t)`.
- **`yellow-white-3-stripe (2|3|4).png`** erano 2, 1 e 0 tacche, non duplicati.
  Verificati aprendo le immagini, non deducendo dal peso del file.
- **Regola CSS a specificità troppo alta.** `input[type="date"] { … }` batte
  `.text-sm`: ogni campo data avrebbe reso alla dimensione sbagliata, in
  silenzio. Avvolta in `:where()`.
- **`getAccess()` falliva in silenzio.** "La RPC non esiste" e "questo account
  non ha ruoli" davano la stessa schermata. Ora logga l'errore lato server,
  continuando a fallire chiuso. **È il primo strumento da usare sulla
  regressione in corso.**

## Decisioni prese

- **`belt-criteria.md` è l'unico documento di riferimento**, fusione di
  `ibjjf-criteria.md` (rimosso) e del vecchio file. Dove le due fonti divergono
  **vince l'IBJJF**, dichiarato in `meta.sources`. Prima conseguenza: età della
  nera 19 → 18.
- **Due scale di promozione, non una.** `ADULT_BELTS` e `KID_BELTS` condividono
  la bianca; `BELT_ORDER` resta una terza cosa, l'ordine di *visualizzazione*.
  Solo la bianca ha bisogno dell'età per disambiguare.
- **I bambini non entrano mai nella coda di idoneità**, e non è una lacuna: il
  documento non dà soglie per loro. Restano promuovibili dal pannello.
- **Tre gradi sulle cinture bambini**, non quattro. Il pannello offre comunque
  0-4 e il database rifiuta: nessuno stato client per un controllo che è
  server-rendered ovunque.
- **Nulla si suggerisce oltre la verde/nera.** La transizione a 16 anni è un
  giudizio (blu *o* viola), quindi non c'è un grado unico da proporre.
- **Seminate le tre età IBJJF** (blu 16, viola 16, marrone 18), perché i bambini
  le rendono portanti. Scartato il lasciarle fuori: senza età sulla blu, le
  presenze di un bambino lo mettevano in coda per una cintura adulta.
  Conseguenza accettata: chi non ha data di nascita esce dalla coda.
- **`/members/new` e `/members/criteria` sono rotte a sé.** Non viola "una sola
  lista di persone": una è un form, l'altra una tabella di cinture. Il divieto
  riguarda una seconda lista **delle stesse persone**.
- **I filtri restano un pannello sul Registro**, separati dai due link: sono
  l'unico controllo che apre qualcosa in pagina.
- **`promotion_criteria.notes` resta vuoto.** La provenienza dei numeri sta
  nelle migrazioni, non in un campo che qualcuno deve svuotare per scriverci.
- **Correggere `rank_since`/`stripe_since` non è una promozione** e non scrive
  storico. `record_promotion()` resta l'unico modo in cui un grado cambia.
- **`color-scheme` in tutti e quattro i blocchi dei token**, non solo nel tema
  scuro: una scelta esplicita "chiaro" deve poter rimettere il popup chiaro.
- **I nomi tecnici mantengono la grafia vecchia** dopo la rinomina del brand:
  `faixabjj-locale`, `faixabjj-cookie-notice`, `faixabjj-theme-change`, i file
  del logo. Rinominare una chiave salvata azzererebbe lingua, tema e presa
  visione del banner per ogni visitatore.
- **`20260910000000` non sarà mai rieseguibile** su un database già migrato.
  Scartato il renderlo tale a forza.

## File toccati

Mergiati su `main`:

- `belt-criteria.md` — fusione con il documento IBJJF; `ibjjf-criteria.md` rimosso.
- `supabase/migrations/20260919000000_black_belt_min_age.sql` — età nera 19 → 18.
- `supabase/migrations/20260919100000_kid_belt_ranks.sql` — i 12 valori d'enum, **da sola**: Postgres rifiuta di usarli nella stessa transazione che li aggiunge.
- `supabase/migrations/20260919110000_kid_belt_promotion.sql` — le tre età IBJJF e `record_promotion()` sulla scala completa.
- `supabase/migrations/20260919120000_clear_criteria_notes.sql` — azzera le note seminate.
- `frontend/utils/supabase/profile.ts` — `ADULT_BELTS`, `KID_BELTS`, `isKidBelt`, `BELT_ORDER` a 17.
- `frontend/utils/promotion.ts` + `.test.ts` — `nextStep()` sceglie la scala (65 test).
- `frontend/components/belt.tsx` — cartelle `adults/` e `kids/`.
- `frontend/public/belts/` — riorganizzate; `yellow-white` rinominate, arancione aggiunta.
- `frontend/app/members/page.tsx` — striscia di chip, due link, pannello filtri.
- `frontend/app/members/new/page.tsx`, `frontend/app/members/criteria/page.tsx` — nuove.
- `frontend/app/members/[id]/page.tsx` — pannello correzione date.
- `frontend/app/members/actions.ts` — `correctRankDates`, `backToCriteria`, `isBelt`.
- `frontend/app/globals.css` — `color-scheme`, `accent-color`, campi data, dropdown.
- `frontend/utils/site.ts`, `app/layout.tsx`, `components/nav-shell.tsx` — brand.
- `frontend/utils/i18n/dictionaries/*` — cinture bambini, `criteriaPageTitle`, messaggi date.

Non committati:

- `supabase/migrations/20260910000000_init_schema.sql`, `20260911140000_member_overview.sql`, `20260911200000_belt_since.sql`, `20260912000000_class_schedule.sql` — idempotenza.
- `frontend/utils/supabase/require-admin.ts` — log in `getAccess()`.
- `CLAUDE.md` — regole di idempotenza, verifica in Docker, sezioni promozioni.

## Dove vogliamo andare

1. **Risolvere la regressione di accesso.** Admin, maestro e istruttore non
   vedono più la dashboard della palestra né Corsi. Poiché riguarda **tutti e
   tre i ruoli**, la causa non è un singolo account senza ruolo. In ordine:
   - leggere il log del server: `getAccess()` ora stampa `[access] current_access failed …`. Se compare, la RPC è rotta e il resto segue;
   - controllare che `current_access`, `can_view_registry`, `can_manage_classes` e `has_active_role` esistano ancora e abbiano il `grant execute … to authenticated` (lo dà `20260911120000`; `20260912010000` per `can_manage_classes`);
   - controllare che le righe di `assigned_role` esistano ancora con `end_date is null`, e che `person.auth_user_id` sia popolato;
   - sospettato principale: la riesecuzione parziale di migrazioni, o il commit `52999dc` sulle policy.
2. **Eseguire `fix-ruolo-admin.sql`** se il punto 1 rivela ruoli o collegamenti
   mancanti.
3. **Registrare le migrazioni** con `registra-migrazioni.sql`, così Supabase
   smette di rigiocare quelle applicate a mano e i preview branch tornano verdi.
   Da lì in avanti usare `supabase db push`, che registra da sé.
4. **Committare i 6 file in sospeso** (siamo su `main`: valutare un branch).
5. **Verificare a runtime**, mai fatto: registrare una promozione (prima una
   tacca, poi una cintura), controllare che un allievo legga zero righe da
   `promotion_criteria`, che un istruttore non veda il pannello criteri, che un
   bambino compaia col suo grado ma **non** in coda, e i cinque rifiuti di
   `record_promotion()`.
6. **Decidere dove mettere gli script operativi**, oggi in una cartella
   temporanea che sparirà: `registra-migrazioni.sql`, `fix-ruolo-admin.sql`,
   `diagnosi-accesso-admin.sql`, `verifica-promozioni.sql`. Proposta:
   `supabase/scripts/`.

## Da sapere prima di toccare qualcosa

- **Le migrazioni si verificano eseguendole, non leggendole.** Docker Desktop
  va avviato a mano (`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`),
  poi `postgres:17-alpine`, uno stub di quanto fornisce Supabase (ruoli `anon`,
  `authenticated`, `service_role`, schema `auth`, `auth.users`, `auth.uid()`) e
  ogni file in ordine di nome con `psql -v ON_ERROR_STOP=1`, **due volte**. È
  l'unica cosa che ha trovato i tre errori reali.
- **L'MCP Supabase di sessione punta al progetto sbagliato.** Mai eseguire
  scritture da lì: `poksgledkecwviypspmi` non compare.
- **Metà dei file SQL è CRLF.** Le patch con `\n` falliscono in silenzio.
- **Le migrazioni applicate non si modificano**, tranne per rendere
  un'istruzione idempotente senza cambiarne il risultato — è l'unica eccezione
  presa, e va motivata.
- **`getAccess()` fallisce chiuso di proposito.** Un privilegio non si concede
  perché una query è andata male. Non "sistemarlo" facendolo fallire aperto.
- **Non ricreare `/promotions`**: vedi "cosa NON ha funzionato" nell'handoff
  precedente. `/members/criteria` non è la stessa cosa — non elenca persone.
- **Non seminare criteri per le cinture bambini.**
- **`SESSION_LENGTH_HOURS` è 1** e la conversione è oggi l'identità, ma la
  costante resta: è l'unico punto dove presenze e ore-orologio si incontrano.
- I test coprono solo le funzioni pure di `frontend/utils/`. Tutto il resto si
  verifica aprendo l'app — che è il motivo per cui il punto 5 esiste ancora.
