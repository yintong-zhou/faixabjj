---
type: handoff
date: 2026-10-01
status: pronto-per-prova-su-telefono
seq: 1
prev: docs/handoff/2026-10-01-copia-credenziali.md
tags: [mobile, calendario, navbar, data-iscrizione, qr-scanner, dashboard, grafico-presenze, i18n]
---

## Obiettivo

Rendere l'app comoda da telefono e togliere dalle dashboard ciò che in questa fase non serve, in modo che maestri, istruttori e allievi trovino subito le cose che usano ogni giorno: calendario leggibile, check-in con il QR dentro l'app, presenze per giorno a colpo d'occhio. Tutto richiesto a voce dall'utente (head coach/admin), a pezzi, durante la sessione. Il punto di partenza è `docs/handoff/2026-10-01-copia-credenziali.md` (login locale e copia password), che resta valido.

## A che punto siamo

- **Tutto è committato e pushato** (`main` = `origin/main`, working tree pulito, ultimo commit `158e714`). Type-check, lint e 151 test Vitest passano.
- **Mai visto nel browser:** nessuna delle modifiche qui sotto è stata provata dal vivo. In questa sessione non c'era né un login admin né un browser. L'utente ha provato a mano solo il calendario ("perfetto, corretto"); le altre cinque cose aspettano la sua prova su telefono.
- **Fatto, in ordine di commit:**
  1. `ac64201` calendario mensile mobile: puntini + modale al tocco (desktop invariato).
  2. `6b56e7c` "Presenze" sotto "Corsi" nella navbar per lo staff, pulsante "Presenze" in `/courses`.
  3. `72f9d4b` modifica della data di iscrizione (`joined_at`) in `/members/[id]`.
  4. `7d4ceda` scanner QR per il check-in dalla dashboard personale (`jsqr`), coach inclusi.
  5. `a5dac91` dashboard staff: pulizia riquadri + grafico a barre delle presenze (settimana/mese).
  6. `158e714` dashboard personale: tolte tre note e il riquadro "Ore al grado attuale".
- **Il login locale:** a inizio sessione Node raggiungeva Supabase senza errori TLS (il blocco Netskope dell'handoff precedente non c'era più, il file `nscacert.pem` non esisteva). Il login reale con Turnstile non è stato comunque provato.

## Cosa abbiamo provato che NON ha funzionato

- **Nessun tentativo fallito di rilievo in questa sessione.** Le strade scartate sono tutte scelte di design, elencate sotto in "Decisioni prese".
- **Non verificabile da qui:** fotocamera, tocco sul calendario, modale, layout a 375 px, tema scuro. Non è un fallimento, è un limite dell'ambiente: ci sono solo type-check, lint e test sulla logica pura in `frontend/utils/`.
- Un controllo vero è stato fatto: `jsQR` decodifica correttamente un QR generato con `qrcode` (come `/gym`) a tre dimensioni e con i colori invertiti (script nello scratchpad, non nel repo).

## Problemi incontrati e come li abbiamo risolti

- **Conflitto `hidden` / `flex` sulla stessa casella del calendario.** Sintomo potenziale: la casella desktop e quella mobile si sarebbero contese `display`. Soluzione: la classe base `shell` non contiene il display; ogni resa aggiunge il proprio (`flex`, oppure `hidden sm:flex`).
- **Preflight di Tailwind v4 azzera i margini del `<dialog>`**, quindi non si centra da solo: servono `m-auto` e `p-0` sul dialog (il padding sta in un div interno, altrimenti un tocco dentro la scheda conta come tocco sullo sfondo e la chiude).
- **Barre di 8 px su telefono nel mese da 31 giorni:** troppo strette da toccare. Il grafico legge il puntatore sull'intera area e lo mappa alla colonna più vicina (`touch-pan-y` lascia scorrere la pagina in verticale).
- **`correctRankDates` aveva il ritorno alla scheda come funzione locale**: estratta in `detailRedirect()` in `app/members/actions.ts`, usata anche da `correctJoinedDate`.

## Decisioni prese

- **Calendario mobile:** puntini su telefono, nomi dei corsi su desktop; al tocco un **modale** (`<dialog>` nativo, `app/attendance/day-dialog.tsx`), non il pannello sotto la griglia. Scartati: popover posizionato (più codice), pannello sotto la griglia solo su desktop sì ma non su mobile (era la proposta iniziale, l'utente ha scelto il modale). Su desktop restano link, scorciatoia all'appello e pannello `#giorno`.
- **Navbar:** "Presenze" sparisce per chi ha `canManageClasses` (gli resta "Corsi", attiva anche su `/attendance`); **resta per gli allievi**, perché non aprono `/courses`. Scartato: toglierla a tutti (gli allievi perdevano il link principale al check-in).
- **Data di iscrizione:** campo **accanto a "Iscritto dal"** in Dati personali (non dentro "Correggi le date" del Percorso, come proposto prima). Solo `canEditRegistry` (head coach, admin), **nascosto sulla propria scheda** (il trigger `guard_person_auth_link` lo vieta a chiunque). Nessuna migration. Nessun ordine imposto rispetto a `rank_since`.
- **Scanner QR:** `jsqr` scelto contro `qr-scanner` (zero dipendenze, nessun worker; entrambe ferme da anni). Naviga **sempre al percorso interno `/check-in`**, mai all'indirizzo letto (`checkinPathFromQr()`, origine ignorata di proposito). Pulsante in cima alla dashboard personale, per **chi si allena, coach compresi**.
- **`/check-in` per i coach:** tolta l'esclusione dello staff (il DB non l'ha mai avuta, `check_in()` non guarda i ruoli). Resta l'avviso sull'appello solo per l'**admin solo-portale** (`isPortalOnly()`).
- **Grafico presenze:** barre HTML/CSS senza libreria, un solo colore (`accent`), settimana o mese di calendario (default **mese**), frecce precedente/oggi/successivo, stato nell'URL (`periodo=settimana`, `da`). Conta i presenti delle lezioni non annullate, **istruttore compreso**. Scartata: linea (con 7–31 punti non aggiunge nulla), palette categorica (una sola serie).
- **Rimosso dalla dashboard staff (non rimetterlo senza chiedere):** Nuovi 30gg, Ore della palestra, In calendario, Già svolte, Presenze, Media per lezione.
- **Rimosso dalla dashboard personale (idem):** nota "Ore di lezione, calcolate a 1 ora per lezione", nota "Cintura e tacche le assegna il tuo istruttore…", nota sul saldo di partenza stimato, riquadro "Ore al grado attuale". **Resta** l'etichetta breve "saldo iniziale incluso" sotto "Ore totali", per la regola "ogni totale stimato va dichiarato".

