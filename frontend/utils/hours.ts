// Training hours: an opening balance, then nothing but what was recorded.
//
// The estimate is **not an ongoing calculation**. It exists to give each member
// a starting figure on the day the gym switched this tracking system on,
// because `person_hours` only counts attendance recorded in FAIXABJJ and a
// member who has trained for three years would otherwise read as zero — the
// exact figure promotion eligibility rests on.
//
// From TRACKING_STARTED_ON onwards the estimate is frozen and hours grow
// **only** through a member's own check-in or an instructor's roll call.
// That is not merely a convention here: the `attendance` RLS policies accept
// an insert only from a class manager, or from the member themselves with
// `checked_in_by = 'self'` inside the check-in window. Nothing else can add an
// hour, and this module must never become a second way of doing it.
//
// Hence the cutoff. Without one, estimating "three a week since joining" while
// also counting real attendance would count every week from go-live onwards
// twice.

import { it, type Dictionary } from "./i18n/dictionaries/it";

/** Lessons a member is assumed to attend in a week, before records existed. */
export const LESSONS_PER_WEEK = 3;

/** One attendance is one hour — the same rule the database enforces. */
export const HOURS_PER_LESSON = 1;

/**
 * The day the gym switched attendance tracking on.
 *
 * Before it, hours are estimated once; from it on, they are counted. **Set
 * this to the real go-live date, and never to a future one.** A future date is
 * a misconfiguration, not a supported mode: the estimate would keep growing
 * over weeks in which members are already checking in, and both would count.
 * The clamp in estimatedHours() stops the estimate running past today, which
 * limits the damage but does not make a future date correct.
 */
export const TRACKING_STARTED_ON = "2026-09-13";

const DAY_MS = 86_400_000;

function wholeDaysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

export type Hours = {
  /** Counted from attendance rows. */
  recorded: number;
  /** Assumed for the period before records existed. */
  estimated: number;
  /** What to show as "ore totali". */
  total: number;
  /** Whether any part of the total is an assumption, so the UI can say so. */
  isPartlyEstimated: boolean;
};

/**
 * The opening balance: hours assumed for the period before tracking existed.
 *
 * Once TRACKING_STARTED_ON is in the past this value is **frozen** — it
 * depends on `joined_at` and the cutoff, neither of which moves, so it returns
 * the same number tomorrow as today. Everything a member trains from here on
 * has to arrive as an attendance row.
 *
 * The `today` clamp only matters for a go-live date mistakenly set in the
 * future, where it stops the estimate covering weeks that have not happened.
 * Dates are handled as UTC whole days, like everywhere else in this app, so
 * the figure does not shift with the viewer's timezone.
 */
export function estimatedHours(
  joinedAt: string | null | undefined,
  options: { trackingStartedOn?: string; today?: string } = {},
): number {
  if (!joinedAt) return 0;

  const today =
    options.today ?? new Date(Date.now()).toISOString().slice(0, 10);
  const declared = options.trackingStartedOn ?? TRACKING_STARTED_ON;
  const cutoff = declared < today ? declared : today;

  const days = wholeDaysBetween(joinedAt, cutoff);
  // Partial weeks count pro rata rather than being rounded up: rounding up
  // would hand a free lesson to somebody who joined yesterday.
  return Math.round(((days / 7) * LESSONS_PER_WEEK * HOURS_PER_LESSON * 10)) / 10;
}

export function hoursFor(
  joinedAt: string | null | undefined,
  recordedHours: number | string | null | undefined,
  options: { trackingStartedOn?: string; today?: string } = {},
): Hours {
  const recorded = Number(recordedHours ?? 0) || 0;
  const estimated = estimatedHours(joinedAt, options);

  return {
    recorded,
    estimated,
    total: Math.round((recorded + estimated) * 10) / 10,
    isPartlyEstimated: estimated > 0,
  };
}

export function formatHours(value: number, t: Dictionary = it): string {
  return t.hours.hours(value.toFixed(1));
}

/** The sentence used wherever an estimated total is shown. */
export function estimateNote(estimated: number, t: Dictionary = it): string {
  return t.hours.estimateNote(estimated.toFixed(1), LESSONS_PER_WEEK);
}

