import { describe, expect, it } from "vitest";

import {
  attendanceSeries,
  niceMax,
  periodStats,
  parsePeriod,
  periodRange,
  shiftPeriod,
  type SeriesSession,
  type StatsSession,
} from "./attendance-series";

describe("parsePeriod", () => {
  it("reads the week and defaults everything else to the month", () => {
    expect(parsePeriod("settimana")).toBe("week");
    expect(parsePeriod("mese")).toBe("month");
    expect(parsePeriod(undefined)).toBe("month");
    expect(parsePeriod("week")).toBe("month");
    expect(parsePeriod("")).toBe("month");
  });
});

describe("periodRange", () => {
  it("returns Monday to Sunday for a week", () => {
    // 2026-10-01 is a Thursday.
    expect(periodRange("week", "2026-10-01")).toEqual({
      from: "2026-09-28",
      until: "2026-10-04",
    });
  });

  it("returns the whole calendar month", () => {
    expect(periodRange("month", "2026-10-15")).toEqual({
      from: "2026-10-01",
      until: "2026-10-31",
    });
    expect(periodRange("month", "2026-09-30")).toEqual({
      from: "2026-09-01",
      until: "2026-09-30",
    });
  });

  it("knows February, leap years included", () => {
    expect(periodRange("month", "2027-02-10").until).toBe("2027-02-28");
    expect(periodRange("month", "2028-02-10").until).toBe("2028-02-29");
  });
});

describe("shiftPeriod", () => {
  it("moves a week by seven days from its Monday", () => {
    expect(shiftPeriod("week", "2026-10-01", -1)).toBe("2026-09-21");
    expect(shiftPeriod("week", "2026-10-01", 1)).toBe("2026-10-05");
  });

  it("moves a month from its first day, never past a short month", () => {
    expect(shiftPeriod("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftPeriod("month", "2026-03-31", -1)).toBe("2026-02-01");
    expect(shiftPeriod("month", "2026-01-15", -1)).toBe("2025-12-01");
  });
});

describe("attendanceSeries", () => {
  const range = { from: "2026-09-28", until: "2026-10-04" };
  const lesson = (
    session_date: string,
    present_count: number | null,
    status = "scheduled",
  ): SeriesSession => ({ session_date, status, present_count });

  it("has one entry per day, lesson-less days included", () => {
    const days = attendanceSeries([], range, "2026-10-01");
    expect(days.map((d) => d.date)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(days.every((d) => d.total === 0 && d.lessons === 0)).toBe(true);
  });

  it("adds up the lessons of the same day", () => {
    const days = attendanceSeries(
      [lesson("2026-09-29", 8), lesson("2026-09-29", 5), lesson("2026-09-30", 3)],
      range,
      "2026-10-04",
    );
    expect(days[1]).toMatchObject({ total: 13, lessons: 2 });
    expect(days[2]).toMatchObject({ total: 3, lessons: 1 });
  });

  it("leaves cancelled lessons out of both figures", () => {
    const days = attendanceSeries(
      [lesson("2026-09-29", 4), lesson("2026-09-29", 9, "cancelled")],
      range,
      "2026-10-04",
    );
    expect(days[1]).toMatchObject({ total: 4, lessons: 1 });
  });

  it("treats a missing count as nobody present", () => {
    const days = attendanceSeries([lesson("2026-09-29", null)], range, "2026-10-04");
    expect(days[1]).toMatchObject({ total: 0, lessons: 1 });
  });

  it("coerces a count that arrives as a string", () => {
    const days = attendanceSeries(
      [{ session_date: "2026-09-29", status: "scheduled", present_count: "6" as unknown as number }],
      range,
      "2026-10-04",
    );
    expect(days[1].total).toBe(6);
  });

  it("marks only the days after today as future", () => {
    const days = attendanceSeries([], range, "2026-10-01");
    expect(days.map((d) => d.isFuture)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
  });

  it("ignores lessons outside the range", () => {
    const days = attendanceSeries([lesson("2026-10-20", 7)], range, "2026-10-04");
    expect(days.reduce((sum, d) => sum + d.total, 0)).toBe(0);
  });

  it("covers a week that straddles two months", () => {
    const days = attendanceSeries([lesson("2026-10-01", 2)], range, "2026-10-04");
    expect(days[0].date.slice(0, 7)).toBe("2026-09");
    expect(days[6].date.slice(0, 7)).toBe("2026-10");
    expect(days[3].total).toBe(2);
  });

  it("gives 31 entries for October", () => {
    const days = attendanceSeries([], periodRange("month", "2026-10-10"), "2026-10-10");
    expect(days).toHaveLength(31);
  });
});

describe("niceMax", () => {
  it("never goes below 4", () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(3)).toBe(4);
    expect(niceMax(4)).toBe(4);
  });

  it("rounds a small value up to the next even number", () => {
    expect(niceMax(5)).toBe(6);
    expect(niceMax(7)).toBe(8);
    expect(niceMax(10)).toBe(10);
  });

  it("rounds a larger value up to its own order of magnitude", () => {
    expect(niceMax(11)).toBe(20);
    expect(niceMax(23)).toBe(30);
    expect(niceMax(100)).toBe(100);
    expect(niceMax(101)).toBe(200);
  });

  it("always leaves a whole number for the middle grid line", () => {
    for (let v = 0; v <= 300; v += 1) {
      expect(niceMax(v) % 2).toBe(0);
      expect(niceMax(v)).toBeGreaterThanOrEqual(v);
    }
  });
});

describe("periodStats", () => {
  const lesson = (over: Partial<StatsSession>): StatsSession => ({
    session_date: "2026-10-05",
    status: "scheduled",
    present_count: 5,
    course_name: "Gi",
    start_time: "19:00:00",
    end_time: "20:30:00",
    ends_at: "2026-10-05T18:30:00+00:00",
    ...over,
  });
  const now = new Date("2026-10-06T12:00:00Z");

  it("counts only lessons that are over, not cancelled and with someone present", () => {
    const stats = periodStats(
      [
        lesson({}),
        lesson({ status: "cancelled" }),
        // No roll call: nothing proves it was held.
        lesson({ present_count: 0 }),
        lesson({ present_count: null }),
        // Today, but still to finish.
        lesson({ session_date: "2026-10-06", ends_at: "2026-10-06T18:30:00+00:00" }),
      ],
      now,
    );
    expect(stats.held).toBe(1);
    expect(stats.minutes).toBe(90);
  });

  it("groups courses sharing a name into one type, largest share first", () => {
    const stats = periodStats(
      [
        lesson({ course_name: "No-Gi", start_time: "12:00:00", end_time: "13:00:00" }),
        lesson({ course_name: "Gi" }),
        lesson({ course_name: " gi " }),
        lesson({ course_name: "Kids", start_time: "17:00:00", end_time: "18:00:00" }),
      ],
      now,
    );
    expect(stats.held).toBe(4);
    expect(stats.minutes).toBe(60 + 90 + 90 + 60);
    expect(stats.byType).toEqual([
      { name: "Gi", lessons: 2, share: 0.5 },
      { name: "Kids", lessons: 1, share: 0.25 },
      { name: "No-Gi", lessons: 1, share: 0.25 },
    ]);
  });

  it("is empty for a period with nothing held", () => {
    expect(periodStats([], now)).toEqual({ held: 0, minutes: 0, byType: [] });
  });
});
