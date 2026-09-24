import { describe, expect, it } from "vitest";

import { clockHours, estimatedHours, hoursFor } from "./hours";

// ASD Little Gym's figures, and a fixed "today", so the tests do not drift.
const ASD_LITTLE_GYM = { trackingStartedOn: "2026-09-13", lessonsPerWeek: 3, sessionLengthHours: 1 };
const opts = { ...ASD_LITTLE_GYM, today: "2026-12-01" };

describe("estimatedHours", () => {
  it("counts three hours per whole week before the cutoff", () => {
    // 2026-08-30 to 2026-09-13 is exactly 14 days.
    expect(estimatedHours("2026-08-30", opts)).toBe(6);
  });

  it("counts a partial week pro rata rather than rounding it up", () => {
    // 7 days + 3 days = 10 days → 10/7 * 3 ≈ 4.3
    expect(estimatedHours("2026-09-03", opts)).toBe(4.3);
  });

  it("is zero for somebody who joined on or after the cutoff", () => {
    expect(estimatedHours("2026-09-13", opts)).toBe(0);
    expect(estimatedHours("2026-10-01", opts)).toBe(0);
  });

  it("is zero without a join date", () => {
    expect(estimatedHours(null, opts)).toBe(0);
    expect(estimatedHours(undefined, opts)).toBe(0);
  });

  // The invariant the whole design rests on: the estimate is an opening
  // balance, not a running total. Once tracking has started it must return the
  // same number however much later it is asked, so that every hour after
  // go-live can only come from a check-in or a roll call.
  it("is frozen once tracking has started", () => {
    const joined = "2026-01-01";
    const first = estimatedHours(joined, {
      ...ASD_LITTLE_GYM,
      trackingStartedOn: "2026-09-13",
      today: "2026-09-14",
    });
    const muchLater = estimatedHours(joined, {
      ...ASD_LITTLE_GYM,
      trackingStartedOn: "2026-09-13",
      today: "2029-04-22",
    });

    expect(muchLater).toBe(first);
  });

  // A go-live date left in the future must not let the estimate run past the
  // present day, or it would count weeks that have not happened.
  it("never estimates beyond today", () => {
    expect(
      estimatedHours("2026-09-01", {
        ...ASD_LITTLE_GYM,
        trackingStartedOn: "2027-01-01",
        today: "2026-09-15",
      }),
    ).toBe(6);
  });
});

describe("hoursFor", () => {
  it("adds the counted hours to the estimated ones", () => {
    const hours = hoursFor("2026-08-30", 12, opts);
    expect(hours).toEqual({
      recorded: 12,
      estimated: 6,
      total: 18,
      isPartlyEstimated: true,
    });
  });

  it("says nothing is estimated for a member who joined after the cutoff", () => {
    const hours = hoursFor("2026-10-01", 4, opts);
    expect(hours.estimated).toBe(0);
    expect(hours.total).toBe(4);
    expect(hours.isPartlyEstimated).toBe(false);
  });

  // total_hours arrives from PostgREST as a string often enough to matter.
  it("tolerates a missing or string recorded value", () => {
    expect(hoursFor("2026-10-01", null, opts).total).toBe(0);
    expect(hoursFor("2026-10-01", "7.5", opts).total).toBe(7.5);
  });
});

describe("clockHours", () => {
  // The promotion criteria are stated in clock hours; the app counts
  // attendance and calls each row an hour. This is the only conversion —
  // currently the identity, since this gym's lesson lasts one hour.
  it("turns counted lessons into the clock hours the criteria use", () => {
    expect(clockHours(100, ASD_LITTLE_GYM)).toBe(100);
  });

  // A lessons value with two decimal places, so this still fails if the
  // multiply-and-round step were dropped rather than merely re-scaled.
  it("keeps one decimal, like every other hour figure in the app", () => {
    expect(clockHours(4.36, ASD_LITTLE_GYM)).toBe(4.4);
  });

  it("is zero for zero", () => {
    expect(clockHours(0, ASD_LITTLE_GYM)).toBe(0);
  });
});

describe("per-gym settings", () => {
  it("scales the estimate with the gym's lessons per week", () => {
    // 14 days before the cutoff at 2 lessons a week = 4.
    expect(estimatedHours("2026-08-30", { ...opts, lessonsPerWeek: 2 })).toBe(4);
  });

  it("moves the cutoff with the gym's own go-live date", () => {
    // Joined 2026-08-30, another gym went live on 2026-09-06: one week, 3 h.
    expect(estimatedHours("2026-08-30", { ...opts, trackingStartedOn: "2026-09-06" })).toBe(3);
  });

  it("converts lessons with the gym's lesson length", () => {
    expect(clockHours(10, { sessionLengthHours: 1.5 })).toBe(15);
  });
});
