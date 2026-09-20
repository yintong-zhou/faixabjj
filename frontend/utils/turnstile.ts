import "server-only";

import { headers } from "next/headers";

import { logDbError } from "@/utils/log";

// Cloudflare Turnstile, server side.
//
// The contract is the one Cloudflare documents and it is not negotiable in
// either direction: the browser solves the challenge and posts the resulting
// token to our own handler, and the handler is what calls siteverify. The
// browser never calls siteverify itself — it holds no secret, and a check a
// client performs on its own behalf is not a check.
//
// The token is single-use: siteverify redeems it exactly once. Both protected
// surfaces redirect on every outcome, success and failure alike, so the page
// remounts with a fresh widget and no reset logic is needed.

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// The sitekey is public by design — it is printed in the HTML of every page
// that draws the widget — so it carries NEXT_PUBLIC_. The secret must never.
export const SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY ?? "";

const SECRET = process.env.TURNSTILE_SECRET ?? "";

// The hostnames siteverify is allowed to report back. One widget is registered
// for localhost, 127.0.0.1 and the production domain, and the check that keeps
// that safe is each deployment naming only its own: a production value must
// never contain localhost, or a token solved on somebody's laptop would be
// accepted by the live site.
const HOSTNAMES = new Set(
  (process.env.TURNSTILE_HOSTNAMES ?? "")
    .split(",")
    .map((hostname) => hostname.trim())
    .filter(Boolean),
);

export function isTurnstileConfigured(): boolean {
  return SITEKEY !== "" && SECRET !== "" && HOSTNAMES.size > 0;
}

// What an unconfigured deployment does, which is the one decision here that is
// ours rather than Cloudflare's.
//
// In production a missing key is a failure, never a pass: a deploy that lost
// its environment variables would otherwise keep serving the login form with
// no widget and no verification, looking exactly like a protected one. In
// development it is a skip, because the alternative is that nobody can run the
// app locally without a Cloudflare account — the same trade `admin.ts` makes
// for the service-role key, and the reason the widget renders nothing when
// there is no sitekey.
const REQUIRED = process.env.NODE_ENV === "production";

/**
 * Verifies a Turnstile token for one surface.
 *
 * Returns true when the request may proceed. The caller decides what a refusal
 * looks like; nothing from Cloudflare reaches the screen, for the same reason
 * database error text never does.
 */
export async function verifyTurnstile(
  formData: FormData,
  expectedAction: string,
): Promise<boolean> {
  if (!isTurnstileConfigured()) {
    if (REQUIRED) {
      logDbError("turnstile", expectedAction, {
        code: "not-configured",
        message:
          "NEXT_PUBLIC_TURNSTILE_SITEKEY, TURNSTILE_SECRET or TURNSTILE_HOSTNAMES is missing in production",
      });
      return false;
    }
    return true;
  }

  const token = formData.get("cf-turnstile-response");
  // Bounded before it is sent: an unbounded string from a crafted POST is not
  // worth a round trip to Cloudflare.
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return false;
  }

  // Vercel puts the visitor's address at the head of x-forwarded-for. It is a
  // hint for Cloudflare's scoring, not something this code trusts.
  const headersList = await headers();
  const remoteip = (headersList.get("x-forwarded-for") ?? "").split(",")[0].trim();

  let result: {
    success?: boolean;
    action?: string;
    hostname?: string;
    "error-codes"?: string[];
  };

  try {
    const body = new URLSearchParams({ secret: SECRET, response: token });
    if (remoteip) body.set("remoteip", remoteip);

    const response = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      // A challenge service that has stopped answering must not hold a login
      // form open indefinitely.
      signal: AbortSignal.timeout(10_000),
      body,
    });
    if (!response.ok) throw new Error(`siteverify ${response.status}`);
    result = await response.json();
  } catch (cause) {
    logDbError("turnstile", expectedAction, {
      code: "siteverify-unreachable",
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return false;
  }

  // All three, together. `success` alone would let a token solved on the
  // password-reset widget be replayed against the login form, and a token
  // solved on a copy of the page hosted elsewhere be replayed against ours.
  const ok =
    result.success === true &&
    result.action === expectedAction &&
    typeof result.hostname === "string" &&
    HOSTNAMES.has(result.hostname);

  if (!ok) {
    logDbError("turnstile", expectedAction, {
      code: (result["error-codes"] ?? []).join(",") || "rejected",
      message: `action=${result.action ?? "-"} hostname=${result.hostname ?? "-"}`,
    });
  }

  return ok;
}
