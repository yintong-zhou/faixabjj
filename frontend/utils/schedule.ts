// Calendar arithmetic for the class schedule.
//
// Every date here is a plain "YYYY-MM-DD" wall-clock day and every computation
// runs on UTC instants. Using local time would drift by a day across a DST
// change — the same reason daysSince() in ./dates.ts normalises both ends to
// UTC midnight. Nothing in this file knows about the gym's timezone: the
// check-in window is computed once in SQL and arrives here as two instants.

import { formatDate } from "./dates";
import { en } from "./i18n/dictionaries/en";
import type { Dictionary } from "./i18n/dictionaries/it";
import { DEFAULT_LOCALE, LOCALE_TAG, type Locale } from "./i18n/locales";

export type WeekdayLabel = { value: number; short: string; long: string };

// ISO weekday numbering, 1 = Monday, which is what the `weekdays` column
// stores and what the month grid is laid out in.
export function weekdayLabels(t: Dictionary = en): WeekdayLabel[] {
  return t.dates.weekdayShort.map((short, index) => ({
    value: index + 1,
    short,
    long: t.dates.weekdayLong[index],
  }));
}

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

// The first day of the month a date falls in.
export function monthStart(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

// The first day of the month `months` away. Anchoring on the first day is
// what keeps the month navigation honest: adding a month to 31 January and
// keeping the day would land on 3 March.
export function shiftMonth(isoDate: string, months: number): string {
  const [year, month] = isoDate.split("-").map(Number);
  const zeroBased = (year * 12 + (month - 1)) + months;
  const shiftedYear = Math.floor(zeroBased / 12);
  const shiftedMonth = zeroBased - shiftedYear * 12 + 1;
  return `${String(shiftedYear).padStart(4, "0")}-${String(shiftedMonth).padStart(2, "0")}-01`;
}

// The range a month grid actually shows: whole Monday-to-Sunday weeks, so the
// first and last row spill into the neighbouring months. The page queries this
// range rather than the month itself, or a lesson on a spilled-in day would be
// drawn as an empty cell.
export function monthGridRange(isoDate: string): { from: string; until: string } {
  const first = monthStart(isoDate);
  const last = addDays(shiftMonth(first, 1), -1);
  return { from: weekStart(first), until: addDays(weekStart(last), 6) };
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

// Day heading for a "YYYY-MM-DD" column, e.g. "lunedì 14/09/2026". The weekday
// stays because a weekly calendar is read by it; the date itself is dd/mm/yyyy
// in every language, an explicit decision.
//
// Formatted in UTC for the same reason the arithmetic above is: the viewer's
// timezone must not shift which day a date column names.
//
// The weekday comes from the dictionary rather than from Intl: the same names
// are already needed for the course form's checkboxes and the grid header, and
// two sources for one list is how they drift apart.
export function formatDayHeading(isoDate: string, t: Dictionary = en): string {
  const timestamp = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(timestamp)) return isoDate;

  const weekday = t.dates.weekdayLong[isoWeekday(timestamp) - 1];
  return `${weekday} ${formatDate(isoDate)}`;
}

// "Settembre 2026" / "September 2026", for the month grid's header.
//
// Month names stay with Intl, unlike weekdays: twelve names in three
// languages is exactly the kind of list a platform already has, and nothing
// else in the app needs them.
export function formatMonthHeading(
  isoDate: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const label = new Intl.DateTimeFormat(LOCALE_TAG[locale] ?? LOCALE_TAG[DEFAULT_LOCALE], {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));

  // Italian and Portuguese lower-case month names; as a heading it wants a
  // capital, and English already has one.
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// The day number alone, for a grid cell.
export function formatDayNumber(isoDate: string): string {
  return String(Number(isoDate.slice(8, 10)));
}

// "19:00:00" and "19:00" both render as "19:00".
export function formatTime(time: string): string {
  return time.slice(0, 5);
}

export function formatWeekdays(
  weekdays: number[] | null,
  t: Dictionary = en,
): string {
  if (!weekdays || weekdays.length === 0) {
    return t.corsi.noDays;
  }

  return weekdayLabels(t)
    .filter((day) => weekdays.includes(day.value))
    .map((day) => day.short)
    .join(" ");
}