## File toccati

- `frontend/app/attendance/page.tsx` + `day-dialog.tsx` (nuovo): griglia senza scroller, `DayCell` a due rese, `GridSessionList` condivisa tra modale e pannello desktop.
- `frontend/components/nav-shell.tsx`, `frontend/app/courses/page.tsx`: navbar e pulsante "Presenze".
- `frontend/app/members/[id]/page.tsx`, `frontend/app/members/actions.ts`: campo e azione `correctJoinedDate`, `detailRedirect()`.
- `frontend/app/dashboard/checkin-scanner.tsx` (nuovo), `frontend/utils/checkin-qr.ts` + test (nuovi), `frontend/app/check-in/page.tsx`, `frontend/package.json` + lock (`jsqr`).
- `frontend/app/dashboard/attendance-chart.tsx` (nuovo), `frontend/utils/attendance-series.ts` + test (nuovi), `frontend/app/dashboard/staff-dashboard.tsx` (riscritta), `frontend/app/dashboard/page.tsx` (legge `periodo`/`da`).
- `frontend/app/dashboard/member-dashboard.tsx`: note e riquadro tolti, query `person_rank_hours` eliminata.
- `frontend/utils/i18n/dictionaries/{it,en,pt-BR}.ts`: chiavi nuove (scanner, grafico, data iscrizione, pulsante Presenze) e chiavi orfane eliminate.
- `docs/claude/attendance-and-dashboard.md`, `frontend-ui.md`, `members-and-promotions.md`: aggiornati su ogni punto sopra.

## Dove vogliamo andare

1. **Prova su telefono, in HTTPS (Vercel) o `localhost`**, e correggi quel che emerge:
   - calendario `/attendance?v=griglia` a 375 px: nessuno scorrimento laterale, il tocco su un giorno apre il modale (Chiudi, sfondo, Esc), tema chiaro e scuro;
   - dashboard personale: "Scansiona il QR" apre la fotocamera, il QR di `/gym` porta a `/check-in`, un QR qualunque dà il messaggio di errore, permesso negato dà "Riprova"; ripeti come coach nella vista "Mia";
   - dashboard staff: grafico, toggle e frecce; trascina il dito sul mese da 31 giorni (etichette dei giorni non sovrapposte); il totale di un giorno coincide con "Presenti N" dell'appello;
   - `/members/[id]`: come head coach o admin, "Modifica la data di iscrizione" su un'altra persona (e assente sulla propria); data futura = errore;
   - navbar: staff senza "Presenze" e con "Corsi" attiva su `/attendance`; allievo con "Presenze".
2. **Ripristinare il login locale** se serve (vedi handoff precedente): in questa sessione Node raggiungeva Supabase, ma il login con Turnstile non è stato provato.
3. Solo se l'utente lo chiede: check-in dei coach anche da `/attendance` (oggi lì vedono solo il link all'appello), filtro "solo allievi" nel grafico (oggi include l'istruttore segnato presente), QR per gli istruttori in `/gym#qr` (serve una nuova guardia `requireClassManager`, vedi handoff precedente).

## Da sapere prima di toccare qualcosa

- `AGENTS.md` del frontend avverte che questo Next.js (16.3.4) ha API diverse da quelle note: leggere `node_modules/next/dist/docs/` prima di toccare convenzioni di routing o file speciali. In questa sessione non è servito perché non si sono toccate.
- **La fotocamera funziona solo in HTTPS o su `localhost`.** Su un IP di rete locale in `http` il browser non espone `mediaDevices` e il modale dice "browser non compatibile".
- Il QR stampato contiene `SITE_URL/check-in`, ma lo scanner ignora l'origine: un QR da un altro host con lo stesso percorso porta comunque a `/check-in` dell'app corrente. È voluto.
- Il conteggio del grafico include chi è segnato presente all'appello, **istruttore compreso** (stessa definizione di `present_count` e del "Presenti N").
- `check_in()` non guarda i ruoli: se si vuole vietare il check-in a qualcuno va fatto in SQL, non solo nella pagina.
- `SUPABASE_SECRET_KEY` finì nell'output di un comando nella sessione precedente (vedi handoff precedente): se la sessione può essere condivisa, ruotarla.
- Il commit su `main` è la prassi del repo (nessun branch per le feature); i messaggi di commit terminano con la riga `Co-Authored-By` indicata dall'harness.
