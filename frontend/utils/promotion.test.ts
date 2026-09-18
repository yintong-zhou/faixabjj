import { describe, expect, it } from "vitest";

import { nextStep, promotionStatus, type Criterion, type PromotionInput } from "./promotion";

describe("nextStep", () => {
  it("proposes the next stripe while there is room for one", () => {
    expect(nextStep("blue", 0)).toEqual({ belt: "blue", stripe: 1 });
    expect(nextStep("blue", 3)).toEqual({ belt: "blue", stripe: 4 });
  });

  it("proposes the next belt once the fourth stripe is there", () => {
    expect(nextStep("blue", 4)).toEqual({ belt: "purple", stripe: 0 });
    expect(nextStep("brown", 4)).toEqual({ belt: "black", stripe: 0 });
  });

  // The black belt has degrees, not stripes, and they are out of scope.
  it("proposes nothing at black", () => {
    expect(nextStep("black", 0)).toBeNull();
    expect(nextStep("black", 4)).toBeNull();
  });

  it("proposes nothing for a belt it does not know", () => {
    expect(nextStep("coral", 0)).toBeNull();
  });
});

// Fixed dates everywhere, so nothing drifts with the clock.
const opts = { today: "2026-09-18", trackingStartedOn: "2026-09-13" };

const CRITERIA: Criterion[] = [
  { belt: "blue", stripe: 0, min_hours: 108, min_time_at_rank_days: 183, min_age_years: null },
  { belt: "white", stripe: 1, min_hours: 40, min_time_at_rank_days: 61, min_age_years: null },
  { belt: "black", stripe: 0, min_hours: 216, min_time_at_rank_days: 365, min_age_years: 19 },
];

function person(overrides: Partial<PromotionInput> = {}): PromotionInput {
  return {
    current_belt: "white",
    current_stripes: 0,
    rank_since: "2026-01-01",
    stripe_since: "2026-01-01",
    joined_at: "2026-09-13",
    birth_date: null,
    lessons_since_rank: 0,
    lessons_since_stripe: 0,
    ...overrides,
  };
}

describe("promotionStatus", () => {
  it("measures a stripe against stripe_since and the stripe's own counter", () => {
    // 2026-06-01 to 2026-09-18 is 109 days, past the 61 required.
    // 30 lessons * 1.5 = 45 clock hours, past the 40 required.
    const status = promotionStatus(
      person({
        stripe_since: "2026-06-01",
        lessons_since_stripe: 30,
        lessons_since_rank: 99,
      }),
      CRITERIA,
      opts,
    );

    expect(status.next).toEqual({ belt: "white", stripe: 1 });
    expect(status.currentHours).toBe(45);
    expect(status.currentDays).toBe(109);
    expect(status.eligible).toBe(true);
    expect(status.blockers).toEqual([]);
  });

  it("measures a belt against rank_since and the belt's own counter", () => {
    const status = promotionStatus(
      person({
        current_stripes: 4,
        rank_since: "2025-01-01",
        lessons_since_rank: 80,
        lessons_since_stripe: 2,
      }),
      CRITERIA,
      opts,
    );

    expect(status.next).toEqual({ belt: "blue", stripe: 0 });
    expect(status.currentHours).toBe(120); // 80 * 1.5
    expect(status.requiredHours).toBe(108);
  });

  it("is eligible exactly at the threshold, not only past it", () => {
    // 61 days to the day, and 40 clock hours to the decimal.
    const status = promotionStatus(
      person({
        stripe_since: "2026-07-19",
        lessons_since_stripe: 40 / 1.5,
      }),
      CRITERIA,
      opts,
    );

    expect(status.currentDays).toBe(61);
    expect(status.currentHours).toBe(40);
    expect(status.eligible).toBe(true);
  });

  it("names what is missing rather than just saying no", () => {
    const status = promotionStatus(
      person({ stripe_since: "2026-09-01", lessons_since_stripe: 1 }),
      CRITERIA,
      opts,
    );

    expect(status.eligible).toBe(false);
    expect(status.blockers).toEqual(["hours", "time"]);
  });

  it("adds the estimated opening balance, anchored at the later of joining and the grade", () => {
    // Joined 2026-08-30, tracking from 2026-09-13: 14 days at 3 lessons a week
    // is 6 estimated lessons, and the grade dates back before joining, so the
    // anchor is the join date.
    const status = promotionStatus(
      person({
        joined_at: "2026-08-30",
        stripe_since: "2026-01-01",
        lessons_since_stripe: 0,
      }),
      CRITERIA,
      opts,
    );

    expect(status.currentHours).toBe(9); // 6 estimated lessons * 1.5
  });

  it("refuses to call somebody eligible when the age is unknown", () => {
    const status = promotionStatus(
      person({
        current_belt: "brown",
        current_stripes: 4,
        rank_since: "2020-01-01",
        lessons_since_rank: 500,
        birth_date: null,
      }),
      CRITERIA,
      opts,
    );

    expect(status.next).toEqual({ belt: "black", stripe: 0 });
    expect(status.eligible).toBe(false);
    expect(status.blockers).toEqual(["missing-birth-date"]);
  });

  it("blocks somebody under the minimum age", () => {
    const status = promotionStatus(
      person({
        current_belt: "brown",
        current_stripes: 4,
        rank_since: "2020-01-01",
        lessons_since_rank: 500,
        birth_date: "2010-01-01",
      }),
      CRITERIA,
      opts,
    );

    expect(status.blockers).toEqual(["age"]);
  });

  it("proposes nothing at black, and is never eligible there", () => {
    const status = promotionStatus(
      person({ current_belt: "black", current_stripes: 0 }),
      CRITERIA,
      opts,
    );

    expect(status.next).toBeNull();
    expect(status.eligible).toBe(false);
  });

  it("is never eligible for a grade no criterion describes", () => {
    const status = promotionStatus(
      person({ current_belt: "purple", current_stripes: 0 }),
      CRITERIA,
      opts,
    );

    expect(status.next).toEqual({ belt: "purple", stripe: 1 });
    expect(status.eligible).toBe(false);
    expect(status.blockers).toEqual(["no-criterion"]);
  });
});
