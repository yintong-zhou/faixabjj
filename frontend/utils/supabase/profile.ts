import type { SupabaseClient } from "@supabase/supabase-js";

import { en } from "../i18n/dictionaries/en";
import type { Dictionary } from "../i18n/dictionaries/it";

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

export function beltLabels(t: Dictionary = en): Record<string, string> {
  return {
    white: t.belts.white,
    blue: t.belts.blue,
    purple: t.belts.purple,
    brown: t.belts.brown,
    black: t.belts.black,
  };
}

export function beltLabel(belt: string, t: Dictionary = en): string {
  return beltLabels(t)[belt] ?? belt;
}

// The order belts are awarded in — white through black. BELT_LABELS' key order
// happens to match today, but relying on an object literal's shape for a domain
// rule is how it silently stops matching.
export const BELT_ORDER = ["white", "blue", "purple", "brown", "black"] as const;

export function beltRank(belt: string): number {
  const index = (BELT_ORDER as readonly string[]).indexOf(belt);
  // An unknown belt sorts last rather than first: it is a data problem, and
  // putting it at the top of every roll call would be a daily annoyance.
  return index === -1 ? BELT_ORDER.length : index;
}

export function roleLabels(t: Dictionary = en): Record<string, string> {
  return {
    student: t.roles.student,
    assistant: t.roles.assistant,
    instructor: t.roles.instructor,
    head_coach: t.roles.head_coach,
    admin: t.roles.admin,
  };
}

export function roleLabel(role: string, t: Dictionary = en): string {
  return roleLabels(t)[role] ?? role;
}
