import { ageOn } from "./dates";
import { ADULT_BELTS, BELT_ORDER, KID_BELTS, isKidBelt } from "./supabase/profile";
import { isValidUsername, normalizeUsername } from "./username";

// The one place a self-registration is validated — the public form's action
// and the staff's approval both go through it, so the two cannot drift. Pure:
// fields arrive through a getter (FormData in the actions, a plain object in
// the tests) and "today" is the gym's, passed in.

export type RegistrationError =
  | "nameRequired"
  | "emailInvalid"
  | "usernameInvalid"
  | "passwordTooShort"
  | "passwordMismatch"
  | "birthDateInvalid"
  | "joinedAtInvalid"
  | "dateInvalid"
  | "dateInFuture"
  | "experienceRequired"
  | "beltInvalid"
  | "beltForAge"
  | "stripesInvalid"
  | "stripeBeforeBelt"
  | "consentRequired";

export type Registration = {
  fullName: string;
  email: string;
  username: string;
  /** Null in approval mode: the athlete chose it at signup and staff never see it. */
  password: string | null;
  birthDate: string;
  joinedAt: string;
  belt: string;
  stripes: number;
  rankSince: string;
  stripeSince: string;
};

export type FieldGetter = (key: string) => string | null;

export const PASSWORD_MIN = 8;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "2026-02-30" passes the pattern; the round trip through Date catches it.
function isoDate(value: string | null): string | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

// IBJJF: children's belts until 15, adult belts from 16 — but a 16- or
// 17-year-old may still be wearing the green belt they have not converted yet.
// Unknown age (never at signup: the birth date is required) counts as adult,
// like everywhere else in the app.
export function beltsForAge(age: number | null): readonly string[] {
  if (age !== null && age < 16) return KID_BELTS;
  if (age !== null && age < 18) return BELT_ORDER;
  return ADULT_BELTS;
}

type Result = { ok: true; value: Registration } | { ok: false; error: RegistrationError };

const fail = (error: RegistrationError): Result => ({ ok: false, error });

export function parseRegistration(get: FieldGetter, today: string, mode: "signup" | "approval"): Result {
  const field = (key: string) => get(key)?.trim() || null;

  const fullName = field("full_name");
  if (!fullName) return fail("nameRequired");

  const email = field("email")?.toLowerCase() ?? null;
  if (!email || !EMAIL.test(email)) return fail("emailInvalid");

  const username = normalizeUsername(get("username") ?? "");
  if (!isValidUsername(username)) return fail("usernameInvalid");

  let password: string | null = null;
  if (mode === "signup") {
    // Not trimmed: a space is a legitimate password character.
    password = get("password") ?? "";
    if (password.length < PASSWORD_MIN) return fail("passwordTooShort");
    if (password !== (get("password_repeat") ?? "")) return fail("passwordMismatch");
    if (get("privacy") !== "on") return fail("consentRequired");
  }

  const birthDate = isoDate(field("birth_date"));
  if (!birthDate || birthDate >= today) return fail("birthDateInvalid");

  const joinedAt = isoDate(field("joined_at"));
  if (!joinedAt) return fail("joinedAtInvalid");
  if (joinedAt > today) return fail("dateInFuture");

  const experienced = field("experienced");
  if (experienced !== "yes" && experienced !== "no") return fail("experienceRequired");

  if (experienced === "no") {
    return {
      ok: true,
      value: { fullName, email, username, password, birthDate, joinedAt, belt: "white", stripes: 0, rankSince: joinedAt, stripeSince: joinedAt },
    };
  }

  const belt = field("current_belt");
  if (!belt || !(BELT_ORDER as readonly string[]).includes(belt)) return fail("beltInvalid");
  if (!beltsForAge(ageOn(birthDate, today)).includes(belt)) return fail("beltForAge");

  const stripes = Number(field("current_stripes") ?? "");
  if (!Number.isInteger(stripes) || stripes < 0 || stripes > (isKidBelt(belt) ? 3 : 4)) return fail("stripesInvalid");

  // A date the athlete does not remember is estimated: the belt from the day
  // they joined, the last stripe from the belt. Staff correct it at approval.
  const rankRaw = field("rank_since");
  const rankSince = rankRaw ? isoDate(rankRaw) : joinedAt;
  if (!rankSince) return fail("dateInvalid");

  const stripeRaw = stripes === 0 ? null : field("stripe_since");
  const stripeSince = stripeRaw ? isoDate(stripeRaw) : rankSince;
  if (!stripeSince) return fail("dateInvalid");

  if (rankSince > today || stripeSince > today) return fail("dateInFuture");
  if (stripeSince < rankSince) return fail("stripeBeforeBelt");

  return {
    ok: true,
    value: { fullName, email, username, password, birthDate, joinedAt, belt, stripes, rankSince, stripeSince },
  };
}
