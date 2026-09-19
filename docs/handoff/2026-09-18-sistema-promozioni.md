---
type: handoff
date: 2026-09-18
status: in corso — codice completo e revisionato, migrazioni mai applicate, nessuna verifica a runtime
seq: 3
prev: docs/handoff/2026-09-18-inglese-checkin-privacy.md
tags: [promozioni, cinture, tacche, criteri, rls, registro, supabase]
---

# Handoff — sistema di promozione

## Obiettivo

Chiudere la tappa 4 della roadmap: criteri di promozione configurabili e avvisi
di idoneità. Serve perché l'app tracciava le ore ma non sapeva promuovere
nessuno — cintura, tacche, `rank_since` e `stripe_since` si scrivevano solo alla
creazione della persona, e non esisteva nessuna form per cambiarli. Il sistema
**suggerisce e registra, non promuove mai da solo**: il documento di riferimento
`belt-criteria.md` è esplicito nel dire che la discrezionalità dell'istruttore è
finale e che i minimi di tempo e ore sono necessari ma mai sufficienti.

## A che punto siamo

Tutto il codice è scritto, revisionato e committato: **24 commit sul branch
`feat/promotion-system`**, albero di lavoro pulito, 58 test verdi, `tsc` e lint
puliti.

Funziona, staticamente:

- Quattro migrazioni: criteri con seeding e policy di lettura ristretta allo
  staff, vista `person_rank_hours`, tabella `promotion`, funzione
  `record_promotion()`.
- `frontend/utils/promotion.ts`, puro e coperto da test, unica definizione
  dell'idoneità.
- Il Registro (`/members`) porta tutto: riga di riepilogo col numero di idonei
  che è un link al filtro `?idonei=1`, pallino verde sulle righe, pannello
  criteri modificabile per maestro e admin, "Promuovi" nel menu kebab.
- Pannello di promozione e storico su `/members/[id]`, card sulla dashboard
  staff, una sola cifra in più sulla dashboard dell'allievo.

**Non è mai stato eseguito.** Le quattro migrazioni non sono state applicate a
nessun database, quindi nessuna schermata è mai stata aperta e nessuna
promozione registrata. Tutta la verifica finora è stata statica: lettura
incrociata fra SQL, query e tipi.

## Cosa abbiamo provato che NON ha funzionato

- **Una pagina `/promotions` separata.** Era il design approvato e fu costruita
  per intero — coda degli idonei più editor dei criteri, con la sua voce in
  nav. È stata poi smontata e assorbita nel Registro: violava la regola già
  scritta nel progetto, *una sola lista di persone, non due*, e spendeva la
  sesta voce della tab bar, che su un telefono non c'è. **Non ricrearla.**
- **La coda come elenco in cima al Registro.** Primo tentativo ovvio quando si
  è deciso di accorpare, e sbagliato: la stessa persona sarebbe comparsa due
  volte nella stessa schermata, cioè esattamente il problema che si stava
  risolvendo. È diventata un conteggio più un filtro sulla lista che c'era già.
- **Calcolare l'idoneità solo sulle righe della pagina corrente.** Funzionava
  per il pallino e per nient'altro: con l'impaginazione il conteggio era
  sbagliato e un filtro era impossibile. Ora si calcola su tutti i membri
  attivi e si filtra per id.
- **Confrontare le ore totali a vita con le soglie.** Scartato in design: chi
  arriva già graduato da un'altra palestra partirebbe da zero, e chi ha smesso
  di allenarsi resterebbe vicino alla soglia per sempre, perché un totale non
  cala. Da qui la vista `person_rank_hours`, che conta dal grado attuale.
- **Una vista SQL che calcolasse tutto** (`promotion_status`). Avrebbe dato
  filtro e ordinamento gratis, ma avrebbe duplicato in SQL la stima delle ore
  pre-go-live e le sue due costanti, che vivono in TypeScript e sono testate.
- **Una checklist salvata dei criteri tecnici e comportamentali.** Ribaltava la
  logica dell'alert: finché nessuno spunta nulla nessuno è mai idoneo, quindi
  il sistema smetterebbe di segnalare e comincerebbe ad aspettare. Sono un
  promemoria testuale, senza stato.

## Problemi incontrati e come li abbiamo risolti

- **Un maestro poteva promuovere sé stesso.** `record_promotion()` controllava
  solo `can_edit_registry()` e nulla impediva di passare il proprio id: un
  admin che non sale mai sul tappeto poteva assegnarsi la nera, con lo storico
  che lo registrava come soggetto e firmatario. Risolto con un rifiuto su
  `p_person_id = current_person_id()`, errcode `42501`, subito dopo il
  controllo di privilegio. Trovato dalla revisione finale, non dai test.
