"""Send one `welcome` email through notify-flow, to check the whole chain.

    python execution/notify_smoke.py you@example.com [it|en|pt-BR]

Prints the HTTP status and the message id or error code, nothing else.
"submitted" means the SMTP server accepted it, not that it reached the inbox:
look in spam too.
"""

import sys
import time

from notify_common import call, load_config


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
        {"Idempotency-Key": f"smoke:{int(time.time())}"},
    )
    data = data or {}
    print(status, data.get("id") or (data.get("error") or {}).get("code", "no body"))
    sys.exit(0 if status == 200 else 1)


if __name__ == "__main__":
    main()
