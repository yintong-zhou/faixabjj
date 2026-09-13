---
type: handoff
date: 2026-09-13
status: in corso — codice verde, multilingua non committato, database quasi allineato
seq: 1
prev: docs/handoff/2026-09-12-presenze.md
tags: [i18n, dashboard, presenze, registro, tema, seo, supabase]
---

# Handoff — multilingua, dashboard e rifiniture

## Obiettivo

Portare FAIXABJJ da scheletro a portale che la palestra possa davvero usare:
registro dei membri, corsi, presenze con check-in, dashboard, e da oggi anche
tre lingue. La ragione delle tre lingue è la platea reale del BJJ in Italia —
maestri brasiliani e allievi internazionali — per cui l'italiano da solo taglia
fuori parte della palestra.

## A che punto siamo

Sei commit fatti durante la sessione (`e181b48` → `dc0fabf`). **Il lavoro degli
ultimi due turni non è committato**: 30 file modificati, 5 nuovi, ~1000 righe.

`npx tsc --noEmit`, `npm run lint`, `npm run build` puliti; `npm test` 36/36.

**Funziona, ed è stato verificato sul dev server:**

- **Multilingua** italiano / inglese / portoghese brasiliano. Verificato con
  `curl`: `lang="it-IT"` senza cookie, `en-GB` e `pt-BR` con il cookie, e il
  fallback su `Accept-Language: pt-BR` funziona. Le pagine rendono i titoli
  tradotti.
- Dashboard staff e allievo, griglia mensile in Presenze, cinture come
  immagini, date dd/mm/yyyy, ore con saldo iniziale, appello con icone
  verde/rossa e ordinamento per cintura, admin escluso ovunque.

**A metà:** nulla a livello di codice.

**Non verificato:** la **resa visiva**. Nessuna pagina è mai stata guardata con
gli occhi in questa sessione — né la griglia Presenze a larghezza telefono, né
le cinture nei due temi, né il contrasto di verde e rosso, né come si comporta
il layout con le stringhe inglesi e portoghesi, che sono più lunghe
dell'italiano in diversi punti.

**Non applicato:** `supabase/migrations/20260913000000_session_instructor_backfill.sql`
è committato ma **non girato sul database**. Finché non lo è, in Presenze le
lezioni già generate continuano a mostrare "nessun istruttore" anche quando il
corso ne ha uno.

**Non impostato:** `TRACKING_STARTED_ON` in `frontend/utils/hours.ts` è a
`2026-09-13`, cioè la data di oggi usata come segnaposto. Va messa la data
reale in cui la palestra ha iniziato a registrare le presenze.

## Cosa abbiamo provato che NON ha funzionato

- **`<script dangerouslySetInnerHTML>` nudo nel `<head>` del layout.** React
  logga in sviluppo *"Encountered a script tag while rendering React
  component"*. Il build non lo intercetta. La correzione è
  `components/inline-script.tsx`: `type="text/javascript"` sul render server,
  `text/plain` su quello client. Non rimetterlo nudo.
- **`w-full` sull'immagine dentro il componente `Belt`.** In un contenitore
  flex *in colonna* i figli vengono stirati sull'asse trasversale, quindi la
  cintura diventava larga quanto la riga: da qui le dimensioni diverse fra
  Registro e Presenze. Serve `w-fit self-start` sul contenitore e niente
  `w-full` sull'immagine.
- **Stimare le ore "3 a settimana dall'iscrizione" senza una data di taglio.**
  Conta due volte ogni settimana da quando il tracciamento è attivo. Il taglio
  (`TRACKING_STARTED_ON`) è il meccanismo, non un dettaglio.
- **Prefissi di lingua nell'URL (`/en/registro`).** Scartato: avrebbe richiesto
  di spostare ogni rotta sotto `app/[locale]/` e riscrivere link e proxy, per
  un beneficio che esiste solo sulla landing, l'unica pagina pubblica.
- **`as const` sul dizionario italiano.** Trasforma ogni valore in un *literal
  type*, e il dizionario inglese dovrebbe contenere le parole italiane per
  soddisfare il tipo.
