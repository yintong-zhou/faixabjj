---
type: spec
date: 2026-09-18
status: approvato — pronto per il piano di implementazione
tags: [promozioni, cinture, tacche, criteri, rls, dashboard]
source: belt-criteria.md
---

# Sistema di promozione — design

## Obiettivo

Chiudere la tappa 4 della roadmap: criteri di promozione configurabili e avvisi
di idoneità. Il sistema **suggerisce e registra, non promuove mai da solo**.
Il documento di riferimento (`belt-criteria.md`) è esplicito: la discrezionalità
dell'istruttore è «final and absolute» e i minimi di tempo e di ore sono
«necessary but not sufficient».

Colma anche un buco: oggi l'app non sa promuovere nessuno. Cintura, tacche,
`rank_since` e `stripe_since` si scrivono solo in `addPerson`, non esiste
nessuna form di modifica, e il trigger `guard_person_auth_link` congela quei
campi per chi non è registry editor.

## Decisioni prese

| # | Decisione | Alternativa scartata |
| - | --------- | -------------------- |
| 1 | Alert + promozione registrata + criteri modificabili dall'app | Solo alert; oppure criteri fissati in migrazione |
| 2 | Le soglie restano le ore-orologio del documento; una costante `SESSION_LENGTH_HOURS = 1.5` converte le presenze | Soglie pre-convertite in presenze; nessuna conversione |
| 3 | Idoneo = tempo minimo **e** ore minime, entrambi | Solo tempo; oppure tempo *o* ore |
| 4 | I criteri tecnici e comportamentali sono un promemoria testuale, senza stato salvato | Checklist salvata; checklist vincolante |
| 5 | L'allievo vede solo fatti sul presente: mai quanto manca, mai l'idoneità | Barra di avanzamento; verdetto visibile |
| 6 | Il calcolo vive in TypeScript puro e testato; `promotion_criteria` resta dati | Vista SQL che calcola tutto; stima ore spostata in SQL |

## Modello dati

### `promotion_criteria` — esistente, da riempire

Colonne attuali: `belt`, `stripe` (PK), `min_hours numeric(6,1)`,
`min_time_at_rank_days integer`, `notes`.

Si aggiunge **`min_age_years smallint`** (nullable): serve solo a marrone→nera,
dove IBJJF impone 19 anni.

Una riga significa **«cosa serve per raggiungere questo grado»**:

- `(blue, 0)` = requisiti per prendere la blu; `(blue, 1..4)` = requisiti per la
  n-esima tacca sulla blu.
- **`stripe = 0` misura il tempo su `rank_since`; `stripe > 0` su
  `stripe_since`.** Una colonna sola con due ancoraggi diversi: va scritto nel
  commento della migrazione, altrimenti è la prima cosa che qualcuno
  interpreta male.
- **Nessuna riga `(black, 1..4)`.** La nera non ha tacche ma gradi (dan), fuori
  scopo. Nessuna riga = nessun passo successivo, che è esattamente il
  comportamento voluto per chi è già nero.

`min_hours` è espresso in **ore-orologio**, come il documento, non in presenze.

### `person_rank_hours` — vista nuova

Le ore si misurano **dal grado attuale**, non da quando la persona è entrata in
palestra. Il documento misura le ore *dentro* una transizione (432 h durante la
blu). Confrontare il totale a vita sembra più semplice ma sbaglia due casi
reali: chi arriva già graduato partirebbe da zero, e chi non si allena da anni
resterebbe vicino alla soglia perché un totale non cala mai.

```sql
create view public.person_rank_hours
with (security_invoker = on)
as
select
  p.id as person_id,
  count(*) filter (where a.present and s.session_date >= p.rank_since)   as lessons_since_rank,
  count(*) filter (where a.present and s.session_date >= p.stripe_since) as lessons_since_stripe
from public.person p
left join public.attendance a on a.person_id = p.id
left join public.class_session s on s.id = a.session_id
group by p.id;
```

- `security_invoker = on` è obbligatorio, come su ogni vista di questo progetto.
  Conseguenza da conoscere: un allievo che interroga la vista vede solo la
  propria riga, perché le policy di `attendance` glielo impongono.
