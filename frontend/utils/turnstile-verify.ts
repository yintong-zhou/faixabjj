import "server-only";

// Server-side Turnstile check for the forms Supabase cannot protect. Login
// hands the token to Supabase, which verifies it (utils/turnstile.ts explains
// why the app must not verify it too). Two forms never reach Supabase Auth's
// public endpoints, so no Supabase check runs and this one is the only one:
// - the invite signup creates its account with the service role instead of
//   signUp() — the public signup endpoint stays disabled, or anyone could skip
//   the invite;
// - the password-reset request makes its own link and sends it through
//   notify-flow (utils/notify-flow.ts) instead of resetPasswordForEmail().
//
// Fails closed: no secret configured, no token, or Cloudflare unreachable
// means "not verified". For local development use Cloudflare's test keys
// (sitekey 1x00000000000000000000AA, secret 1x0000000000000000000000000000000AA).
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("[turnstile] TURNSTILE_SECRET_KEY is not set: request refused");
    return false;
  }
  if (!token) return false;

  try {
    const response = await fetch(SITEVERIFY, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    const body = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
    if (body.success !== true) {
      console.error(`[turnstile] refused: ${(body["error-codes"] ?? []).join(",")}`);
    }
    return body.success === true;
  } catch (cause) {
    console.error("[turnstile] siteverify failed", cause);
    return false;
  }
}
