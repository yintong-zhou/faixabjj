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

// The roles a person holds right now — an assignment with no end date. Used
// wherever the app has to tell a portal-only admin from somebody who trains;
// the roles themselves are the answer, not the access flags, since a head
// coach holds every flag an admin does.
export async function activeRoles(
  supabase: SupabaseClient,
  personId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("assigned_role")
    .select("role")
    .eq("person_id", personId)
    .is("end_date", null);

  return ((data ?? []) as { role: string }[]).map((r) => r.role);
}

export function beltLabels(t: Dictionary = en): Record<string, string> {
  return {
    white: t.belts.white,
    gray_white: t.belts.gray_white,
    gray: t.belts.gray,
    gray_black: t.belts.gray_black,
    yellow_white: t.belts.yellow_white,
    yellow: t.belts.yellow,
    yellow_black: t.belts.yellow_black,
    orange_white: t.belts.orange_white,
    orange: t.belts.orange,
    orange_black: t.belts.orange_black,
    green_white: t.belts.green_white,
    green: t.belts.green,
    green_black: t.belts.green_black,
    blue: t.belts.blue,
    purple: t.belts.purple,
    brown: t.belts.brown,
    black: t.belts.black,
  };
}

export function beltLabel(belt: string, t: Dictionary = en): string {
  return beltLabels(t)[belt] ?? belt;
}

// There are two ladders, not one, and they share their first rung.
//
// An adult starts white and goes to blue. A child starts white and works
// through the four IBJJF colour groups — grey, yellow, orange, green, each with
// a white, a plain and a black variant — and only converts to an adult belt at
// 16. belt-criteria.md carries both. Modelling them as a single 17-step line
// would mean suggesting a grey belt to an adult white belt, which is why
// nextStep() in utils/promotion.ts picks the ladder rather than walking
// BELT_ORDER.
export const ADULT_BELTS = ["white", "blue", "purple", "brown", "black"] as const;

export const KID_BELTS = [
  "white",
  "gray_white",
  "gray",
  "gray_black",
  "yellow_white",
  "yellow",
  "yellow_black",
  "orange_white",
  "orange",
  "orange_black",
  "green_white",
  "green",
  "green_black",
] as const;

// The artwork files say "gray", so the enum does too — the rule established
// when the purple belts were renamed is that the enum value *is* the filename,
// with `_` written as `-`. belt-criteria.md spells the colour "grey" in prose;
// that is the English word, not an identifier, and the two do not have to
// match.

// Every belt in display order: white, then the children's colours, then the
// adult belts. This is what sorts a roll call and lays out the belt chart, and
// it is deliberately NOT the promotion ladder — see ADULT_BELTS / KID_BELTS.
// Relying on beltLabels()' key order for a domain rule is how it silently
// stops matching, so the order is written out here.
export const BELT_ORDER = [
  "white",
  "gray_white",
  "gray",
  "gray_black",
  "yellow_white",
  "yellow",
  "yellow_black",
  "orange_white",
  "orange",
  "orange_black",
  "green_white",
  "green",
  "green_black",
  "blue",
  "purple",
  "brown",
  "black",
] as const;

/** True for a belt that exists only on the children's ladder. */
export function isKidBelt(belt: string): boolean {
  return (
    (KID_BELTS as readonly string[]).includes(belt) &&
    !(ADULT_BELTS as readonly string[]).includes(belt)
  );
}

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