- Le colonne contano **presenze**, non ore, e si chiamano così apposta: la
  conversione in ore-orologio avviene in un unico punto in TypeScript.
- La stima pre-go-live **non si duplica**: `estimatedHours()` accetta già una
  data di partenza, quindi la si chiama con `max(joined_at, rank_since)`.

### `promotion` — tabella nuova, lo storico

```sql
create table public.promotion (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.person (id) on delete cascade,
  from_belt belt_rank not null,
  from_stripes smallint not null,
  to_belt belt_rank not null,
  to_stripes smallint not null,
  promoted_on date not null default current_date,
  promoted_by uuid references public.person (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index promotion_person_id_idx on public.promotion (person_id, promoted_on desc);
```

RLS:

- **select**: `can_view_registry() or person_id = current_person_id()` — è lo
  storico della persona, che deve poterlo leggere.
- **insert**: `can_edit_registry()`.
- **delete**: `can_edit_registry()`.
- **nessun update**: una promozione sbagliata si cancella e si rifà. Riscriverla
  cancellerebbe l'unica traccia di cosa fu deciso e quando.

`promoted_by` è `on delete set null`: se l'account del maestro viene rimosso, lo
storico della palestra resta, esattamente come per la revoca accesso.

### Policy da restringere — `promotion_criteria` in lettura

Oggi la select è aperta a ogni utente autenticato (`20260911120000`), scelta
innocua finché la tabella era vuota. Riempita, diventa la tabella che dice a un
allievo esattamente quanto gli manca: con due chiamate all'API si ricostruisce
da sé il conto che la decisione 5 gli nega.

La migrazione sostituisce quella policy con **select riservata a
`can_view_registry()`**. La regola va applicata dal database, non nascosta dalla
pagina — nascondere una voce di menu non è mai il controllo d'accesso, e qui
vale lo stesso per un dato.

Conseguenza sul codice: nessuna schermata che un allievo può aprire legge
`promotion_criteria`. Il design della sezione «allievo» lo rispetta già.

## Il calcolo — `frontend/utils/promotion.ts`

Funzione pura, senza accesso a rete o cookie, testata come `schedule.ts` e
`hours.ts`.

Input: la persona (`current_belt`, `current_stripes`, `rank_since`,
`stripe_since`, `birth_date`, `joined_at`, `lessons_since_rank`,
`lessons_since_stripe`) e le righe dei criteri.

Output:

```ts
type PromotionStatus = {
  next: { belt: BeltRank; stripe: number } | null; // null = nessun passo modellato
  requiredHours: number;      // ore-orologio
  currentHours: number;       // ore-orologio, presenze + stima, dal grado attuale
  requiredDays: number;
  currentDays: number;
  eligible: boolean;
  blockers: Blocker[];        // 'hours' | 'time' | 'age' | 'missing-birth-date'
};
```

Regole:

- **La scala dei passi**: se `current_stripes < 4` il passo successivo è la
  tacca seguente; a 4 tacche è la cintura successiva; sulla nera non c'è passo.
  Ne segue che il sistema **suggerisce** una cintura solo dopo quattro tacche —
  pratica comune, non regola del documento. Il pannello di promozione lascia
  comunque scegliere il grado di destinazione, quindi un salto diretto resta
  possibile: è la *proposta* a seguire la scala, non il permesso.
- **Ore**: `currentHours = clockHours(presenze dal grado +
  estimatedHours(max(joined_at, ancora)))`, dove l'ancora è `rank_since` per un
  passo di cintura e `stripe_since` per una tacca. La conversione con
  `SESSION_LENGTH_HOURS` si applica alla **somma**, non alle sole presenze:
  `estimatedHours()` restituisce un conteggio di lezioni, non ore-orologio, e
  convertire solo un addendo lascerebbe l'altro nell'unità sbagliata.
- **Confronti al limite**: `>=`, non `>`. Chi è esattamente alla soglia è
  idoneo.
