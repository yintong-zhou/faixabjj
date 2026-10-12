import { createHmac, timingSafeEqual } from "node:crypto";

// The links this app emails — password reset and email change — and the only
// place they are made and checked. Supabase issues none of them.
//
// Stateless on purpose (no table, no migration): the token carries its own
// expiry and is signed with AUTH_LINK_SECRET, so it cannot be forged or
// stretched. Single use comes from `b`, a value the action it unlocks
// changes:
// - reset: the auth user's updated_at, which the password change moves;
// - email: the current address, which the change replaces.
// Once used, the account no longer matches and the link is dead. The cost is
// that anything else touching the account first kills it too — the reader
// asks for a new one — and that a link cannot be revoked, only outlived.
//
// The payload is signed, not encrypted: it holds the user id and, for an
// email change, both addresses. It only ever goes to that user's own inbox.

export type LinkKind = "reset" | "email";

export type LinkPayload = {
  k: LinkKind;
  u: string; // auth user id
  b: string; // the binding described above
  e?: string; // email change only: the new address
  x: number; // expiry, unix seconds
};

/** 30 minutes, for both kinds. */
export const LINK_TTL_SECONDS = 30 * 60;

const MIN_SECRET_LENGTH = 32;

/** The signing secret, or null when it is missing or too short to trust. */
export function linkSecret(): string | null {
  const secret = process.env.AUTH_LINK_SECRET;
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

const mac = (body: string, secret: string) =>
  createHmac("sha256", secret).update(body).digest("base64url");

export function signLink(
  payload: Omit<LinkPayload, "x">,
  secret: string,
  now = Date.now(),
): string {
  const full: LinkPayload = { ...payload, x: Math.floor(now / 1000) + LINK_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${body}.${mac(body, secret)}`;
}

/** The payload of a genuine, unexpired link of this kind; null otherwise. */
export function readLink(
  token: unknown,
  kind: LinkKind,
  secret: string,
  now = Date.now(),
): LinkPayload | null {
  // Bounded before anything else: it arrives in a URL anyone can write.
  if (typeof token !== "string" || token.length > 2048) return null;
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length > 0) return null;

  const expected = Buffer.from(mac(body, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let payload: LinkPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload?.k !== kind || typeof payload.x !== "number" || payload.x * 1000 <= now) return null;
  return payload;
}
