// Service-role Supabase client. Creating, inviting and deleting auth users is
// impossible with the publishable key, so these operations need the secret key.
//
// `server-only` makes importing this from a Client Component a build error:
// the key below bypasses Row Level Security entirely, so it must never be
// bundled for the browser. Note the missing NEXT_PUBLIC_ prefix — that is
// deliberate, not an omission.
import "server-only";

import { createClient as createSupabaseClient, type User } from "@supabase/supabase-js";
import { linkSecret, readLink, type LinkKind, type LinkPayload } from "@/utils/auth-link-token";

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

/**
 * The auth account with exactly this email, or null. Every account counts —
 * members, pending signups and the superadmin, who have no person row.
 *
 * Auth's admin list takes a `filter` (a substring match on the email) that
 * supabase-js does not expose, hence the plain fetch; the exact, case-blind
 * comparison is made here. Throws when the lookup itself fails.
 */
export async function findAuthUserByEmail(email: string): Promise<User | null> {
  if (!supabaseUrl || !secretKey) {
    throw new MissingSecretKeyError();
  }

  const wanted = email.trim().toLowerCase();
  const query = new URLSearchParams({ filter: wanted, page: "1", per_page: "50" });
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?${query}`, {
    headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`admin users lookup failed: ${response.status}`);
  }

  const { users } = (await response.json()) as { users: User[] };
  return users.find((user) => user.email?.toLowerCase() === wanted) ?? null;
}

/**
 * The account an emailed link (utils/auth-link-token.ts) is good for, or null
 * when the link is forged, expired, of another kind or already used — used
 * meaning the account no longer matches what the link was bound to.
 */
export async function accountForLink(
  token: unknown,
  kind: LinkKind,
): Promise<{ user: User; link: LinkPayload } | null> {
  const secret = linkSecret();
  const link = secret ? readLink(token, kind, secret) : null;
  if (!link) return null;

  const { data, error } = await createAdminClient().auth.admin.getUserById(link.u);
  if (error || !data.user) return null;

  const bound = kind === "reset" ? data.user.updated_at : data.user.email;
  return bound === link.b ? { user: data.user, link } : null;
}

/**
 * The name an email greets the account by: its person row, else the
 * superadmin's username, else the name given at signup, else nothing (the
 * templates read fine with an empty name).
 */
export async function accountName(user: User): Promise<string> {
  const admin = createAdminClient();
  const [{ data: person }, { data: platform }] = await Promise.all([
    admin.from("person").select("full_name").eq("auth_user_id", user.id).maybeSingle(),
    admin.from("platform_admin").select("username").eq("auth_user_id", user.id).maybeSingle(),
  ]);
  const signup = (user.user_metadata as { full_name?: unknown } | null)?.full_name;
  return person?.full_name ?? platform?.username ?? (typeof signup === "string" ? signup : "");
}
