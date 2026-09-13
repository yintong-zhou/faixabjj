import { it, type Dictionary } from "./i18n/dictionaries/it";

// Whole days between a `date` column (always "YYYY-MM-DD") and today.
//
// Both ends are normalised to UTC midnight on purpose: comparing a UTC-parsed
// date against a local-time "now" would drift by a day depending on the
// viewer's timezone and the hour of the request.
export function daysSince(isoDate: string | null): number | null {
  if (!isoDate) {
    return null;
  }

  const then = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(then)) {
    return null;
  }

  const today = new Date();
  const now = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );

  // A future date (a join date typed ahead of time) reads as 0, not negative.
  return Math.max(0, Math.round((now - then) / 86_400_000));
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
export function formatDays(days: number | null, t: Dictionary = it): string {
  if (days === null) {
    return "—";
  }

  return t.dates.days(days);
}