- **Età**: controllata solo dove `min_age_years` è valorizzato. Se manca
  `birth_date`, il passo **non** è idoneo e il blocco è
  `missing-birth-date` — mai idoneo per assenza di dato.
- `eligible` è vero solo se `blockers` è vuoto.

`SESSION_LENGTH_HOURS = 1.5` sta in `frontend/utils/hours.ts`, accanto a
`HOURS_PER_LESSON`, con il commento che spiega perché esistono entrambe: l'app
conta presenze e ne chiama «ora» una ciascuna, i criteri parlano di ore di
lezione reali.

**Costo dichiarato:** la stessa persona compare con due numeri di ore diversi —
142 nel Registro (presenze) e 213 nell'avanzamento (ore-orologio). Ogni
schermata di promozione usa **solo** le ore-orologio ed è etichettata «1 lezione
= 1,5 h», altrimenti la differenza si legge come un bug.

## Scrittura della promozione — `record_promotion()`

Aggiornare `person` e inserire lo storico devono avvenire insieme o per niente,
e dal client sarebbero due scritture separate. È il caso in cui questo progetto
mette già la logica in SQL (`sync_course_sessions`).

```sql
record_promotion(
  p_person_id  uuid,
  p_to_belt    belt_rank,
  p_to_stripes smallint,
  p_promoted_on date default current_date,
  p_notes      text default null
) returns uuid
```

- **`security invoker`** (il default), **mai definer**: la funzione deve restare
  soggetta alle policy. Ricontrolla comunque `can_edit_registry()` in testa e
  solleva `insufficient_privilege` (42501) altrimenti.
- Cattura `from_belt`/`from_stripes` prima di scrivere.
- **Cambio di cintura** → `current_stripes = p_to_stripes` (0 nel caso normale),
  `rank_since = p_promoted_on`, `stripe_since = p_promoted_on`.
- **Nuova tacca** → solo `stripe_since = p_promoted_on`; `rank_since` non si
  tocca.
- Rifiuta: un grado all'indietro o uguale, tacche diverse da 0 sulla nera,
  tacche fuori da 0..4, una data futura, una persona inesistente.
- `promoted_by = current_person_id()`.
- `grant execute ... to authenticated`.

`guard_person_auth_link` non si tocca: la funzione scrive come l'editor che l'ha
chiamata, quindi passa il trigger senza eccezioni per la funzione stessa.

## Pagine

### `/promotions` — nuova, per chi vede il Registro

1. **Coda degli idonei**: nome, cintura attuale, passo proposto, da quando è
   idoneo. Mostra solo chi ha qualcosa in sospeso e sparisce quando la coda è
   vuota. Non è un secondo Registro: è una lista di lavoro, non l'elenco delle
   persone.
2. **Editor dei criteri**, solo per i registry editor (`canEditRegistry`): una
   riga per grado, con ore minime, giorni minimi, età minima e note. Una form
   `method="post"` per riga, server action con guardia `requireRegistryEditor()`
   — che esiste già in `utils/supabase/require-admin.ts` accanto alle altre.
   Nessuna creazione né cancellazione di righe: la scala dei gradi è fissa, si
   tarano solo i numeri.

La pagina va in `PROTECTED_PREFIXES` e chiama la propria guardia (404, non 403).
La coda si calcola caricando i membri attivi — poche centinaia di righe, colonne
strette, una query — e passandoli a `promotion.ts`.

**Voce «Promozioni» in nav** per chi vede il Registro. Costo accettato: è la
sesta voce e sulla tab bar del telefono sei voci stanno strette. L'alternativa
(nessuna voce, solo il link dalla dashboard) lascerebbe esistere una pagina che
non si trova.

### `/members` e `/members/[id]`

- Un pallino sulla riga di chi è idoneo, calcolato sulle righe della pagina
  corrente. Nessun filtro «solo idonei»: il database non conosce l'idoneità,
  per la decisione 6. Se un giorno servisse davvero, la strada pulita è spostare
  la stima ore in SQL.
- Kebab → **«Promuovi»**, solo per i registry editor.
- Nella pagina di dettaglio: lo **storico promozioni** e il pannello di
  promozione.

