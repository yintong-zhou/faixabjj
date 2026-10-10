"""Shared by the notify_*.py scripts: configuration and one HTTP call.

Reads NOTIFY_FLOW_URL and NOTIFY_FLOW_API_KEY from frontend/.env.local (the
environment wins). Never prints the key.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def load_config():
    env = {}
    path = Path(__file__).resolve().parent.parent / "frontend" / ".env.local"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and not key.strip().startswith("#"):
                env[key.strip()] = value.strip().strip('"')
    env.update(os.environ)
    url, key = env.get("NOTIFY_FLOW_URL", "").rstrip("/"), env.get("NOTIFY_FLOW_API_KEY", "")
    if not url or not key:
        sys.exit("Missing NOTIFY_FLOW_URL or NOTIFY_FLOW_API_KEY (frontend/.env.local or environment).")
    return url, key, env


def call(method, url, key, body, headers=None):
    """Returns (status, parsed JSON or None). 30 s timeout, as in the app."""
    request = urllib.request.Request(
        url,
        method=method,
        data=json.dumps(body).encode("utf-8"),
        # Cloudflare (error 1010) rejects urllib's default User-Agent.
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": "faixabjj-execution/1.0", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.load(error)
        except ValueError:
            return error.code, None
