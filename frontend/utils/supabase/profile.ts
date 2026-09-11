import type { SupabaseClient } from "@supabase/supabase-js";

// The profile *is* the registry row: `person.auth_user_id` already links an
// account to the unified student/instructor registry, so account management
// reuses it instead of introducing a second table that would drift from it.
export type Profile = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  current_belt: string;
  current_stripes: number;
  rank_since: string;
  stripe_since: string | null;
  joined_at: string;
  notes: string | null;
};

const PROFILE_COLUMNS =
  "id, auth_user_id, full_name, email, phone, birth_date, current_belt, current_stripes, rank_since, stripe_since, joined_at, notes";

// The on_auth_user_created trigger creates this row, but an account can
// predate the trigger (or the migration can be applied late), so the row is
// created on demand as a fallback rather than rendering a broken page.
export async function getOrCreateProfile(
  supabase: SupabaseClient,
  userId: string,
  email: string | null,
): Promise<Profile | null> {
  const { data } = await supabase
    .from("person")
    .select(PROFILE_COLUMNS)
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (data) {
    return data as Profile;
  }

  const fallbackName = email?.split("@")[0]?.trim() || "Nuovo utente";
  const { data: created } = await supabase
    .from("person")
    .insert({ auth_user_id: userId, full_name: fallbackName, email })
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  return (created as Profile | null) ?? null;
}

export const BELT_LABELS: Record<string, string> = {
  white: "Bianca",
  blue: "Blu",
  purple: "Viola",
  brown: "Marrone",
  black: "Nera",
};

export const ROLE_LABELS: Record<string, string> = {
  student: "Allievo",
  assistant: "Assistente",
  instructor: "Istruttore",
  head_coach: "Maestro",
  admin: "Admin",
};
