import Script from "next/script";

import { getLocale } from "@/utils/i18n/server";
import { SITEKEY, isTurnstileConfigured } from "@/utils/turnstile";

// The Turnstile widget, drawn inside the form it protects.
//
// Implicit rendering: the script finds every `.cf-turnstile` on the page and
// puts its token in a hidden `cf-turnstile-response` input, which a normal
// form submission carries to the server action like any other field. No client
// component and no state — the same reason the language switcher is built from
// <details> rather than from React state.
//
// It renders nothing at all when no sitekey is configured, so a local checkout
// with no Cloudflare account still shows a usable form. What happens on the
// server in that case is decided in utils/turnstile.ts, and in production it
// is a refusal.
const LANGUAGE: Record<string, string> = {
  it: "it",
  en: "en",
  "pt-BR": "pt-br",
};

export async function Turnstile({ action }: { action: string }) {
  if (!isTurnstileConfigured()) return null;

  const locale = await getLocale();

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
      />
      <div
        className="cf-turnstile"
        data-sitekey={SITEKEY}
        // Checked server-side against this exact string. A token solved on one
        // surface is then useless on the other.
        data-action={action}
        data-language={LANGUAGE[locale] ?? "en"}
        // Follows the system preference. It cannot follow this app's manual
        // toggle: the widget is drawn inside a Cloudflare iframe, which our
        // stylesheet and our `data-theme` attribute do not reach.
        data-theme="auto"
      />
    </>
  );
}
