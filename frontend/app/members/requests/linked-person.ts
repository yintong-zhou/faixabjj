import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logDbError } from "@/utils/log";

export type LinkedPerson = { id: string; full_name: string };

// The account-less registry row that approval will link the account to: the
// auth trigger (handle_new_auth_user) links a new account to the oldest
// account-less person of the gym with the same email, case-insensitively,
// instead of creating a second row. Asked here, the same way, so the page can
// warn and the action can leave that row's rank alone. Through the user's
// client: RLS keeps it inside the caller's gym. Account-less rows are few (in
// practice, revoked members), so they are compared here rather than with a
// case-insensitive filter that would treat `_` in an address as a wildcard.
export async function accountlessPeople(supabase: SupabaseClient): Promise<(LinkedPerson & { email: string })[]> {
  const { data, error } = await supabase
    .from("person")
    .select("id, full_name, email")
    .is("auth_user_id", null)
    .not("email", "is", null)
    .order("created_at");
  if (error) logDbError("requests", "accountlessPeople", error);
  return (data ?? []) as (LinkedPerson & { email: string })[];
}

export function linkedPersonIn(
  people: (LinkedPerson & { email: string })[],
  email: string,
): LinkedPerson | null {
  const wanted = email.toLowerCase();
  return people.find((p) => p.email.toLowerCase() === wanted) ?? null;
}

export async function linkedPersonFor(supabase: SupabaseClient, email: string): Promise<LinkedPerson | null> {
  return linkedPersonIn(await accountlessPeople(supabase), email);
}
