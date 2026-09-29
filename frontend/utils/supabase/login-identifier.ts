import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";
import { logDbError } from "@/utils/log";

// The email to sign in with for a username, or null. Service role, because the
// caller is not signed in yet and RLS would show them nothing; the address
// never leaves the server — the login action passes it straight to
// signInWithPassword. The account's own email, not person.email, which is a
// convenience copy and may lag behind a change still awaiting confirmation.
//
// One RPC, login_email_for_username (20260930000000), whether or not the
// username exists: two requests only when it did would let the response time
// tell a taken username from a free one.
export async function emailForUsername(username: string): Promise<string | null> {
  let admin;
  try {
    admin = createAdminClient();
  } catch (cause) {
    logDbError("login", "emailForUsername:admin", {
      code: "no-admin-client",
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return null;
  }

  const { data, error } = await admin.rpc("login_email_for_username", {
    p_username: username,
  });
  if (error) {
    logDbError("login", "emailForUsername", error);
    return null;
  }
  return typeof data === "string" && data ? data : null;
}
