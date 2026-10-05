---
type: handoff
date: 2026-10-04
status: in corso
seq: 1
prev: nessuno
tags: [landing, demo, superadmin, dashboard, onboarding-palestre]
---

# Presentare Faixa BJJ ad altre palestre

## Obiettivo

Preparare Faixa BJJ per presentarlo a palestre nuove: pagine pubbliche che spiegano il prodotto e fanno chiedere una demo, strumenti per il superadmin (admin@bjj.com) per seguire le palestre ospitate, e una strategia di demo che mostri il valore senza mettere a rischio dati reali.

## A che punto siamo

Tutto il lavoro di questa sessione è **committato** (working tree pulito, ultimo commit `a5fb846`).

Fatto e verificato (tsc, lint, 168 test Vitest, replay Docker con isolamento T23 e T24, screenshot dove possibile):
- **Landing `/`** riscritta: contenuti aggiornati (QR check-in, username, invito con approvazione, stima ore, palestre separate), hero con demo dell'appello animata (unica animazione), sezione cinture, chiusura divisa "Gestisci una palestra?" / "Sei già un membro?".
- **`/demo`** pubblica: email precompilata verso `contactdm.yt@gmail.com` (`DEMO_EMAIL` in `utils/site.ts`), anteprima del messaggio, "Cosa succede dopo". In sitemap. Voce "Richiedi una demo" nella navbar per i soli visitatori.
- **Superadmin**: username + cambio email su `/account`; dashboard di sola consultazione su `/dashboard`, solo totali.
- **Staff**: banner su `/dashboard` con le iscrizioni da approvare (per `canManageUsers`); pulsante "Salva immagine" del QR su `/gym`; nomi lunghi nell'appello e nel Registro non spostano più i pulsanti.
- **Skill `frontend-design`** installata a livello utente (`~/.agents/skills`, link in `~/.claude/skills`).

Non verificato dal vivo: le pagine del superadmin e dello staff (serve login reale e le migration applicate).

Non iniziato: palestra demo fittizia, scaletta della demo, informativa privacy definitiva, accordo art. 28.

## Cosa abbiamo provato che NON ha funzionato

