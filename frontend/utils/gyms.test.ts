import { describe, expect, it } from "vitest";

import { deletionConfirmed, parseGymForm } from "./gyms";

const TODAY = "2026-09-24";
const valid = {
  name: "  ASD Little Gym  ",
  timezone: "Europe/Rome",
  tracking_started_on: "2026-09-13",
  session_length_hours: "1",
  lessons_per_week: "3",
};

describe("parseGymForm", () => {
  it("accepts a valid form and trims the name", () => {
    expect(parseGymForm(valid, TODAY)).toEqual({
      ok: true,
      value: {
        name: "ASD Little Gym",
        timezone: "Europe/Rome",
        trackingStartedOn: "2026-09-13",
        sessionLengthHours: 1,
        lessonsPerWeek: 3,
      },
    });
  });

  it("accepts a decimal lesson length", () => {
    const parsed = parseGymForm({ ...valid, session_length_hours: "1.5" }, TODAY);
    expect(parsed.ok && parsed.value.sessionLengthHours).toBe(1.5);
  });

  it("refuses an empty or over-long name", () => {
    expect(parseGymForm({ ...valid, name: "   " }, TODAY)).toEqual({ ok: false, error: "name" });
    expect(parseGymForm({ ...valid, name: "x".repeat(121) }, TODAY)).toEqual({ ok: false, error: "name" });
  });

  it("refuses a timezone outside the allowed list", () => {
    expect(parseGymForm({ ...valid, timezone: "Mars/Olympus" }, TODAY)).toEqual({ ok: false, error: "timezone" });
  });

  // A future go-live date would let the estimate and the real check-ins both
  // count the same weeks — see utils/hours.ts.
  it("refuses a future or malformed tracking start", () => {
    expect(parseGymForm({ ...valid, tracking_started_on: "2026-09-25" }, TODAY)).toEqual({ ok: false, error: "trackingStartedOn" });
    expect(parseGymForm({ ...valid, tracking_started_on: "13/09/2026" }, TODAY)).toEqual({ ok: false, error: "trackingStartedOn" });
    expect(parseGymForm({ ...valid, tracking_started_on: "2026-02-31" }, TODAY)).toEqual({ ok: false, error: "trackingStartedOn" });
  });

  it("refuses zero, negative or absurd lesson figures", () => {
    expect(parseGymForm({ ...valid, session_length_hours: "0" }, TODAY)).toEqual({ ok: false, error: "sessionLengthHours" });
    expect(parseGymForm({ ...valid, session_length_hours: "9" }, TODAY)).toEqual({ ok: false, error: "sessionLengthHours" });
    expect(parseGymForm({ ...valid, lessons_per_week: "-1" }, TODAY)).toEqual({ ok: false, error: "lessonsPerWeek" });
    expect(parseGymForm({ ...valid, lessons_per_week: "abc" }, TODAY)).toEqual({ ok: false, error: "lessonsPerWeek" });
    expect(parseGymForm({ ...valid, lessons_per_week: "15" }, TODAY)).toEqual({ ok: false, error: "lessonsPerWeek" });
  });
});

describe("deletionConfirmed", () => {
  it("needs the exact name, ignoring surrounding spaces", () => {
    expect(deletionConfirmed("ASD Little Gym", " ASD Little Gym ")).toBe(true);
  });

  it("refuses a different case, a partial name or nothing", () => {
    expect(deletionConfirmed("ASD Little Gym", "asd little gym")).toBe(false);
    expect(deletionConfirmed("ASD Little Gym", "ASD")).toBe(false);
    expect(deletionConfirmed("ASD Little Gym", null)).toBe(false);
    expect(deletionConfirmed("ASD Little Gym", "")).toBe(false);
  });
});