- **`promotion_criteria` era leggibile da chiunque.** Innocuo finché la tabella
  era vuota; riempita, diceva a un allievo esattamente quanto gli mancava, cioè
  la cosa che il prodotto ha deciso di non mostrargli. La policy di select è
  ora ristretta a `can_view_registry()`: la regola è applicata dal database,
  non nascosta dalla pagina.
- **Lo scarto di unità fra presenze e ore-orologio.** Il documento contava ore
  da lezioni di 1,5 h, l'app conta presenze e ne chiama "ora" una ciascuna:
  senza conversione ogni soglia sarebbe stata sbagliata del 50% e nessun test
  se ne sarebbe accorto. Unica conversione, `SESSION_LENGTH_HOURS`.
- **Un oggetto condiviso restituito per riferimento** da `promotionStatus()`.
  Non era ancora un bug, ma un `blockers.push()` futuro avrebbe corrotto ogni
  lookup successivo nello stesso processo. Ogni ramo restituisce ora un oggetto
  e un array nuovi.
- **Il pallino nel Registro e la coda non concordavano**: la coda filtrava
  `is_active`, il pallino no, quindi un ex membro poteva avere il pallino e
  non comparire nella lista di lavoro. Ora condividono lo stesso insieme.
- **`BELT_ORDER` stava per essere dichiarato due volte.** Esisteva già in
  `utils/supabase/profile.ts`; `promotion.ts` lo importa.

## Decisioni prese

- **Alert + promozione registrata + criteri modificabili dall'app**, scartato il
  solo alert (lascerebbe un cartello che nessuno può spuntare) e i criteri
  fissati in migrazione.
- **Idoneo = tempo minimo *e* ore minime**, scartato il solo tempo (chi è fermo
  da mesi risulterebbe idoneo) e il tempo *o* le ore (violerebbe il minimo
  IBJJF, che è una regola di federazione sul tempo).
- **L'allievo vede solo fatti sul presente**, mai quanto manca né l'idoneità.
  Scartata anche la versione ammorbidita con barra e numeri senza la parola
  "idoneo": mostrare la distanza è di per sé il problema, perché trasforma un
  giudizio dell'istruttore in un traguardo da guardare avvicinarsi.
- **Il calcolo in TypeScript puro**, scartata la vista SQL: il prezzo accettato
  è che il database non conosce l'idoneità.
- **La durata della lezione è 1 ora**, e le soglie seminate sono state divise
  per 1,5 rispetto al documento perché il tempo richiesto restasse quello
  IBJJF. Scartato il lasciarle invariate, che avrebbe reso il monte ore il
  vincolo al posto del tempo. `belt-criteria.md` è stato allineato con tutte le
  sue tabelle derivate.
- **La scala suggerisce la cintura solo dopo quattro tacche** (pratica comune,
  non regola del documento), ma il pannello lascia scegliere qualunque grado in
  avanti: vincola la proposta, non il permesso.
- **Una promozione si cancella, non si modifica**: riscriverla cancellerebbe
  l'unica traccia di cosa fu deciso.
- **`record_promotion()` è security invoker**, mai definer: un definer
  scavalcherebbe le policy e il trigger che congela le colonne della cintura,
  cioè il motivo per cui la promozione non è self-service.

## File toccati

- `supabase/migrations/20260918100000_promotion_criteria.sql` — colonna
  `min_age_years`, seeding delle 20 righe, policy di lettura ristretta.
- `supabase/migrations/20260918110000_person_rank_hours.sql` — vista che conta
  le presenze dal grado attuale e dall'ultima tacca.
- `supabase/migrations/20260918120000_promotion_history.sql` — tabella
  `promotion` con select, insert, delete e **nessun update**.
- `supabase/migrations/20260918130000_record_promotion.sql` — la funzione
  atomica, con il rifiuto dell'auto-promozione e il fuso orario della palestra.
- `frontend/utils/promotion.ts` + `.test.ts` — la regola di idoneità.
- `frontend/utils/hours.ts` + `.test.ts` — `SESSION_LENGTH_HOURS` e `clockHours`.
- `frontend/utils/dates.ts` + `.test.ts` — `ageOn` e un `today` pinnabile.
- `frontend/app/members/page.tsx` — riepilogo, filtro `idonei`, pallino,
  pannello criteri, voce "Promuovi" nel kebab.
- `frontend/app/members/actions.ts` — `recordPromotion` e `updateCriterion`.
- `frontend/app/members/[id]/page.tsx` e `promote-panel.tsx` — pannello,
  storico, promemoria.