### Pannello di promozione

Mostra il passo proposto, lascia scegliere cintura e tacche di destinazione, la
data e una nota, e stampa **come promemoria testuale** i criteri tecnici e
comportamentali della transizione presi da `belt-criteria.md`. Nessuna casella,
nessuno stato salvato (decisione 4).

### Dashboard staff

Una card compatta con il numero di persone idonee, che linka a `/promotions`.

### Dashboard allievo

**Solo fatti sul presente**, mai un traguardo:

- cintura e tacche attuali (già presenti),
- **ore al grado attuale** — unico dato nuovo, da `person_rank_hours`,
- da quanto tempo ha quel grado e quell'ultima tacca (già presenti).

Niente barra, niente «ti mancano N ore», nessun nome del grado successivo,
nessun verdetto. Nessuna soglia raggiunge una schermata che un allievo possa
aprire, e la policy ristretta sopra lo garantisce anche via API.

## Seeding

Dal documento, a **3 allenamenti a settimana** (la stessa frequenza di
`LESSONS_PER_WEEK`), prendendo il minimo vincolante: il valore IBJJF dove esiste,
altrimenti l'estremo inferiore dell'intervallo pratico.

| Grado | `min_hours` | `min_time_at_rank_days` | `min_age_years` | Origine |
| ----- | ----------- | ----------------------- | --------------- | ------- |
| `(blue, 0)` | 108 | 183 | — | pratica, 0,5 anni |
| `(purple, 0)` | 432 | 730 | — | IBJJF, 2 anni |
| `(brown, 0)` | 324 | 548 | — | IBJJF, 1,5 anni |
| `(black, 0)` | 216 | 365 | 19 | IBJJF, 1 anno |
| `(white, 1..4)` | 40 | 61 | — | **inventato** |
| `(blue, 1..4)` | 40 | 61 | — | **inventato** |
| `(purple, 1..4)` | 60 | 91 | — | **inventato** |
| `(brown, 1..4)` | 80 | 122 | — | **inventato** |

**I valori delle tacche non vengono dal documento**, che dà solo l'intervallo di
2-4 mesi («shorter at white/blue, longer at higher belts») e nessuna ora. Le ore
sono coerenti con quell'intervallo a 3 lezioni da 1,5 h a settimana. Il commento
della migrazione lo dirà a chiare lettere, e la pagina criteri esiste anche
perché la palestra li corregga.

Nota sulla scala risultante: quattro tacche bianche a 61 giorni fanno 244
giorni, più dei 183 richiesti dalla blu, quindi in pratica è la scala delle
tacche a vincolare la prima cintura — circa 8 mesi, dentro l'intervallo pratico
di 6-12 mesi del documento.

## Traduzioni

Nuova sezione `promotions` nei tre dizionari, con `it.ts` che ne definisce il
tipo. Include i promemoria tecnici e comportamentali delle quattro transizioni
(una ventina di voci). Nessuna stringa visibile hardcoded, come ovunque.

## Test

`frontend/utils/promotion.test.ts`:

- la scala dei passi: tacca successiva sotto le 4, cintura a 4 tacche, niente
  sulla nera;
- conversione presenze → ore-orologio;
- confronti al limite esatto (soglia raggiunta = idoneo);
- blocco per età e blocco per `birth_date` mancante;
- ancoraggio corretto: `rank_since` per la cintura, `stripe_since` per la tacca;
- riuso della stima con data di partenza spostata.

## Fuori scopo

Gradi (dan) della cintura nera; correzioni e retrocessioni; peso dei risultati
agonistici; frequenza settimanale per persona al posto della costante;
notifiche via email; filtro «solo idonei» nel Registro.

## Migrazioni

Tutte da applicare **a mano** dalla dashboard del progetto `poksgledkecwviypspmi`,
come ogni migrazione di questo repo.

1. `promotion_criteria`: colonna `min_age_years`, seeding, policy di select
   ristretta a `can_view_registry()`.
2. Vista `person_rank_hours`.
3. Tabella `promotion` con le sue policy.
4. Funzione `record_promotion()`.