- **Inserire un import "dopo l'ultima riga che inizia con `import`"** con uno
  script. Su un import multi-riga finisce *dentro* le graffe e rompe il
  parsing. È successo su `app/presenze/actions.ts` e `app/layout.tsx`.
- **`.not(...)` prima di `.select(...)`** su un client Supabase: non esiste su
  `PostgrestQueryBuilder`. I filtri vanno dopo il `select`.
- **Chiedere a `formatDays` di leggersi il dizionario da solo.** Gli helper in
  `utils/` sono puri e coperti da test: prendono il dizionario come parametro
  con default italiano.

## Problemi incontrati e come li abbiamo risolti

- **Strict Mode azzera `data-theme` in sviluppo.** React rimonta una volta e
  resetta `<html>` ai soli attributi che gestisce dal JSX, cancellando quello
  che lo script anti-flash aveva impostato: la pagina resta nel tema sbagliato.
  Risolto con un `useLayoutEffect` in `theme-toggle.tsx` che lo riapplica —
  no-op in produzione.
- **Il preview branch di Supabase falliva con `type "belt_rank" already exists`.**
  Le migration sono state applicate a mano dal SQL Editor, che non scrive in
  `supabase_migrations.schema_migrations`: il branching le rigioca tutte da
  capo. Si risolve registrando la cronologia (insert nelle dieci versioni, o
  `supabase migration repair`), **non** rendendo idempotenti le migration.
  **Non ancora fatto.**
- **File CRLF e LF mescolati.** Ogni script di patch deve rilevare `\r\n` e
  adattare le stringhe di ricerca. Vale ancora.
- **Backtick dentro stringhe passate a `node -e` da bash.** Bash li interpreta
  come sostituzione di comando e li mangia silenziosamente. Gli script di patch
  vanno scritti su file e lanciati con `node`, come già diceva l'handoff
  precedente.

## Decisioni prese

- **Lingua in un cookie, URL invariati**, e **dizionari scritti a mano** invece
  di next-intl. Scartati: i prefissi nell'URL (vedi sopra) e la libreria, in un
  progetto che non ha nessuna dipendenza di interfaccia e disegna a mano anche
  le icone. Prezzo accettato: la landing ha un solo URL per tre lingue, quindi
  un motore di ricerca indicizza quella che gli viene servita.
- **Le ore prima del tracciamento sono un saldo di partenza, congelato**, a 3
  lezioni a settimana dall'iscrizione fino a `TRACKING_STARTED_ON`. Da lì ogni
  ora arriva **solo** da check-in o appello, cosa che le policy RLS già
  impongono. Scartate: la stima perpetua e i due numeri mai sommati.
- **La media settimanale è una costante per tutti**, non un campo per persona:
  è una stima dichiarata, e un valore per persona la travestirebbe da misura.
- **L'istruttore è il predefinito del corso**, ereditato dalle lezioni generate
  e sovrascrivibile sulla singola lezione. Reversa `2da3e44`, che lo aveva
  tolto dal form.
- **L'istruttore della lezione parte spuntato presente**, ma come *default* del
  form, non come scrittura automatica: altrimenti sarebbe la terza strada per
  aggiungere un'ora che avevamo escluso.
- **`admin` non compare dove l'app chiede "chi sono le nostre persone"** —
  registro, appello, tendine istruttore. Il test è l'uguaglianza dell'array
  (`active_roles = {admin}`), non "contiene admin": chi è maestro *e* admin si
  allena comunque.
- **Le date restano dd/mm/yyyy in tutte le lingue.** Cambia il testo attorno,
  non il formato del numero.
- **Niente bottone di check-in nella griglia mensile**: la cella non ha spazio.
  La griglia mostra dove sei, l'azione resta nella vista lista.
- **`--success` e `--danger` sono gli unici colori che significano qualcosa**
  nell'app e cambiano con il tema. Il tema scuro ha `--surface`, `--border` e
  un accento schiarito propri, perché i valori del brand non passavano il
  contrasto.

## File toccati

**Non committato, il grosso è il multilingua:**

- `frontend/utils/i18n/` — `locales.ts`, `server.ts`, e i tre dizionari
  (`it.ts` definisce il tipo, `en.ts` e `pt-BR.ts` lo soddisfano). 402 chiavi
  per lingua.
