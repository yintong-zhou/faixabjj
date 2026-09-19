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

  // The two ladders share their first rung, so white is the one belt whose
  // next step depends on who is wearing it.
  it("sends an adult white belt to blue and a child's to grey/white", () => {
    expect(nextStep("white", 4, { age: 30 })).toEqual({ belt: "blue", stripe: 0 });
    expect(nextStep("white", 3, { age: 9 })).toEqual({ belt: "gray_white", stripe: 0 });
  });

  it("reads an unknown age as an adult", () => {
    expect(nextStep("white", 4)).toEqual({ belt: "blue", stripe: 0 });
    expect(nextStep("white", 4, { age: null })).toEqual({ belt: "blue", stripe: 0 });
  });

  // Three degrees on a children's belt, not four, and the age is irrelevant
  // once the belt itself says which ladder this is.
  it("stops a children's belt at the third degree", () => {
    expect(nextStep("gray", 2)).toEqual({ belt: "gray", stripe: 3 });
    expect(nextStep("gray", 3)).toEqual({ belt: "gray_black", stripe: 0 });
  });

  it("walks the children's ladder from one colour group to the next", () => {
    expect(nextStep("gray_black", 3)).toEqual({ belt: "yellow_white", stripe: 0 });
    expect(nextStep("yellow_black", 3)).toEqual({ belt: "orange_white", stripe: 0 });
    expect(nextStep("orange_black", 3)).toEqual({ belt: "green_white", stripe: 0 });
  });

  // The transition at 16 is a judgement — green becomes blue *or* purple — so
  // there is nothing honest to propose past the last children's belt.
  it("proposes nothing past green/black", () => {
    expect(nextStep("green_black", 3)).toBeNull();
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
    // 45 lessons = 45 clock hours (one hour a lesson), past the 40 required.
    const status = promotionStatus(
      person({
        stripe_since: "2026-06-01",
        lessons_since_stripe: 45,
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
        lessons_since_rank: 120,
        lessons_since_stripe: 2,
      }),
      CRITERIA,
      opts,
    );

    expect(status.next).toEqual({ belt: "blue", stripe: 0 });
    expect(status.currentHours).toBe(120); // 120 lessons = 120 clock hours (one hour a lesson)
    expect(status.requiredHours).toBe(108);
  });

  it("is eligible exactly at the threshold, not only past it", () => {
    // 61 days to the day, and 40 clock hours to the decimal.
    const status = promotionStatus(
      person({
        stripe_since: "2026-07-19",
        lessons_since_stripe: 40, // one hour a lesson: 40 lessons = 40 clock hours
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

    expect(status.currentHours).toBe(6); // 6 estimated lessons = 6 clock hours (one hour a lesson)
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

  // The children's belts carry no criteria rows on purpose, so no child ever
  // reaches the eligibility queue however much they train.
  it("never calls a child eligible, because their ladder has no criteria", () => {
    const status = promotionStatus(
      person({
        current_belt: "gray",
        current_stripes: 3,
        birth_date: "2016-01-01",
        lessons_since_rank: 500,
        lessons_since_stripe: 500,
      }),
      CRITERIA,
      opts,
    );

    expect(status.next).toEqual({ belt: "gray_black", stripe: 0 });
    expect(status.eligible).toBe(false);
    expect(status.blockers).toEqual(["no-criterion"]);
  });

  // A child on a white belt is on the children's ladder, so the adult blue
  // criterion is never even the grade being measured.
  it("does not measure a child's white belt against the adult blue criterion", () => {
    const status = promotionStatus(
      person({
        current_belt: "white",
        current_stripes: 4,
        birth_date: "2018-01-01",
        lessons_since_rank: 500,
      }),
      CRITERIA,
      opts,
    );

    expect(status.next).toEqual({ belt: "gray_white", stripe: 0 });
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
