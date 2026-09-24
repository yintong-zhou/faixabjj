// Promotion eligibility: what the next grade is, and what is still missing.
//
// Pure on purpose, like schedule.ts and hours.ts. It reads no cookie and makes
// no query: the caller passes the person, the criteria rows and the gym's
// own "today" (`todayIn(gym.timezone)`), which tests pin. The database holds the numbers; this module holds the rule.
//
// It never decides a promotion. Reaching the minimums is necessary and never
// sufficient: belt-criteria.md puts the instructor's discretion above the
// arithmetic, and the app says so wherever a result is shown.

// The ladders and the display order already exist in supabase/profile.ts
// (alongside beltRank()); they are imported rather than redeclared here so each
// has a single source of truth instead of two copies that can drift apart.
import { ADULT_BELTS, BELT_ORDER, KID_BELTS, isKidBelt } from "./supabase/profile";
import { ageOn, daysSince } from "./dates";
import { clockHours, estimatedHours, type HoursOptions } from "./hours";

export type Belt = (typeof BELT_ORDER)[number];

/** Four stripes to a belt. The black belt is the exception: it has degrees. */
export const MAX_STRIPES = 4;

/**
 * Three degrees to a children's belt, not four — that is what the artwork in
 * public/belts/kids draws, and record_promotion() refuses a fourth.
 */
export const KID_MAX_STRIPES = 3;

/**
 * The age at which the children's ladder ends and an adult belt is given.
 * belt-criteria.md's "transition at 16": grey, yellow and orange become blue,
 * green becomes blue or purple at the professor's discretion. Converting
 * somebody is a deliberate act by the instructor, not a suggestion this module
 * makes — see the comment on the end of the children's ladder below.
 */
export const KID_TRANSITION_AGE = 16;

export type Step = { belt: Belt; stripe: number };

function isBelt(value: string): value is Belt {
  return (BELT_ORDER as readonly string[]).includes(value);
}

/**
 * Which ladder somebody is on.
 *
 * The two share their first rung: white is where both an adult and a child
 * start. Every other belt belongs to exactly one ladder, so only white needs
 * the age to disambiguate — and an unknown age is read as an adult, because
 * that is the case the gym mostly has and the one whose criteria carry their
 * own age check.
 */
function ladderFor(belt: string, age: number | null): readonly string[] {
  if (isKidBelt(belt)) return KID_BELTS;
  if (belt !== "white") return ADULT_BELTS;
  return age !== null && age < KID_TRANSITION_AGE ? KID_BELTS : ADULT_BELTS;
}

/**
 * The next grade on the ladder: the following stripe while the belt has room
 * for one, the following belt once the last stripe is there, nothing at the
 * end of a ladder.
 *
 * Requiring every stripe before a belt is common academy practice rather than
 * a rule in belt-criteria.md, and it binds only the *suggestion*: the promotion
 * panel still lets an instructor pick any forward grade directly.
 *
 * Nothing is suggested past green/black, the last children's belt. What comes
 * next is the transition at 16, and belt-criteria.md makes it a judgement —
 * green goes to blue *or* purple "at the professor's discretion" — so there is
 * no single next grade to propose. Same shape as the black belt: no modelled
 * next step, which is the honest answer rather than a guess.
 */
export function nextStep(
  belt: string,
  stripes: number,
  options: { age?: number | null } = {},
): Step | null {
  if (!isBelt(belt)) return null;
  if (belt === "black") return null;

  const ladder = ladderFor(belt, options.age ?? null);
  const maxStripes = ladder === KID_BELTS ? KID_MAX_STRIPES : MAX_STRIPES;

  if (stripes < maxStripes) {
    return { belt, stripe: stripes + 1 };
  }

  const next = ladder[ladder.indexOf(belt) + 1];
  return next && isBelt(next) ? { belt: next, stripe: 0 } : null;
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
  /** Clock hours, both sides — see HoursSettings.sessionLengthHours. */
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
  options: HoursOptions,
): PromotionStatus {
  const today = options.today;

  // Read once, and before the ladder is chosen: white is on both ladders, and
  // the age is what says which one this person is climbing.
  const age = ageOn(person.birth_date, today);

  const step = nextStep(person.current_belt, person.current_stripes, { age });
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
  //
  // This is also, on purpose, what keeps every child out of the eligibility
  // queue: the children's belts have no promotion_criteria rows, because
  // belt-criteria.md gives them no minimum time and no hours at all — the IBJJF
  // children's system is a suggested method, graded on the professor's
  // judgement. A queue over invented numbers would be a measurement of nothing.
  // They are still promoted from the same panel, and the history records it.
  if (!criterion) {
    return { ...NOTHING, next: step, blockers: ["no-criterion"] };
  }

  const isBeltStep = step.stripe === 0;
  const anchor = isBeltStep ? person.rank_since : person.stripe_since;
  const lessons = isBeltStep
    ? person.lessons_since_rank
    : person.lessons_since_stripe;

  const estimated = estimatedHours(laterOf(person.joined_at, anchor), options);

  const currentHours = clockHours(lessons + estimated, options);
  const currentDays = daysSince(anchor, today) ?? 0;

  const blockers: Blocker[] = [];
  if (currentHours < criterion.min_hours) blockers.push("hours");
  if (currentDays < criterion.min_time_at_rank_days) blockers.push("time");

  if (criterion.min_age_years !== null) {
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
