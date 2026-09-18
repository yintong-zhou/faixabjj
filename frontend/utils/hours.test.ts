import { describe, expect, it } from "vitest";

import { clockHours, estimatedHours, hoursFor, SESSION_LENGTH_HOURS } from "./hours";

// A fixed cutoff and a fixed "today", so the tests do not drift with the clock.
const opts = { trackingStartedOn: "2026-09-13", today: "2026-12-01" };

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
      trackingStartedOn: "2026-09-13",
      today: "2026-09-14",
    });
    const muchLater = estimatedHours(joined, {
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
  // attendance and calls each row an hour. This is the only conversion.
  it("turns counted lessons into the clock hours the criteria use", () => {
    expect(clockHours(100)).toBe(150);
    expect(SESSION_LENGTH_HOURS).toBe(1.5);
  });

  it("keeps one decimal, like every other hour figure in the app", () => {
    expect(clockHours(4.3)).toBe(6.5);
  });

  it("is zero for zero", () => {
    expect(clockHours(0)).toBe(0);
  });
});
