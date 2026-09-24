import { en } from "./i18n/dictionaries/en";
import type { Dictionary } from "./i18n/dictionaries/it";

// Whole days between a `date` column (always "YYYY-MM-DD") and today.
//
// Both ends are normalised to UTC midnight on purpose: comparing a UTC-parsed
// date against a local-time "now" would drift by a day depending on the
// viewer's timezone and the hour of the request.
//
// `today` is optional and exists so callers that must be deterministic — the
// promotion maths and its tests — can pin it. Omitted, it means now.
export function daysSince(isoDate: string | null, today?: string): number | null {
  if (!isoDate) {
    return null;
  }

  const then = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(then)) {
    return null;
  }

  let now: number;
  if (today) {
    now = Date.parse(`${today}T00:00:00Z`);
    if (Number.isNaN(now)) {
      return null;
    }
  } else {
    const current = new Date();
    now = Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate(),
    );
  }

  // A future date (a join date typed ahead of time) reads as 0, not negative.
  return Math.max(0, Math.round((now - then) / 86_400_000));
}

// Whole years old on a given day. Used only where a promotion criterion states
// a minimum age — today that is brown to black, which IBJJF puts at 19.
//
// Compared field by field rather than by subtracting milliseconds: a year is
// not a fixed number of days, and "has the birthday happened yet" is exactly
// the question.
export function ageOn(
  birthDate: string | null,
  onDate: string,
): number | null {
  if (!birthDate) {
    return null;
  }

  const born = birthDate.split("-").map(Number);
  const on = onDate.split("-").map(Number);
  if (born.length !== 3 || on.length !== 3) {
    return null;
  }
  if (born.some(Number.isNaN) || on.some(Number.isNaN)) {
    return null;
  }

  const [by, bm, bd] = born;
  const [oy, om, od] = on;
  const beforeBirthday = om < bm || (om === bm && od < bd);
  return oy - by - (beforeBirthday ? 1 : 0);
}

// Every date shown in the app reads dd/mm/yyyy. The columns arrive from
// Postgres as "YYYY-MM-DD", which is the right format to store and the wrong
// one to read in Italy.
//
// Formatted in UTC for the same reason daysSince() normalises to UTC midnight:
// parsing "2026-09-14" gives UTC midnight, so a viewer east of Greenwich would
// otherwise see the previous day.
//
// This is for *display* only. The value of an <input type="date"> must stay
// "YYYY-MM-DD" — that is what the element accepts and what it posts back.
const dateFormat = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return "—";
  }

  const parsed = new Date(`${isoDate}T00:00:00Z`);
  // An unparseable value is shown as it came rather than as "Invalid Date".
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }

  return dateFormat.format(parsed);
}

// The dictionary is a parameter with a default rather than something this
// module reads for itself: these are pure functions covered by unit tests, and
// a function that reaches for a cookie is neither pure nor testable.
export function formatDays(days: number | null, t: Dictionary = en): string {
  if (days === null) {
    return "—";
  }

  return t.dates.days(days);
}

/**
 * Today's calendar date (YYYY-MM-DD) in a gym's timezone.
 *
 * The rest of this module works in UTC whole days, which is right for
 * durations. "Which day is it at the gym" is a different question: between
 * 22:00 and midnight UTC, Rome is already on tomorrow. `en-CA` formats as
 * YYYY-MM-DD.
 */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
