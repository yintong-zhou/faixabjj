"""Send one `welcome` email through notify-flow, the way the app does: async.

    python execution/notify_smoke.py you@example.com [it|en|pt-BR]

Queues the email (202 "queued"), then polls GET /v1/email/{id} for up to two
minutes and prints each status change: queued -> processing -> submitted, or
failed with its error_code. Prints statuses and the id, nothing else.
"submitted" means the SMTP server accepted it, not that it reached the inbox:
look in spam too. A "retrying" send keeps going for up to ~50 minutes after
this script stops; check it later with the printed id.
"""

import sys
import time

from notify_common import call, load_config

FINAL = {"submitted", "failed"}


def main():
    if len(sys.argv) < 2 or "@" not in sys.argv[1]:
        sys.exit(__doc__)
    to = sys.argv[1]
    locale = sys.argv[2] if len(sys.argv) > 2 else "en"

    url, key, env = load_config()
    status, data = call(
        "POST",
        f"{url}/v1/email/send",
        key,
        {
            "template": "welcome",
            "to": to,
            "locale": locale,
            "variables": {"appName": env.get("NOTIFY_FLOW_APP_NAME") or "Faixa BJJ", "name": "test"},
        },
        # New key per run: each run is a new send on purpose.
        {"Idempotency-Key": f"smoke:{int(time.time())}", "Prefer": "respond-async"},
    )
    data = data or {}
    if status not in (200, 202) or "id" not in data:
        print(status, (data.get("error") or {}).get("code", "no body"))
        sys.exit(1)

    message_id, last = data["id"], data.get("status")
    print(status, message_id, last)
    deadline = time.time() + 120
    while last not in FINAL and time.time() < deadline:
        time.sleep(5)
        code, state = call("GET", f"{url}/v1/email/{message_id}", key)
        state = state or {}
        current = state.get("status") or (state.get("error") or {}).get("code", f"http {code}")
        if current != last:
            print(current, state.get("error_code") or "")
            last = current
    sys.exit(0 if last == "submitted" else 1)


if __name__ == "__main__":
    main()
