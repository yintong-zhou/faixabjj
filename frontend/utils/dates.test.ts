import { describe, expect, it } from "vitest";

import { ageOn, daysSince, formatDate, todayIn } from "./dates";

describe("formatDate", () => {
  it("renders a date column as dd/mm/yyyy", () => {
    expect(formatDate("2026-09-14")).toBe("14/09/2026");
  });

  it("pads the day and the month", () => {
    expect(formatDate("2026-01-05")).toBe("05/01/2026");
  });

  // The columns are UTC midnight; formatting in local time would show the 31st
  // to a viewer in Rome and the 1st to one in Los Angeles.
  it("does not shift the day across timezones", () => {
    expect(formatDate("2026-12-31")).toBe("31/12/2026");
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
  });

  it("shows an em dash for a missing date", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("returns an unparseable value untouched rather than 'Invalid Date'", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("daysSince with an explicit today", () => {
  it("counts whole days between two dates", () => {
    expect(daysSince("2026-09-01", "2026-09-15")).toBe(14);
  });

  it("clamps a future date to zero rather than going negative", () => {
    expect(daysSince("2026-10-01", "2026-09-15")).toBe(0);
  });

  it("is null without a date", () => {
    expect(daysSince(null, "2026-09-15")).toBeNull();
  });
});

describe("ageOn", () => {
  it("counts whole years", () => {
    expect(ageOn("2000-09-15", "2026-09-15")).toBe(26);
  });

  it("does not count a birthday that has not arrived yet", () => {
    expect(ageOn("2000-09-16", "2026-09-15")).toBe(25);
  });

  it("is null without a birth date", () => {
    expect(ageOn(null, "2026-09-15")).toBeNull();
  });
});

describe("todayIn", () => {
  // 22:30 UTC on 24 September is already the 25th in Rome (UTC+2 in summer)
  // and still the 24th in São Paulo (UTC-3).
  const instant = new Date("2026-09-24T22:30:00Z");

  it("is the calendar day in the gym's timezone, not in UTC", () => {
    expect(todayIn("Europe/Rome", instant)).toBe("2026-09-25");
    expect(todayIn("America/Sao_Paulo", instant)).toBe("2026-09-24");
  });

  it("follows daylight saving time", () => {
    // 23:30 UTC on 15 January is 00:30 on the 16th in Rome (UTC+1 in winter).
    expect(todayIn("Europe/Rome", new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-16");
  });
});
