import "server-only";

// Cloudflare Turnstile.
//
// Where the verification happens, and why it is not here. Supabase Auth has
// its own CAPTCHA protection (Authentication → Attack Protection), which holds
// the Turnstile secret and calls siteverify itself before it will answer
// /auth/v1/token or /auth/v1/recover. This app's job is therefore to draw the
// widget and hand the token to Supabase — not to verify it.
//
// The first version of this file did verify it, with siteverify in the server
// action, and that is the canonical shape when the backend is your own. It is
// wrong here for one reason: a Turnstile token is redeemed exactly once. Our
// check consumed it, Supabase then received a request with no token and
// refused with `captcha_failed`, which the login form reported as "wrong
// credentials" — right password, refused, no explanation.
//
// Of the two possible single checks, Supabase's is the better one to keep.
// Ours guarded our form; anyone can skip the form and POST straight at the
// Supabase endpoint, which is where the credentials actually are. What is lost
// is the `action` and `hostname` binding, which GoTrue does not check: a token
// solved on a copy of our page would be accepted. That still costs the
// attacker one solved challenge per attempt, which is what a challenge is for.

// Public by design — it is printed in the HTML of every page that draws the
// widget. The secret is not here at all: it lives in Supabase's dashboard.
export const SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY ?? "";

export function isTurnstileConfigured(): boolean {
  return SITEKEY !== "";
}

/**
 * The token the widget put in the form, ready to hand to Supabase.
 *
 * Returns undefined when there is none, which is what an unconfigured local
 * checkout produces. Nothing here decides whether that is acceptable: if
 * Supabase requires a captcha it refuses the call itself, so a deployment that
 * lost its sitekey fails closed without this file having an opinion.
 */
export function turnstileToken(formData: FormData): string | undefined {
  const token = formData.get("cf-turnstile-response");
  // Bounded before it travels any further: an unbounded string from a crafted
  // POST is not worth forwarding.
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return undefined;
  }
  return token;
}
