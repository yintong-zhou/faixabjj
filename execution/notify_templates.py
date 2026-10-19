"""Upload the custom notify-flow templates the app uses, in every language.

    python execution/notify_templates.py

Idempotent: PUT replaces a template, so running it again only rewrites the
same text.
It also overwrites whatever the superadmin edited for these two emails on
/email in the app: run it only to reset them to the text below. The other emails (welcome, password-reset, password-changed) use
notify-flow's built-in templates and are not uploaded.

Fixed copy lives here; variables carry only what changes. Each placeholder
must be declared in `variables`, and the app must send exactly those
(utils/account-emails.ts):
- email-change:  appName, name, confirmUrl  — to the new address
- email-changed: appName, name, newEmail    — to the old address
"""

import sys

from notify_common import call, load_config

LAYOUT = (
    '<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;'
    'font-family:Arial,Helvetica,sans-serif;color:#1f2933;line-height:1.5">'
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">{body}</div>'
    '<p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#7b8794;text-align:center">{{{{appName}}}}</p>'
    "</body></html>"
)


def button(url, label):
    return (
        f'<p style="margin:24px 0"><a href="{url}" style="display:inline-block;padding:12px 20px;'
        f'background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px">{label}</a></p>'
    )


def template(variables, subject, paragraphs, action=None):
    """paragraphs: list of strings; action: (label) for a {{confirmUrl}} button after the first."""
    html = [f"<p>{p}</p>" for p in paragraphs]
    text = list(paragraphs)
    if action:
        html.insert(2, button("{{confirmUrl}}", action))
        text.insert(2, "{{confirmUrl}}")
    return {
        "variables": variables,
        "subject": subject,
        "html": LAYOUT.format(body="".join(html)),
        "text": "\n\n".join(text),
    }


CHANGE = ["appName", "name", "confirmUrl"]
CHANGED = ["appName", "name", "newEmail"]

TEMPLATES = {
    "email-change": {
        "en": template(CHANGE, "Confirm your new email for {{appName}}", [
            "Hi {{name}},",
            "Confirm this address as the new email of your {{appName}} account. The link is valid for 30 minutes and works once.",
            "If you didn't ask for this, ignore this email: nothing will change.",
        ], "Confirm email"),
        "it": template(CHANGE, "Conferma la nuova email per {{appName}}", [
            "Ciao {{name}},",
            "Conferma questo indirizzo come nuova email del tuo account {{appName}}. Il link vale 30 minuti e si può usare una sola volta.",
            "Se non l'hai chiesto tu, ignora questa email: non cambierà nulla.",
        ], "Conferma email"),
        "pt-BR": template(CHANGE, "Confirme seu novo e-mail no {{appName}}", [
            "Olá, {{name}},",
            "Confirme este endereço como o novo e-mail da sua conta {{appName}}. O link vale por 30 minutos e pode ser usado uma única vez.",
            "Se não foi você, ignore este e-mail: nada será alterado.",
        ], "Confirmar e-mail"),
    },
    "email-changed": {
        "en": template(CHANGED, "Your {{appName}} email was changed", [
            "Hi {{name}},",
            "The email of your {{appName}} account was changed to {{newEmail}}. From now on, sign-in and messages use that address.",
            "If you didn't do this, contact your gym right away.",
        ]),
        "it": template(CHANGED, "L'email di {{appName}} è stata cambiata", [
            "Ciao {{name}},",
            "L'email del tuo account {{appName}} è stata cambiata in {{newEmail}}. Da ora l'accesso e i messaggi usano quell'indirizzo.",
            "Se non sei stato tu, contatta subito la tua palestra.",
        ]),
        "pt-BR": template(CHANGED, "Seu e-mail do {{appName}} foi alterado", [
            "Olá, {{name}},",
            "O e-mail da sua conta {{appName}} foi alterado para {{newEmail}}. A partir de agora, o acesso e as mensagens usam esse endereço.",
            "Se não foi você, entre em contato com sua academia imediatamente.",
        ]),
    },
}


def main():
    url, key, _ = load_config()
    failed = False
    for name, locales in TEMPLATES.items():
        for locale, body in locales.items():
            status, data = call("PUT", f"{url}/v1/templates/{name}/{locale}", key, body)
            code = "ok" if status == 200 else ((data or {}).get("error") or {}).get("code", "error")
            print(f"{name}/{locale}: {status} {code}")
            failed = failed or status != 200
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