- `frontend/app/actions/locale.ts` — server action che salva il cookie.
- `frontend/components/language-switcher.tsx` — selettore, Client Component solo
  perché serve il pathname per tornare alla pagina di partenza.
- `frontend/components/inline-script.tsx` — la correzione dell'errore React.
- `frontend/app/reset-password/page.tsx` + `reset-form.tsx` — pagina divisa in
  server e client: il form deve restare client perché il link di recupero porta
  i token nel fragment.
- Tutte le pagine e le quattro `actions.ts` — copy sostituito con `t.*`.
- `frontend/utils/{dates,hours,schedule}.ts`, `utils/supabase/profile.ts` —
  gli helper prendono il dizionario come parametro.
- `frontend/components/{nav-shell,theme-toggle,password-input,belt}.tsx` — le
  parole arrivano come prop, tranne `Belt` che legge il dizionario da sé.
- `frontend/app/presenze/[id]/page.tsx` — anche ordinamento per cintura e
  istruttore preselezionato.
- `CLAUDE.md` — sezione "Languages" e le due trappole dello script inline.

**Già committato in questa sessione:** componente `Belt`, griglia mensile,
formato date, SEO (`robots.ts`, `sitemap.ts`, `utils/site.ts`), token di tema,
dashboard, ore stimate, istruttore nei corsi, migration
`20260913000000_session_instructor_backfill.sql`.

## Dove vogliamo andare

> Il prossimo passo lo decide l'utente e non è ancora stato scritto qui.
> Quello che resta aperto, in ordine di dipendenza:

1. **Committa il lavoro in sospeso.** Sono due gruppi logici: il multilingua, e
   le rifiniture dell'appello (ordinamento per cintura, istruttore presente,
   correzione dello script inline).
2. **Applica** `20260913000000_session_instructor_backfill.sql` dal SQL Editor
   del progetto `poksgledkecwviypspmi`. Senza, gli istruttori restano vuoti
   sulle lezioni già generate.
3. **Imposta `TRACKING_STARTED_ON`** alla data reale di avvio del tracciamento.
4. **Guarda l'app.** Le tre lingue e i due temi, la griglia Presenze a
   larghezza telefono, le cinture, verde e rosso dell'appello. È la verifica
   che manca del tutto.
5. **Registra la cronologia delle migration** in
   `supabase_migrations.schema_migrations`, altrimenti i preview branch di
   Supabase continuano a fallire.
6. **Valorizza `NEXT_PUBLIC_SITE_URL`** in `.env.local` e su Vercel, o
   canonical e sitemap puntano a `localhost`.

## Da sapere prima di toccare qualcosa

- **L'MCP Supabase collegato punta al progetto sbagliato** (`ICPN_Main`, ref
  `szxiviyiavzdkaxasvic`), non a quello dell'app (`poksgledkecwviypspmi`). Le
  migration si applicano a mano dal dashboard.
- **Un dev server gira già sulla porta 3000** (era PID 7868). Lanciarne un
  altro prende la 3001 e poi si spegne da solo. Per verificare, interroga
  quello che c'è; gli errori di runtime stanno in
  `frontend/.next/dev/logs/next-development.log`, non nell'output del comando.
- **Il build non intercetta gli errori React di sviluppo.** Quello dello script
  inline è stato trovato solo leggendo quel log.
- **Questa versione di Next (16.3.4) ha convenzioni diverse da quelle note**:
  `frontend/AGENTS.md` lo dice, e la documentazione sta in
  `node_modules/next/dist/docs/`. La guida che ha risolto lo script inline è
  `01-app/02-guides/preventing-flash-before-hydration.md`.
- **Il file si chiama `proxy.ts`, non `middleware.ts`.** Non ricreare il vecchio
  nome.
- **Ogni view in Supabase vuole `security_invoker = on`**, altrimenti un allievo
  legge tutta la palestra.
- **`session_overview.present_count` rispetta la policy di chi legge**: un
  allievo vedrebbe contata solo la propria riga. Il conteggio si mostra solo
  allo staff.
- Comandi da `frontend/`: `npm test`, `npm run lint`, `npx tsc --noEmit`,
  `npm run build`.
