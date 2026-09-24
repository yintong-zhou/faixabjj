---
type: spec
date: 2026-09-25
status: in revisione — da approvare prima del piano di implementazione
tags: [check-in, geolocalizzazione, qr, palestre, rls, gdpr]
---

# Check-in vicino alla palestra — design

## Obiettivo

Un allievo deve poter segnarsi presente a una lezione solo se si trova in
palestra. Oggi basta premere il pulsante in `/attendance` da qualsiasi posto
mentre la finestra di check-in è aperta. La palestra riceve una posizione, e il
check-in dell'allievo riesce solo entro **50 m** da quella posizione. Un **QR
fisso stampato** in palestra apre una pagina che fa il check-in da sola.

Scopo dichiarato: **prevenzione**. Oggi non c'è un problema concreto di allievi
che barano; il controllo deve scoraggiare il check-in da casa senza dare
fastidio a chi è davvero in palestra.

### Limite noto, accettato

La posizione la comunica il browser, e il server non può verificarla. Chi vuole
davvero barare la falsifica (strumenti per sviluppatori, app "fake GPS"). Il
controllo ferma il check-in distratto o pigro da casa, non chi imbroglia di
proposito. L'appello dell'istruttore resta la fonte autorevole, come oggi.

## Decisioni prese

| # | Decisione | Alternativa scartata |
| - | --------- | -------------------- |
| 1 | Posizione GPS entro 50 m dalla palestra | QR che cambia su uno schermo in palestra; IP del Wi-Fi della palestra |
| 2 | QR **fisso** stampato, con un unico indirizzo `/check-in` per tutte le palestre | QR diverso per palestra; QR che ruota |
| 3 | Il pulsante in `/attendance` resta e segue la stessa regola dei 50 m; il QR è una scorciatoia | Check-in solo da QR; pulsante senza controllo |
| 4 | La posizione la imposta il superadmin alla creazione e il gestore la corregge | Solo il gestore; solo il superadmin |
| 5 | La regola sta nel database: funzione `check_in()`, niente inserimento diretto | Controllo in una server action con service role; coordinate salvate sulla presenza |
| 6 | Le coordinate dell'allievo non si salvano da nessuna parte | Salvarle per audit |
| 7 | Precisione peggiore di 100 m → rifiuto con "riprova"; entro 100 m, distanza ≤ 50 m | Distanza meno la precisione dichiarata |
| 8 | Palestra senza posizione → check-in senza controllo di distanza | Check-in bloccato finché la posizione manca |

Fuori scope: geocodifica di un indirizzo (servizio esterno), raggio
configurabile per palestra, QR che cambia nel tempo, controllo di posizione
sull'appello dello staff.

## 1. Dati e database

### Posizione della palestra

- `gym.latitude` e `gym.longitude`, `double precision`, entrambe nulle o
  entrambe valorizzate (`check`), con latitudine in [−90, 90] e longitudine in
  [−180, 180].
- Il **superadmin** le scrive con la policy esistente `"platform admins manage
  gyms"`.
- Il **gestore** non ha update su `gym`. Usa `set_gym_location(p_lat, p_lng)`,
  `security definer`, `search_path = ''`: aggiorna solo quei due campi della
  palestra `current_gym_id()`, e solo se `can_manage_users()` è vero.
  Altrimenti rifiuta con `42501`. `p_lat`/`p_lng` entrambi null cancellano la
  posizione.

### Check-in

`check_in(p_session_id uuid, p_lat double precision, p_lng double precision,
p_accuracy double precision) returns jsonb`, `security definer`,
`search_path = ''`. Restituisce `{"result": <esito>, "distance_m": <intero o
null>}` con un esito tra:

| Esito | Quando |
| ----- | ------ |
| `ok` | presenza inserita |
| `already` | l'allievo è già presente a quella lezione |
| `closed` | finestra chiusa (`session_checkin_open()` falso), lezione di un'altra palestra, palestra sospesa, nessun profilo |
| `location_needed` | la palestra ha una posizione ma le coordinate mancano |
| `imprecise` | `p_accuracy` mancante o > 100 m |
| `too_far` | distanza > 50 m (con `distance_m`) |

Ordine dei controlli: profilo e finestra (`closed`), poi `already`, poi,
solo se la palestra ha una posizione, `location_needed`, `imprecise`,
`too_far`. L'inserimento usa gli stessi valori di oggi: `person_id =
current_person_id()`, `present = true`, `checked_in_by = 'self'`. `gym_id` lo
compila il trigger `gym_scope`.

- La distanza la calcola `gym_distance_m(lat1, lng1, lat2, lng2)`, funzione SQL
  pura (`immutable`) con la formula dell'haversine, raggio terrestre 6 371 000 m.
- Le soglie (50 m, 100 m) sono costanti nella funzione, commentate.
- Le coordinate non vengono scritte in nessuna tabella e non compaiono nei
  messaggi d'errore né nei log.
- Resta invariata la policy `"members can undo their own check-in"`.

### Rilascio in due migrazioni

1. `…_gym_location_checkin.sql`: colonne, `gym_distance_m`, `check_in`,
   `set_gym_location`, grant a `authenticated`. Compatibile con l'app di oggi,
   che inserisce ancora direttamente.
2. `…_drop_direct_checkin.sql`: `drop policy if exists "members can check
   themselves in"`. Si applica **dopo** il deploy dell'app nuova. Da qui l'unico
   modo di segnarsi presente da soli è `check_in()`.

Entrambe replay-safe secondo `docs/claude/database.md`.

