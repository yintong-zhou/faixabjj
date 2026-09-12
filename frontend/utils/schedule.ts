// Calendar arithmetic for the class schedule.
//
// Every date here is a plain "YYYY-MM-DD" wall-clock day and every computation
// runs on UTC instants. Using local time would drift by a day across a DST
// change — the same reason daysSince() in ./dates.ts normalises both ends to
// UTC midnight. Nothing in this file knows about the gym's timezone: the
// check-in window is computed once in SQL and arrives here as two instants.

export const WEEKDAY_LABELS = [
  { value: 1, short: "lun", long: "lunedì" },
  { value: 2, short: "mar", long: "martedì" },
  { value: 3, short: "mer", long: "mercoledì" },
  { value: 4, short: "gio", long: "giovedì" },
  { value: 5, short: "ven", long: "venerdì" },
  { value: 6, short: "sab", long: "sabato" },
  { value: 7, short: "dom", long: "domenica" },
] as const;

const DAY_MS = 86_400_000;

function toUtc(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

function toIso(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

// JavaScript's getUTCDay() is 0 = Sunday; the ISO numbering used by the
// `weekdays` column is 1 = Monday, 7 = Sunday.
function isoWeekday(timestamp: number): number {
  const day = new Date(timestamp).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(isoDate: string, days: number): string {
  return toIso(toUtc(isoDate) + days * DAY_MS);
}

export function weekStart(isoDate: string): string {
  const timestamp = toUtc(isoDate);
  return toIso(timestamp - (isoWeekday(timestamp) - 1) * DAY_MS);
}

export function parseWeekdays(values: string[]): number[] {
  const parsed = values
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7);
  return [...new Set(parsed)].sort((a, b) => a - b);
}

export function expandWeekdays({
  weekdays,
  from,
  until,
}: {
  weekdays: number[];
  from: string;
  until: string;
}): string[] {
  const start = toUtc(from);
  const end = toUtc(until);
  if (
    weekdays.length === 0 ||
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    end < start
  ) {
    return [];
  }

  const wanted = new Set(weekdays);
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor += DAY_MS) {
    if (wanted.has(isoWeekday(cursor))) {
      dates.push(toIso(cursor));
    }
  }
  return dates;
}

export type CheckinState = "open" | "too_early" | "closed" | "cancelled";

// The two instants come straight from session_overview, where SQL already
// applied the gym's timezone and the course's two margins.
export function checkinState({
  opensAt,
  closesAt,
  status,
  now,
}: {
  opensAt: string;
  closesAt: string;
  status: string;
  now: Date;
}): CheckinState {
  if (status === "cancelled") {
    return "cancelled";
  }

  const at = now.getTime();
  if (at < Date.parse(opensAt)) {
    return "too_early";
  }
  if (at > Date.parse(closesAt)) {
    return "closed";
  }
  return "open";
}

// Italian day heading for a "YYYY-MM-DD" column, e.g. "lunedì 14 settembre".
// Formatted in UTC for the same reason the arithmetic above is: the viewer's
// timezone must not shift which day a date column names.
const dayFormat = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function formatDayHeading(isoDate: string): string {
  return dayFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

// "19:00:00" and "19:00" both render as "19:00".
export function formatTime(time: string): string {
  return time.slice(0, 5);
}

export function formatWeekdays(weekdays: number[] | null): string {
  if (!weekdays || weekdays.length === 0) {
    return "nessun giorno";
  }

  return WEEKDAY_LABELS.filter((day) => weekdays.includes(day.value))
    .map((day) => day.short)
    .join(" ");
}
