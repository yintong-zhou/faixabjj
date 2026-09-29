import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";
import { logDbError } from "@/utils/log";

// The email to sign in with for a username, or null. Service role, because the
// caller is not signed in yet and RLS would show them nothing; the address
// never leaves the server — the login action passes it straight to
// signInWithPassword. The account's own email, not person.email, which is a
// convenience copy and may lag behind a change still awaiting confirmation.
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

  const { data, error } = await admin
    .from("person")
    .select("auth_user_id")
    .eq("username", username)
    .not("auth_user_id", "is", null)
    .maybeSingle();
  if (error) {
    logDbError("login", "emailForUsername:person", error);
    return null;
  }
  const authUserId = (data as { auth_user_id: string | null } | null)?.auth_user_id;
  if (!authUserId) return null;

  const { data: found, error: userError } = await admin.auth.admin.getUserById(authUserId);
  if (userError) {
    logDbError("login", "emailForUsername:user", {
      code: userError.code ?? null,
      message: userError.message,
    });
    return null;
  }
  return found.user?.email ?? null;
}