## 2. Interfaccia

### `/check-in` (indirizzo del QR)

- In `PROTECTED_PREFIXES`: senza login il proxy manda a `/login?next=/check-in`.
- Guard `requireAdmin("/check-in")`. Il superadmin riceve 404, come su ogni
  pagina di palestra; un utente di palestra sospesa va su `/suspended`.
- Il server legge le lezioni della palestra con la finestra aperta adesso
  (`session_overview`, stessi criteri del calendario).
  - Nessuna → "Nessuna lezione aperta al check-in adesso", con un link ad
    `/attendance`.
  - Una → un componente client chiede subito la posizione e chiama la server
    action.
  - Più di una → un pulsante per lezione; la posizione si chiede al tocco.
- Posizione: `navigator.geolocation.getCurrentPosition` con
  `enableHighAccuracy: true`, `timeout: 10000`, `maximumAge: 0`.
- Esiti mostrati: presente a *corso* *ora*; già presente; troppo lontano (con
  la distanza); posizione imprecisa con "Riprova"; permesso negato (come
  riattivarlo, e chiedere l'appello all'istruttore); posizione non disponibile
  (timeout) con "Riprova"; finestra chiusa.

### `/attendance`

Il pulsante di check-in diventa un componente client che prima chiede la
posizione e poi invia la stessa server action. Gli esiti e i messaggi sono gli
stessi di `/check-in`. L'annullamento del check-in non chiede la posizione.

### Server action

`checkIn(sessionId, lat, lng, accuracy)` in `app/attendance/actions.ts` chiama
l'RPC `check_in` con il client dell'utente (niente service role) e traduce
l'esito nel messaggio del dizionario. Un errore del database va in
`logDbError()` e diventa un messaggio generico.

### Impostare la posizione

- **Superadmin:** in `GymFields` (`/gyms/new`, `/gyms/[id]`), due campi
  facoltativi, latitudine e longitudine. C'è un link di controllo che apre la
  posizione su una mappa esterna (link, nessun embed). `parseGymForm` li
  valida: entrambi o nessuno, dentro gli intervalli.
- **Gestore:** nuova pagina `/gym`, "La mia palestra", guard
  `requireUserManager()` (404 agli altri), raggiungibile da un link in
  `/account`. Contiene:
  - i due campi e il pulsante "Usa la mia posizione attuale", che li compila dal
    telefono;
  - il salvataggio tramite `set_gym_location`;
  - il **QR da stampare**, con l'indirizzo assoluto `SITE_URL + /check-in` e il
    nome della palestra, generato come SVG lato server con il pacchetto npm
    `qrcode`. Nessun servizio esterno.

### Testi e privacy

- Ogni testo nuovo è in `it.ts`, `en.ts` e `pt-BR.ts`.
- Nuovo paragrafo nell'informativa privacy: la posizione del dispositivo viene
  letta solo al momento del check-in, serve solo a verificare la vicinanza alla
  palestra e non viene conservata. Il browser chiede il permesso ogni volta,
  secondo le sue impostazioni.
- Il banner dei cookie non cambia: non c'è nessuna memorizzazione nuova.

## 3. Casi limite

- La posizione richiede HTTPS: Vercel lo ha già, e `localhost` vale in sviluppo.
- L'appello dello staff (`/attendance/[id]`) non cambia e non chiede la
  posizione. Uno staff che si segna presente da sé segue la regola degli allievi.
- Due invii della stessa richiesta danno `already`, non un errore (`23505` dentro
  `check_in` → `already`).
- Un QR fotografato e aperto da casa dà `too_far`.
- Una palestra senza posizione si comporta come oggi, finché il gestore non la
  imposta.

## 4. Test

- **SQL** (`supabase/tests/tenant-isolation.sql`, replay in Docker):
  - inserimento diretto di un allievo rifiutato, dopo la seconda migrazione;
  - posizione a più di 50 m → `too_far`, entro 50 m → `ok`;
  - precisione 150 m → `imprecise`;
  - coordinate mancanti con la palestra posizionata → `location_needed`;
  - palestra senza posizione → `ok`;
  - lezione di un'altra palestra → `closed`;
  - secondo check-in → `already`;
  - un gestore non può cambiare la posizione di un'altra palestra;
  - un allievo non può chiamare `set_gym_location`.
- **Vitest** (`frontend/utils/`): validazione di latitudine e longitudine in
  `parseGymForm`; traduzione degli esiti di `check_in` e degli errori di
  `GeolocationPositionError` nelle chiavi del dizionario.
- **A mano** sul telefono, dopo il deploy: check-in in palestra, check-in da
  casa rifiutato, permesso negato, QR stampato che porta al check-in.

## Rischi

- **Falsi rifiuti al chiuso.** Il GPS può essere impreciso in un locale
  seminterrato. Mitigazione: la soglia di precisione a 100 m e "Riprova"; se
  capita spesso, si alza il raggio con una migrazione.
- **`/gym` accanto a `/gyms`.** I prefissi si confrontano con `startsWith`
  (`PLATFORM_PATHS`, `PROTECTED_PREFIXES`): `/gym` va aggiunto a
  `PROTECTED_PREFIXES`, e il confronto va reso esatto (`p === path ||
  path.startsWith(p + "/")`) così `/gym` e `/gyms` non si confondono.
- **Ordine di rilascio.** Se la seconda migrazione va sul live prima del
  deploy, l'app vecchia non riesce più a fare check-in. Il piano lo indica come
  passo separato.
