import { describe, expect, it } from "vitest";
import {
  addDays,
  checkinState,
  expandWeekdays,
  parseWeekdays,
  weekStart,
} from "./schedule";

describe("expandWeekdays", () => {
  it("returns every matching weekday in the range, inclusive", () => {
    // 2026-09-14 is a Monday.
    expect(
      expandWeekdays({ weekdays: [1, 3], from: "2026-09-14", until: "2026-09-24" }),
    ).toEqual(["2026-09-14", "2026-09-16", "2026-09-21", "2026-09-23"]);
  });

  it("crosses a month boundary without skipping or repeating", () => {
    expect(
      expandWeekdays({ weekdays: [5], from: "2026-09-25", until: "2026-10-10" }),
    ).toEqual(["2026-09-25", "2026-10-02", "2026-10-09"]);
  });

  it("is unaffected by the DST change (Europe/Rome, 2026-10-25)", () => {
    // A local-time loop drifts an hour here and can emit a duplicate or skip
    // a day; the UTC-based one must not.
    expect(
      expandWeekdays({ weekdays: [7], from: "2026-10-18", until: "2026-11-08" }),
    ).toEqual(["2026-10-18", "2026-10-25", "2026-11-01", "2026-11-08"]);
  });

  it("returns nothing for an empty weekday list", () => {
    expect(
      expandWeekdays({ weekdays: [], from: "2026-09-14", until: "2026-12-31" }),
    ).toEqual([]);
  });

  it("returns nothing when the range is inverted", () => {
    expect(
      expandWeekdays({ weekdays: [1], from: "2026-09-24", until: "2026-09-14" }),
    ).toEqual([]);
  });

  it("includes a boundary day that matches", () => {
    expect(
      expandWeekdays({ weekdays: [1], from: "2026-09-14", until: "2026-09-14" }),
    ).toEqual(["2026-09-14"]);
  });
});

describe("checkinState", () => {
  const base = {
    opensAt: "2026-09-14T17:00:00.000Z",
    closesAt: "2026-09-14T19:00:00.000Z",
    status: "scheduled",
  };

  it("is open inside the window", () => {
    expect(checkinState({ ...base, now: new Date("2026-09-14T17:30:00.000Z") })).toBe(
      "open",
    );
  });

  it("is open exactly on the opening instant", () => {
    expect(checkinState({ ...base, now: new Date("2026-09-14T17:00:00.000Z") })).toBe(
      "open",
    );
  });

  it("is too early before the window", () => {
    expect(checkinState({ ...base, now: new Date("2026-09-14T16:59:59.000Z") })).toBe(
      "too_early",
    );
  });

  it("is closed after the window", () => {
    expect(checkinState({ ...base, now: new Date("2026-09-14T19:00:01.000Z") })).toBe(
      "closed",
    );
  });

  it("is cancelled regardless of the clock", () => {
    expect(
      checkinState({
        ...base,
        status: "cancelled",
        now: new Date("2026-09-14T17:30:00.000Z"),
      }),
    ).toBe("cancelled");
  });

  it("stays open across midnight", () => {
    expect(
      checkinState({
        opensAt: "2026-09-14T21:30:00.000Z",
        closesAt: "2026-09-15T00:30:00.000Z",
        status: "scheduled",
        now: new Date("2026-09-15T00:00:00.000Z"),
      }),
    ).toBe("open");
  });
});

describe("parseWeekdays", () => {
  it("sorts, de-duplicates and drops anything outside 1..7", () => {
    expect(parseWeekdays(["3", "1", "3", "0", "8", "x"])).toEqual([1, 3]);
  });
});

describe("weekStart / addDays", () => {
  it("snaps to the Monday of the same week", () => {
    expect(weekStart("2026-09-17")).toBe("2026-09-14");
    expect(weekStart("2026-09-14")).toBe("2026-09-14");
    expect(weekStart("2026-09-20")).toBe("2026-09-14"); // Sunday belongs to it
  });

  it("adds days across a month boundary", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });
});
