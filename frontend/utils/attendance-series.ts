import { addDays, monthStart, shiftMonth, weekStart } from "./schedule";

// The numbers behind the dashboard's attendance chart: one bar per day, for a
// calendar week or a calendar month. Pure, so the boundaries (a week straddling
// two months, February, a cancelled lesson, a day still to come) are tested
// rather than looked at.

export type Period = "week" | "month";

// What the chart needs of a lesson. `present_count` comes from
// `session_overview`, the same figure the roll call link shows.
export type SeriesSession = {
  session_date: string;
  status: string;
  present_count: number | null;
};

export type SeriesDay = {
  date: string;
  // Presences recorded that day, over lessons that were held or are due.
  total: number;
  // Lessons that day, cancelled ones left out: a day with a lesson and no
  // presence is different from a day without a lesson.
  lessons: number;
  // Nothing can have been recorded yet; drawn without a bar, not as zero.
  isFuture: boolean;
};

// The `periodo` search param: "settimana" is the week, anything else — absent,
// "mese", or something typed by hand — is the month, the default.
export function parsePeriod(value: string | undefined): Period {
  return value === "settimana" ? "week" : "month";
}

export function periodRange(period: Period, anchor: string): { from: string; until: string } {
  if (period === "week") {
    const from = weekStart(anchor);
    return { from, until: addDays(from, 6) };
  }
  const from = monthStart(anchor);
  return { from, until: addDays(shiftMonth(from, 1), -1) };
}

// The anchor of the period before (-1) or after (1). A month is moved from its
// first day, so 31 January never lands on 3 March.
export function shiftPeriod(period: Period, anchor: string, direction: -1 | 1): string {
  return period === "week"
    ? addDays(weekStart(anchor), direction * 7)
    : shiftMonth(anchor, direction);
}

// Every day of the range, in order, including the ones with no lesson at all —
// a gap in the chart is information, not something to close up.
export function attendanceSeries(
  sessions: SeriesSession[],
  range: { from: string; until: string },
  today: string,
): SeriesDay[] {
  const byDate = new Map<string, { total: number; lessons: number }>();
  for (const session of sessions) {
    if (session.status === "cancelled") continue;
    const entry = byDate.get(session.session_date) ?? { total: 0, lessons: 0 };
    entry.total += Number(session.present_count ?? 0);
    entry.lessons += 1;
    byDate.set(session.session_date, entry);
  }

  const days: SeriesDay[] = [];
  for (let date = range.from; date <= range.until; date = addDays(date, 1)) {
    const entry = byDate.get(date);
    days.push({
      date,
      total: entry?.total ?? 0,
      lessons: entry?.lessons ?? 0,
      isFuture: date > today,
    });
  }
  return days;
}

// The top of the value axis: at least 4, and always even so the middle grid
// line is a whole number. Under 10 it rounds up to the next even number, above
// that to the next multiple of the value's own order of magnitude (20, 30 …
// 100, 200 …), which keeps the bars tall without ending on an odd figure.
export function niceMax(value: number): number {
  if (value <= 4) return 4;
  if (value <= 10) return Math.ceil(value / 2) * 2;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
}
