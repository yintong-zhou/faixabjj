// Promotion eligibility: what the next grade is, and what is still missing.
//
// Pure on purpose, like schedule.ts and hours.ts. It reads no cookie and makes
// no query: the caller passes the person, the criteria rows and — in tests —
// a fixed "today". The database holds the numbers; this module holds the rule.
//
// It never decides a promotion. Reaching the minimums is necessary and never
// sufficient: belt-criteria.md puts the instructor's discretion above the
// arithmetic, and the app says so wherever a result is shown.

// BELT_ORDER already exists in supabase/profile.ts (alongside beltRank()); it
// is imported rather than redeclared here so the ladder has a single source
// of truth instead of two copies that can drift apart.
import { BELT_ORDER } from "./supabase/profile";

export type Belt = (typeof BELT_ORDER)[number];

/** Four stripes to a belt. The black belt is the exception: it has degrees. */
export const MAX_STRIPES = 4;

export type Step = { belt: Belt; stripe: number };

function isBelt(value: string): value is Belt {
  return (BELT_ORDER as readonly string[]).includes(value);
}

/**
 * The next grade on the ladder: the following stripe while the belt has room
 * for one, the following belt once the fourth stripe is there, nothing at
 * black.
 *
 * Requiring four stripes before a belt is common academy practice rather than
 * a rule in belt-criteria.md, and it binds only the *suggestion*: the promotion
 * panel still lets an instructor pick any forward grade directly.
 */
export function nextStep(belt: string, stripes: number): Step | null {
  if (!isBelt(belt)) return null;
  if (belt === "black") return null;

  if (stripes < MAX_STRIPES) {
    return { belt, stripe: stripes + 1 };
  }

  const next = BELT_ORDER[BELT_ORDER.indexOf(belt) + 1];
  return next ? { belt: next, stripe: 0 } : null;
}
