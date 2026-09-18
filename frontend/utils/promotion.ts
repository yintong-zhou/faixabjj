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
import { ageOn, daysSince } from "./dates";
import { clockHours, estimatedHours } from "./hours";

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

/** One row of `promotion_criteria`: what it takes to reach that grade. */
export type Criterion = {
  belt: string;
  stripe: number;
  min_hours: number;
  min_time_at_rank_days: number;
  min_age_years: number | null;
};

export type Blocker =
  | "hours"
  | "time"
  | "age"
  | "missing-birth-date"
  | "no-criterion";

export type PromotionInput = {
  current_belt: string;
  current_stripes: number;
  rank_since: string;
  stripe_since: string;
  joined_at: string;
  birth_date: string | null;
  lessons_since_rank: number;
  lessons_since_stripe: number;
};

export type PromotionStatus = {
  /** The grade being measured against, or null when none is modelled. */
  next: Step | null;
  /** Clock hours, both sides — see SESSION_LENGTH_HOURS. */
  requiredHours: number;
  currentHours: number;
  requiredDays: number;
  currentDays: number;
  eligible: boolean;
  /** Empty exactly when eligible; never a reason the UI has to guess. */
  blockers: Blocker[];
};

const NOTHING: PromotionStatus = {
  next: null,
  requiredHours: 0,
  currentHours: 0,
  requiredDays: 0,
  currentDays: 0,
  eligible: false,
  blockers: [],
};

/** The later of two "YYYY-MM-DD" days; string comparison is enough for ISO. */
function laterOf(a: string, b: string): string {
  return a > b ? a : b;
}

/**
 * Where somebody stands against the criteria for their next grade.
 *
 * Two anchors, one rule: a stripe is measured from `stripe_since` and counts
 * the attendance since then; a belt is measured from `rank_since` and counts
 * the attendance since then. The hours a member trained before the gym started
 * recording are added as the estimated opening balance, anchored at the later
 * of their join date and the grade date — the estimate is not attendance, and
 * it must not be credited to a grade held before they even joined.
 *
 * Comparisons are `>=`: somebody exactly at the threshold has reached it.
 */
export function promotionStatus(
  person: PromotionInput,
  criteria: Criterion[],
  options: { today?: string; trackingStartedOn?: string } = {},
): PromotionStatus {
  const today =
    options.today ?? new Date(Date.now()).toISOString().slice(0, 10);

  const step = nextStep(person.current_belt, person.current_stripes);
  // Copied, not returned by reference: NOTHING is a single module-level
  // object, and spreading it still shares its blockers array unless that
  // array is replaced too — a caller that ever does status.blockers.push(...)
  // must not corrupt every other lookup in the same process.
  if (!step) return { ...NOTHING, blockers: [] };

  const criterion = criteria.find(
    (c) => c.belt === step.belt && c.stripe === step.stripe,
  );
  // A grade with no row is not modelled, so nobody is eligible for it. Saying
  // so out loud beats defaulting to zero thresholds, which would make everyone
  // eligible for a grade the gym never described.
  if (!criterion) {
    return { ...NOTHING, next: step, blockers: ["no-criterion"] };
  }

  const isBeltStep = step.stripe === 0;
  const anchor = isBeltStep ? person.rank_since : person.stripe_since;
  const lessons = isBeltStep
    ? person.lessons_since_rank
    : person.lessons_since_stripe;

  const estimated = estimatedHours(laterOf(person.joined_at, anchor), {
    trackingStartedOn: options.trackingStartedOn,
    today,
  });

  const currentHours = clockHours(lessons + estimated);
  const currentDays = daysSince(anchor, today) ?? 0;

  const blockers: Blocker[] = [];
  if (currentHours < criterion.min_hours) blockers.push("hours");
  if (currentDays < criterion.min_time_at_rank_days) blockers.push("time");

  if (criterion.min_age_years !== null) {
    const age = ageOn(person.birth_date, today);
    // Never eligible for a missing date: an unknown age is not a passed check.
    if (age === null) blockers.push("missing-birth-date");
    else if (age < criterion.min_age_years) blockers.push("age");
  }

  return {
    next: step,
    requiredHours: criterion.min_hours,
    currentHours,
    requiredDays: criterion.min_time_at_rank_days,
    currentDays,
    eligible: blockers.length === 0,
    blockers,
  };
}
