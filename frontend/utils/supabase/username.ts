import "server-only";

import type { createAdminClient } from "@/utils/supabase/admin";
import { logDbError } from "@/utils/log";
import { isValidUsername, withSuffix } from "@/utils/username";

// Usernames are unique across every gym, so "mario.rossi" is often taken
// already — by somebody the maestro cannot even see. A collision is therefore
// never an error at creation: the first free of wanted, wanted2, wanted3… is
// written, and returned so it can be shown with the temporary password.
//
// Service role: the caller has already checked, on their own client, that the
// row is theirs (personInMyGym / the gym lookup); this only writes the column.
const MAX_TRIES = 50;

export async function claimUsername(
  admin: ReturnType<typeof createAdminClient>,
  personId: string,
  wanted: string,
): Promise<string | null> {
  if (!isValidUsername(wanted)) return null;
  for (let n = 1; n <= MAX_TRIES; n++) {
    const candidate = withSuffix(wanted, n);
    const { data, error } = await admin
      .from("person")
      .update({ username: candidate })
      .eq("id", personId)
      .select("id");
    if (!error) {
      if (data && data.length > 0) return candidate;
      logDbError("members", "claimUsername", { code: "no-rows", message: "person row not found" });
      return null;
    }
    // 23505 = unique_violation: taken, try the next number.
    if (error.code !== "23505") {
      logDbError("members", "claimUsername", error);
      return null;
    }
  }
  logDbError("members", "claimUsername", {
    code: "exhausted",
    message: `no free username after ${MAX_TRIES} tries`,
  });
  return null;
}
