---
type: handoff
date: 2026-09-18
status: in corso — codice verde e committato, migration applicate, verifica visiva mai fatta
seq: 2
prev: docs/handoff/2026-09-13-multilingua.md
tags: [i18n, routing, presenze, checkin, gdpr, privacy, supabase]
---

# Handoff — inglese di default, check-in e privacy

## Obiettivo

Portare FAIXABJJ da scheletro a portale che una palestra possa davvero usare
per tracciare ore, gradi e cinture. In questa sessione tre cose: aprire l'app
in inglese e in inglese anche le URL, perché la platea del BJJ è
internazionale; rendere affidabile il check-in degli allievi, che è il
meccanismo da cui dipendono le ore e quindi le promozioni; e mettere l'app in
regola con il GDPR prima che tocchi dati di persone vere.

## A che punto siamo

Tutto committato, working tree pulito. Ultimi commit: `d690947` (privacy),
`ad0ad38` (check-in e sospensione corsi), `49a393b` (README), `5d7d7a5` /
`79f442c` (inglese di default).

`npx tsc --noEmit`, `npm run lint`, `npm run build` puliti; `npm test` 36/36.

**Fatto e verificato dai controlli automatici:**

- **Inglese di default.** `DEFAULT_LOCALE = "en"`, e gli helper puri in
  `utils/` hanno default `en` invece di `it` — era l'altra via da cui
  l'italiano rientrava. Italiano resta la lingua in cui i dizionari sono
  *scritti* (`it.ts` definisce il tipo `Dictionary`): lingua di redazione e
  lingua di default sono due cose diverse.
- **URL in inglese.** `/members`, `/attendance`, `/courses`,
  `/change-password`, ancora `#how-it-works`. 114 riferimenti riscritti,
  rinomini fatti con `git mv` così la storia dei file sopravvive. Nessun
  redirect dai vecchi URL italiani: l'app non è pubblica, deciso di tagliare.
- **Quattro bug del check-in chiusi** (vedi "Decisioni prese").
- **Privacy e cookie.** `/privacy` pubblica nelle tre lingue, banner
  informativo a un pulsante, link nel footer di ogni pagina.
- **README riscritto** da zero: diceva ancora "React + Vite" e puntava a un
  documento mai committato.

**Migration: applicate.** L'utente conferma di aver girato sul database
`20260913000000_session_instructor_backfill.sql`,
`20260918000000_checkin_window_defaults.sql` e
`20260918010000_suspended_course_checkin.sql`. Non l'ho verificato io: l'MCP
collegato vede solo `ICPN_Main`.

