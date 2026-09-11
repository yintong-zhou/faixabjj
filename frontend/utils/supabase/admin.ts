// Service-role Supabase client. Creating, inviting and deleting auth users is
// impossible with the publishable key, so these operations need the secret key.
//
// `server-only` makes importing this from a Client Component a build error:
// the key below bypasses Row Level Security entirely, so it must never be
// bundled for the browser. Note the missing NEXT_PUBLIC_ prefix — that is
// deliberate, not an omission.
import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

export class MissingSecretKeyError extends Error {
  constructor() {
    super(
      "SUPABASE_SECRET_KEY non è configurata: la gestione utenti è disattivata.",
    );
    this.name = "MissingSecretKeyError";
  }
}

export const isAdminClientConfigured = () => Boolean(supabaseUrl && secretKey);

export function createAdminClient() {
  if (!supabaseUrl || !secretKey) {
    throw new MissingSecretKeyError();
  }

  return createSupabaseClient(supabaseUrl, secretKey, {
    // There is no user session on this client — it acts as the service role,
    // so refreshing or persisting tokens would be meaningless.
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