- `frontend/app/dashboard/{staff,member}-dashboard.tsx` — card e ore al grado.
- `frontend/utils/i18n/dictionaries/{it,en,pt-BR}.ts` — sezione `promotions`.
- `frontend/components/nav-shell.tsx`, `frontend/app/layout.tsx`,
  `frontend/utils/supabase/proxy.ts` — la rotta `/promotions` rimossa.
- `CLAUDE.md` — sezione `## Promotions` (e compressione del file, commit a sé).
- `belt-criteria.md` — modello ore portato a lezioni da 1 ora.
- `docs/superpowers/specs/2026-09-18-promotion-system-design.md` e
  `docs/superpowers/plans/2026-09-18-promotion-system.md` — design e piano.

## Dove vogliamo andare

1. **Applicare a mano le quattro migrazioni** `2026091810/11/12/13*` sul
   progetto `poksgledkecwviypspmi`, dalla SQL Editor della dashboard. Vanno
   applicate in ordine di nome.
2. **Verificare l'isolamento dell'allievo**: come account allievo,
   `promotion_criteria` deve tornare **zero righe**; come maestro, 20 righe.
3. **Verificare i ruoli**: un istruttore vede il Registro e il pallino ma
   **non** il pannello criteri, e una POST diretta a `updateCriterion` deve
   fallire.
4. **Registrare una promozione** — prima una tacca, poi una cintura — e
   controllare che `stripe_since` si muova da solo per la tacca, che il cambio
   di cintura sposti anche `rank_since` e azzeri le tacche, che lo storico
   compaia con nota e firmatario, e che conteggio e filtro scendano di uno.
5. **Provare i tre rifiuti**: una promozione all'indietro, una con data futura,
   e **promuovere sé stessi**. Tutte e tre devono essere respinte.
6. Controllare che `/promotions` risponda **404**.
7. **Decidere cosa fare del commit `8c3d55e`**, che committa `belt-criteria.md`
   e l'handoff precedente con un messaggio che fa sembrare li abbia scritti
   l'agente. Va riscritto il messaggio oppure tolto il commit.
8. Solo dopo, valutare il merge su `main`.

## Da sapere prima di toccare qualcosa

- **Le migrazioni si applicano a mano dalla dashboard**, mai tramite l'MCP
  collegato senza aver prima verificato che il project ref sia
  `poksgledkecwviypspmi`.
- **Le quattro migrazioni non sono mai state applicate**, quindi finora è stato
  lecito correggerle sul posto. Dal momento in cui le applichi questa libertà
  finisce: da lì in avanti serve una migrazione correttiva.
  **Aggiornamento del 19/09/2026: la libertà è finita per tutte.** Sono state
  applicate `20260918100000_promotion_criteria.sql`, poi
  `20260919000000_black_belt_min_age.sql` (età della nera 19 → 18),
  `20260919100000_kid_belt_ranks.sql` e
  `20260919110000_kid_belt_promotion.sql` (sistema bambini e ragazzi). Da qui
  in avanti ogni correzione a una di queste è una migrazione nuova. Restano da
  applicare, se non lo sono già, le tre del sistema di promozione elencate
  sopra: `person_rank_hours`, `promotion_history`, `record_promotion` — e
  quest'ultima è stata comunque riscritta da `20260919110000`.
- **Non ricreare `/promotions`**: vedi "cosa NON ha funzionato".
- **`utils/promotion.ts` non va duplicato né reimplementato in una pagina.** Il
  pallino, il conteggio e il filtro concordano perché chiamano tutti lui.
- **Le lezioni durano 1 ora**: `SESSION_LENGTH_HOURS` è `1` e la conversione è
  oggi l'identità, ma la costante e `clockHours()` restano perché sono l'unico
  punto dove le due unità si incontrano. Se cambi la durata, vanno riscalate
  anche le soglie seminate, altrimenti cambia in silenzio il tempo richiesto.
- **Nulla di ciò che un allievo può aprire deve dire quanto gli manca o se è
  idoneo.** Non è una preferenza di layout: è una regola di prodotto, ed è
  applicata anche a livello di database dalla policy sui criteri.
- Le due migrazioni che seminano numeri contengono valori **inventati** per le
  tacche (27/27/40/53 ore, 61/61/91/122 giorni): il documento non ne dà, e la
  pagina criteri esiste anche perché la palestra li corregga.
- I test coprono solo le funzioni pure di `frontend/utils/`. Tutto il resto si
  verifica aprendo l'app, che è il motivo per cui il punto 1 qui sopra viene
  prima di ogni altra cosa.
