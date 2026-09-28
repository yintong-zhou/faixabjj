// Carries a freshly drawn temporary password from the action that set it to the
// page that shows it once — in a short-lived httpOnly cookie, never in the URL.
// The other messages ride in `?ok=`, but a URL lands in the browser history of
// the gym's shared computer and in the host's request logs, and this one opens
// an account until its first login.
//
// The redirect carries only a random `pw` id. The page shows the password only
// when that id matches the cookie's, so it appears on the redirect it belongs
// to and on a reload of it, and not beside some later, unrelated message while
// the cookie is still alive.
import "server-only";

import { cookies } from "next/headers";

const COOKIE = "faixa_temp_password";
const MAX_AGE_SECONDS = 300;

export type TemporaryPasswordFlash = { email: string; password: string };

export async function flashTemporaryPassword(flash: TemporaryPasswordFlash): Promise<string> {
  const id = globalThis.crypto.randomUUID();
  (await cookies()).set(COOKIE, Buffer.from(JSON.stringify({ id, ...flash })).toString("base64url"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return id;
}

export async function readTemporaryPassword(
  id: string | undefined,
): Promise<TemporaryPasswordFlash | null> {
  if (!id) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      id?: unknown;
      email?: unknown;
      password?: unknown;
    };
    if (parsed.id !== id || typeof parsed.email !== "string" || typeof parsed.password !== "string") {
      return null;
    }
    return { email: parsed.email, password: parsed.password };
  } catch {
    return null;
  }
}
