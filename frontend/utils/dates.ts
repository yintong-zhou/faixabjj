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

const numberFormat = new Intl.NumberFormat("it-IT");

export function formatDays(days: number | null): string {
  if (days === null) {
    return "—";
  }

  return `${numberFormat.format(days)} giorn${days === 1 ? "o" : "i"}`;
}
