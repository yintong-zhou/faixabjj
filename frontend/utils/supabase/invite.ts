import "server-only";

import type { createAdminClient } from "@/utils/supabase/admin";
import { logDbError } from "@/utils/log";

// The gym an invite link belongs to, or null when the link is unknown,
// regenerated, or its gym suspended. Service role: gym_for_invite() is not
// executable by anyone else. The shape check spares the database every
// random string a crawler tries.
const TOKEN = /^[0-9a-f]{64}$/;

export async function gymForInvite(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
): Promise<string | null> {
  if (!TOKEN.test(token)) return null;
  const { data, error } = await admin.rpc("gym_for_invite", { p_token: token });
  if (error) logDbError("join", "gym_for_invite", error);
  return (data as string | null) ?? null;
}
