# Execution

Script Python deterministici — Livello 3 dell'architettura descritta in [`AGENT.md`](../AGENT.md).

Gestiscono chiamate API, elaborazione dati, operazioni su file, interazioni con database. Prima di scriverne uno nuovo, verificare che non ne esista già uno adatto qui.

| Script | Cosa fa |
| --- | --- |
| `seed_demo_gym.py` | Crea da zero la palestra fittizia "Accademia Demo BJJ" (cancella la precedente e i suoi account): 20 persone (nomi italiani, inglesi e brasiliani), corsi, 16 settimane di presenze, 5 allievi pronti per una promozione, account `demo.coach` e `demo.allievo`. `--delete` la rimuove soltanto. Password da `DEMO_PASSWORD` o dal prompt. |
| `notify_templates.py` | Carica su notify-flow i template email personalizzati (`email-change`, `email-changed`) in it/en/pt-BR. Idempotente: rilanciarlo riscrive lo stesso testo. |
| `notify_smoke.py` | Mette in coda un'email `welcome` all'indirizzo passato come argomento, in modalità asincrona come l'app, e segue lo stato con `GET /v1/email/{id}` fino a `submitted` o `failed` (al massimo 2 minuti). Stampa solo id e stati. |

Prerequisiti: Python 3.12+, `frontend/.env.local` con `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SECRET_KEY` (seed), `NOTIFY_FLOW_URL` e `NOTIFY_FLOW_API_KEY` (notify_*). `notify_common.py` è il codice condiviso dai due script notify.