- **Heredoc bash con testi che contengono apostrofi** (copy italiano): `unexpected EOF`. Scrivere i file con il tool Write e poi inserirli con uno script node.
- **Inserimenti via node con ancore `"\n..."`** falliscono sui file CRLF (`supabase/tests/tenant-isolation.sql`, alcuni doc). Controllare con `file <path>` o usare il tool Edit.
- **Screenshot mobile con `--window-size=390,...`**: Chrome headless non scende a quella larghezza e taglia il contenuto. Usare una pagina wrapper con un `<iframe>` largo 390 px (per ritagliare: div `overflow:hidden` + `margin-top` negativo sull'iframe; PIL non è installato).
- **Screenshot senza schema forzato**: Windows è in tema scuro, quindi il "chiaro" esce scuro. Passare `--blink-settings=preferredColorScheme=1` (chiaro) o `=0` (scuro).
- **Animazioni negli screenshot via iframe**: restano ferme al primo fotogramma. Non è un bug della pagina.
- **`set role` dentro un blocco `DO` nei test SQL**: fragile. Calcolare i valori attesi prima, da superuser, con `set_config`.
- **`npx skills add` senza `-g`**: installa nel progetto con un link simbolico assoluto, che git (`core.symlinks=false`) salverebbe rotto. Si usa `-g`.
- **Mancano `chromium-cli` e Playwright**: per gli screenshot si usa `chrome.exe --headless=new`.

## Problemi incontrati e come li abbiamo risolti

- **La pagina superadmin di `/account` non mostrava `?ok=`/`?error=`** (nessun feedback dopo il cambio password). I banner ora sono condivisi fra i due rami della pagina.
- **Dopo approvazione o rifiuto la dashboard restava vecchia** (cache del router). Ora `app/members/requests/actions.ts` fa anche `revalidatePath("/dashboard")`.
- **Riga dell'appello con `flex-wrap`**: un nome lungo mandava i pulsanti a capo. Tolto il wrap; il nome è un elemento proprio con `line-clamp-2` e `[overflow-wrap:anywhere]`. Stessa correzione nel Registro.

## Decisioni prese

- **Username del superadmin su `platform_admin.username`**, scritto solo dalla funzione `set_platform_admin_username()` (definer, solo la propria riga). Scartato: una policy di update sulla tabella, perché quella riga è il privilegio stesso. Scartato: dare al superadmin una riga `person` (non deve appartenere a nessuna palestra).
- **Unicità dello username su tre tabelle** (`person`, `registration_request`, `platform_admin`) nel trigger `username_cross_unique`.
- **Dashboard superadmin solo con totali calcolati nel DB** (`platform_gym_activity`, `platform_weekly_presences`). Scartato: dati per persona, perché la piattaforma tratta i dati per conto delle palestre.
- **Presenze contate come nel grafico della palestra**: presente, lezione non annullata, così i numeri coincidono.
- **Periodi fissi** (30 giorni, 12 settimane). Scartato: selettore di periodo, nessuno l'ha chiesto.
- **Banner iscrizioni sulla dashboard**, non badge nella navbar (chiesto solo sulla Home).
- **QR da salvare come PNG 1024 px** con `<a download>` e nessuno script. Solo il QR, senza nome palestra (versione "poster" offerta, non fatta).
- **`/demo` via `mailto:`**. Scartato: un modulo di contatto, servirebbe un servizio di invio email che non c'è.
- **Landing con una sola animazione**, nessun effetto allo scroll. Tolto il badge "MVP in sviluppo".
- **Strategia demo**: prima una demo guidata su una palestra **fittizia** condotta da te, poi una prova con la palestra vera per 4–8 settimane. Scartato: un account demo condiviso lasciato ai potenziali clienti (verrebbe modificato da chiunque e va contro "no open signup").

## File toccati

- `frontend/app/page.tsx` — landing riscritta, demo appello, cinture, chiusura con link a `/demo`.
- `frontend/app/globals.css` — keyframes `.roll-demo__*` (lo stato a riposo è quello finale).
- `frontend/app/demo/page.tsx` — nuova pagina demo.
- `frontend/utils/mailto.ts` + `mailto.test.ts` — link `mailto:` codificato, righe CRLF.
- `frontend/components/step-belt.tsx` — marcatore dei passi a cintura, condiviso da home e demo.
- `frontend/utils/site.ts` — `PUBLIC_PATHS` con `/demo`, `DEMO_EMAIL`.
- `frontend/app/sitemap.ts` — priorità per `/demo`.
- `frontend/components/nav-shell.tsx` — voce demo per i visitatori; Dashboard per il superadmin; logo sempre a `/dashboard`.
- `frontend/app/layout.tsx` — etichetta `nav.demo`.
- `frontend/app/account/page.tsx`, `actions.ts` — sezione "Dati di accesso" del superadmin, `updatePlatformAccount`, helper condivisi per username ed email.
- `frontend/app/dashboard/page.tsx` — ramo superadmin, banner iscrizioni in attesa.
- `frontend/app/dashboard/platform-dashboard.tsx` — dashboard superadmin.
- `frontend/utils/supabase/require-admin.ts` — `/dashboard` in `PLATFORM_PATHS`, niente più redirect a `/gyms`.
- `frontend/app/members/requests/actions.ts` — revalidate di `/dashboard`.
- `frontend/app/gym/page.tsx` — "Salva immagine" del QR.
- `frontend/app/attendance/[id]/page.tsx`, `frontend/app/members/page.tsx` — nomi lunghi.
- `frontend/utils/i18n/dictionaries/{it,en,pt-BR}.ts` — sezioni `home`, `demo`, `platformDashboard`, chiavi nuove in `nav`, `account`, `dashboard`, `myGym`.
- `supabase/migrations/20261004000000_platform_admin_username.sql` — username superadmin.
- `supabase/migrations/20261004010000_platform_dashboard.sql` — funzioni della dashboard superadmin.
- `supabase/tests/tenant-isolation.sql` — test T23 e T24.
- `docs/claude/{frontend-ui,auth-and-access,gyms,database,attendance-and-dashboard}.md` — documentazione aggiornata.

## Dove vogliamo andare

1. **Scrivi `execution/seed_demo_gym.py`**: crea (o ricrea da zero) una palestra "Demo" con 20–30 persone dai nomi inventati, cinture adulti e bambini, ruoli (un head coach, istruttori, allievi), due o tre corsi, qualche mese di lezioni passate con presenze, e alcuni allievi oltre le soglie di promozione. Deve essere rieseguibile: prima di ogni demo riporta tutto allo stato iniziale. È il primo script di `execution/`: aggiungi anche `requirements.txt` (vedi `AGENT.md`).
2. Crea un account gestore per la palestra demo (temporaneo, da `/gyms`) per condurre la demo.
3. Scrivi la scaletta della demo, circa 30 minuti: registro con allievi pronti → appello dal telefono → check-in con QR → dashboard → vista dell'allievo.
4. Poi, prima di qualsiasi prova con una palestra reale: informativa privacy definitiva (oggi bozza con segnaposto; l'email di contatto può essere `contactdm.yt@gmail.com`) e bozza dell'accordo art. 28, da far validare a un consulente privacy.

## Da sapere prima di toccare qualcosa

- **Due migration da applicare a mano** su `poksgledkecwviypspmi` **prima del deploy**, se non l'hai già fatto: `20261004000000_platform_admin_username.sql` e `20261004010000_platform_dashboard.sql`. Senza, la pagina `/account` e la dashboard del superadmin falliscono.
- **Per lo script demo: indica sempre `gym_id` in ogni insert.** Il trigger `gym_scope` riempie `gym_id` dal chiamante; una scrittura senza utente (service role, SQL diretto) che non nomina la palestra finisce nella **prima palestra** (ASD Little Gym, quella vera). Vale per tutte le tabelle tranne `person`, dove l'insert senza palestra viene rifiutato (vedi `docs/claude/gyms.md`).
- **Cinture e tacche**: per un utente cambiano solo dentro `record_promotion()`. Il trigger salta il controllo quando non c'è un utente (`auth.uid()` nullo, service role), ma è più semplice e più chiaro impostarle già nell'insert della persona, insieme a `rank_since` e `stripe_since`.
- **Le lezioni passate non le genera l'app**: il salvataggio di un corso genera solo le prossime otto settimane, quindi lo script deve inserire direttamente `class_session` e `attendance`.
- **Per ricreare la palestra demo** basta cancellare la riga `gym`: la cancellazione a cascata elimina tutto il resto. Non toccare mai altre palestre.
- **Problema aperto, non risolto:** il banner cookie dice "nessun servizio di analisi" ma `app/layout.tsx` carica `<Analytics />` di Vercel. Va deciso se togliere Analytics o cambiare il banner.
- **Verifica database:** `bash supabase/tests/replay.sh --isolation`. Serve Docker Desktop avviato; se non risponde, avvialo prima.