**Mai fatto — è la lacuna principale:** la **verifica visiva**. Nessuna pagina è
stata guardata con gli occhi, né in questa sessione né nella precedente. Da
controllare: le tre lingue (le stringhe inglesi e portoghesi sono più lunghe
dell'italiano in diversi punti), i due temi, la griglia Presenze a larghezza
telefono, il banner cookie che non deve coprire la tab bar in basso, la
tabella dei cookie che scorre nel suo box, l'appello con verde e rosso.

**Non impostato:** `TRACKING_STARTED_ON` in `frontend/utils/hours.ts` è ancora
`2026-09-13`, un segnaposto. Va messa la data reale in cui la palestra ha
iniziato a registrare le presenze, o ogni totale è gonfiato.

**Non compilato:** i segnaposto dell'informativa — `[NOME DELLA PALESTRA]`,
`[INDIRIZZO COMPLETO]`, `[EMAIL DI CONTATTO]`, `[NUMERO]` anni di
conservazione. L'utente ha detto che in fase di test il titolare non esiste
ancora; la pagina lo dichiara in un riquadro visibile.

## Cosa abbiamo provato che NON ha funzionato

- **`sed` con `#` come delimitatore per sostituire `#come-funziona`.** Il
  pattern conteneva il delimitatore stesso: l'espressione è diventata
  `s##come-funziona##how-it-works#g`, che non ha fatto nulla e non ha dato
  errore. Trovato solo rileggendo il file. Le ancore con caratteri speciali si
  sostituiscono in uno script Node, non in una riga di `sed`.
- **`node - <<'EOF'` con `cd frontend` nello stesso comando Bash.** La working
  directory della tool Bash non è dove credi fra una chiamata e l'altra: un
  `fs.readFileSync('CLAUDE.md')` ha cercato in `D:\DEVS\`. Usa percorsi
  assoluti negli script di patch.
- **Importare `Dictionary` da `dictionaries/en.ts`.** Il tipo è esportato solo
  da `it.ts`; `en.ts` lo importa e basta. Cambiando il default degli helper da
  `it` a `en` serve `import { en } from "./dictionaries/en"` più
  `import type { Dictionary } from "./dictionaries/it"`, due righe separate.
- **Fidarsi dell'handoff precedente sullo stato del repo.** Diceva "30 file non
  committati"; erano già tutti committati. Controlla `git status` e
  `git log` prima di ripartire, sempre.
- **Un banner cookie con Accetta/Rifiuta.** Scartato esplicitamente con
  l'utente: l'app non ha nulla di opzionale da consentire, quindi un "Rifiuta"
  che non spegne niente è una scelta finta. Un solo pulsante informativo.
- **Cancellare le sessioni future quando un corso viene sospeso.** Scartato: la
  sospensione è per definizione reversibile, e cancellare le lezioni renderebbe
  la riattivazione una rigenerazione. Il flag `is_active` è stato reso
  autorevole invece che distruttivo.

## Problemi incontrati e come li abbiamo risolti

- **File CRLF e LF mescolati.** Vale ancora, come nell'handoff precedente. Ogni
  script di patch rileva `s.includes('\r\n')` e adatta le stringhe inserite,
  altrimenti il file finisce con terminatori misti.
- **`npx tsc --noEmit` che fallisce su file in `.next/`.** Dopo aver rinominato
  le cartelle delle rotte, i tipi generati puntavano ancora a
  `app/registro/page.js`. Non è un errore del codice: `rm -rf .next` e
  ricostruisci.
- **Le asserzioni dei test erano in italiano.** Cambiato il default degli
  helper a `en`, tre asserzioni in `schedule.test.ts` fallivano ("lunedì
  14/09/2026" contro "Monday 14/09/2026"). Aggiornate: non erano un bug, erano
  la vecchia lingua di default scritta a mano.

## Decisioni prese

- **Inglese di default, italiano lingua di redazione.** Scartato: rendere
  inglese anche il file sorgente dei dizionari, che avrebbe voluto dire
  riscrivere `it.ts` e ritradurre tutto per zero beneficio.
- **Chiavi del dizionario lasciate in italiano** (`t.registro`, `t.presenze`,
  `t.corsi`) anche se le rotte sono inglesi: scelta esplicita dell'utente, sono
  interne. Scartata la coerenza totale perché avrebbe gonfiato il diff.
- **L'appello non cancella i check-in arrivati mentre era aperto.** Il form
  porta un `loaded_at` nascosto; le righe `self` create dopo quell'istante
  sopravvivono e il messaggio dice quante. Scartato il re-fetch con merge
  automatico: avrebbe tolto all'istruttore il controllo su cosa salva.
- **Un check-in confermato mantiene la sua provenienza.** L'upsert scrive solo
  le righe il cui stato è davvero cambiato, così una riga `self` confermata
  resta `self`. Scartato riscrivere tutto a `staff`, che cancellava l'unica
  informazione su chi ha dichiarato quell'ora.
- **Finestra di check-in stretta: 15 minuti prima, 0 dopo.** Con i vecchi 60/30
  tre lezioni consecutive erano aperte insieme e bastavano tre tap per tre ore.
  La migration sposta anche i corsi esistenti che avevano ancora esattamente
  60/30.
- **Un errore non è una finestra chiusa.** `checkIn` distingue `23505` e
  `42501` da tutto il resto; il resto prende un messaggio generico e finisce
  nel log server via `logDbError()`. Prima, con una migration mancante, ogni
  check-in diceva "chiuso" e mandava a guardare l'orologio.
- **Sospendere un corso lo ferma davvero.** `session_checkin_open()` richiede
  `c.is_active`, `session_overview` espone `course_active`, il calendario
  nasconde le lezioni future del corso sospeso ma tiene quelle passate.
- **Il check-in resta una comodità, non la fonte.** L'appello dell'istruttore è
  il record autorevole. Il problema di fondo — nessuna prova fisica di
  presenza, si timbra da casa — **non è risolto** ed è la decisione aperta:
  l'opzione raccomandata era un kiosk al banco (tablet, lista di oggi, tap sul
  nome), meno rognosa per l'allievo di qualunque soluzione via telefono.
- **Banner cookie informativo a un pulsante**, con la regola che il giorno in
  cui si aggiunge uno script di analytics quel componente deve diventare un
  vero gate di consenso.
- **Nessun redirect dai vecchi URL italiani.** L'app non è pubblica.

## File toccati

Tutto già committato.

- `frontend/app/{members,attendance,courses,change-password}/` — rinominati da
  `registro`, `presenze`, `corsi`, `cambia-password` con `git mv`.
- `frontend/utils/i18n/locales.ts` — `DEFAULT_LOCALE = "en"` con il perché.
- `frontend/utils/{dates,hours,schedule}.ts`, `utils/supabase/profile.ts` —
  default del dizionario da `it` a `en`, import del tipo separato.
- `frontend/utils/schedule.test.ts` — tre asserzioni in inglese.
- `frontend/app/attendance/actions.ts` — `loaded_at`, provenienza preservata,
  `logDbError()`, errori distinti in `checkIn` e `undoCheckIn`.
- `frontend/app/attendance/[id]/page.tsx` — `loaded_at` nel form, riga "N hanno
  fatto check-in da soli", avviso corso sospeso.
- `frontend/app/attendance/page.tsx` — filtro `course_active` sulle lezioni da
  oggi in poi.
- `frontend/app/courses/{page.tsx,actions.ts}` — default 15/0 della finestra.
- `frontend/app/privacy/page.tsx` — nuova, informativa più tabella cookie.
- `frontend/components/cookie-notice.tsx` — nuova, banner a un pulsante.
- `frontend/components/nav-shell.tsx` — footer con il link a `/privacy`.
- `frontend/app/layout.tsx` — monta `CookieNotice`, passa la label.
- `frontend/utils/supabase/proxy.ts` — `/privacy` esente dal redirect del
  cambio password obbligatorio.
- `frontend/utils/site.ts`, `frontend/app/sitemap.ts` — `/privacy` fra i
  percorsi pubblici.
- `frontend/utils/i18n/dictionaries/{it,en,pt-BR}.ts` — blocchi `privacy` e
  `cookieNotice`, `nav.privacy`, `rollCall.selfCheckins`,
  `rollCall.courseSuspendedNotice`, `msg.rollCallSavedKept`,
  `msg.checkinFailed`, `msg.undoFailed`.
- `supabase/migrations/20260918000000_checkin_window_defaults.sql` — nuova.
- `supabase/migrations/20260918010000_suspended_course_checkin.sql` — nuova.
- `README.md` — riscritto.
- `CLAUDE.md` — path aggiornati, sezioni "Members" e "Attendance and courses"
  rinominate, nuova sezione "Privacy and cookies", quattro paragrafi sulle
  regole del check-in.

## Dove vogliamo andare

1. **Guarda l'app.** È la verifica che manca da due sessioni. Tre lingue, due
   temi, larghezza telefono. Punti sensibili: la griglia Presenze, il banner
   cookie sopra la tab bar, la tabella dei cookie, i testi inglesi e
   portoghesi che sono più lunghi dell'italiano.
2. **Verifica sul campo che le migration abbiano fatto effetto**: un corso
   sospeso non deve più mostrare lezioni future né accettare check-in, e le
   finestre dei corsi esistenti devono leggere 15/0.
3. **Imposta `TRACKING_STARTED_ON`** alla data reale di avvio del tracciamento.
4. **Decidi sul check-in**: lasciarlo come comodità o costruire il kiosk al
   banco. È l'unica questione di sostanza rimasta aperta sul modulo presenze.
5. **Compila l'informativa** quando esiste un titolare, e verifica che la
   regione del progetto Supabase sia davvero UE, come la pagina afferma.
6. **Registra la cronologia delle migration** in
   `supabase_migrations.schema_migrations`, altrimenti i preview branch di
   Supabase continuano a fallire con `type "belt_rank" already exists`.
7. **Valorizza `NEXT_PUBLIC_SITE_URL` su Vercel** (in `.env.local` c'è già),
   o canonical e sitemap puntano a localhost.

## Da sapere prima di toccare qualcosa

- **L'MCP Supabase collegato punta al progetto sbagliato**: vede solo
  `ICPN_Main` (`szxiviyiavzdkaxasvic`), non `poksgledkecwviypspmi`. Le
  migration si applicano a mano dal SQL Editor.
- **`.claude/launch.json` non esiste**, anche se `CLAUDE.md` lo cita: per
  vedere l'app va avviato `npm run dev` da `frontend/`.
- **Il build non intercetta gli errori React di sviluppo.** Gli errori di
  runtime stanno in `frontend/.next/dev/logs/next-development.log`, non
  nell'output del comando.
- **Il file si chiama `proxy.ts`, non `middleware.ts`.**
- **Ogni view in Supabase vuole `security_invoker = on`**, altrimenti un
  allievo legge tutta la palestra.
- **Questa versione di Next (16.3.4) ha convenzioni diverse da quelle note:**
  `frontend/AGENTS.md` lo dice, la documentazione sta in
  `node_modules/next/dist/docs/`.
- **Il banner cookie non ha un "Rifiuta" di proposito.** Non è una dimenticanza
  e non va aggiunto finché non esiste qualcosa di opzionale da rifiutare.
- Comandi da `frontend/`: `npm test`, `npm run lint`, `npx tsc --noEmit`,
  `npm run build`.
