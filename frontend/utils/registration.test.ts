import { describe, expect, it } from "vitest";
import { beltsForAge, parseRegistration, type FieldGetter } from "./registration";

const TODAY = "2026-10-02";

const BASE: Record<string, string> = {
  full_name: "  Mario Rossi ",
  email: " Mario@Example.com ",
  username: " Mario.Rossi ",
  password: "segreta123",
  password_repeat: "segreta123",
  privacy: "on",
  birth_date: "1990-05-01",
  joined_at: "2026-09-01",
  experienced: "no",
};

const getter = (fields: Record<string, string>): FieldGetter => (key) => fields[key] ?? null;
const parse = (overrides: Record<string, string> = {}, mode: "signup" | "approval" = "signup") =>
  parseRegistration(getter({ ...BASE, ...overrides }), TODAY, mode);

describe("beltsForAge", () => {
  it("gives the kids' ladder under 16, both at 16-17, adults from 18", () => {
    expect(beltsForAge(15)).toContain("gray");
    expect(beltsForAge(15)).not.toContain("blue");
    expect(beltsForAge(16)).toContain("gray");
    expect(beltsForAge(17)).toContain("blue");
    expect(beltsForAge(18)).toContain("blue");
    expect(beltsForAge(18)).not.toContain("gray");
  });
});

describe("parseRegistration", () => {
  it("normalises name, email and username", () => {
    const result = parse();
    expect(result).toMatchObject({
      ok: true,
      value: { fullName: "Mario Rossi", email: "mario@example.com", username: "mario.rossi", password: "segreta123" },
    });
  });

  it("starts a beginner at white 0 with both dates at the join date", () => {
    const result = parse({ current_belt: "purple", current_stripes: "3", rank_since: "2020-01-01" });
    expect(result).toMatchObject({
      ok: true,
      value: { belt: "white", stripes: 0, rankSince: "2026-09-01", stripeSince: "2026-09-01" },
    });
  });

  it("takes belt, stripes and dates from an experienced athlete", () => {
    const result = parse({
      experienced: "yes", current_belt: "blue", current_stripes: "2",
      rank_since: "2024-03-10", stripe_since: "2025-11-20",
    });
    expect(result).toMatchObject({
      ok: true,
      value: { belt: "blue", stripes: 2, rankSince: "2024-03-10", stripeSince: "2025-11-20" },
    });
  });

  it("defaults a missing belt date to the join date and a missing stripe date to the belt date", () => {
    expect(parse({ experienced: "yes", current_belt: "blue", current_stripes: "1" })).toMatchObject({
      ok: true, value: { rankSince: "2026-09-01", stripeSince: "2026-09-01" },
    });
    expect(
      parse({ experienced: "yes", current_belt: "blue", current_stripes: "1", rank_since: "2026-09-15" }),
    ).toMatchObject({ ok: true, value: { rankSince: "2026-09-15", stripeSince: "2026-09-15" } });
  });

  it("ignores a stripe date when there are no stripes", () => {
    expect(
      parse({ experienced: "yes", current_belt: "blue", current_stripes: "0", rank_since: "2025-01-01", stripe_since: "2025-06-01" }),
    ).toMatchObject({ ok: true, value: { stripeSince: "2025-01-01" } });
  });

  it("refuses missing or malformed required fields", () => {
    expect(parse({ full_name: "  " })).toEqual({ ok: false, error: "nameRequired" });
    expect(parse({ email: "mario" })).toEqual({ ok: false, error: "emailInvalid" });
    expect(parse({ username: "a@b" })).toEqual({ ok: false, error: "usernameInvalid" });
    expect(parse({ birth_date: "" })).toEqual({ ok: false, error: "birthDateInvalid" });
    expect(parse({ birth_date: "2026-10-02" })).toEqual({ ok: false, error: "birthDateInvalid" });
    expect(parse({ birth_date: "1990-02-30" })).toEqual({ ok: false, error: "birthDateInvalid" });
    expect(parse({ joined_at: "" })).toEqual({ ok: false, error: "joinedAtInvalid" });
    expect(parse({ experienced: "" })).toEqual({ ok: false, error: "experienceRequired" });
  });

  it("checks passwords and consent only at signup", () => {
    expect(parse({ password: "short", password_repeat: "short" })).toEqual({ ok: false, error: "passwordTooShort" });
    expect(parse({ password_repeat: "different1" })).toEqual({ ok: false, error: "passwordMismatch" });
    expect(parse({ privacy: "" })).toEqual({ ok: false, error: "consentRequired" });
    expect(parse({ password: "", password_repeat: "", privacy: "" }, "approval")).toMatchObject({
      ok: true, value: { password: null },
    });
  });

  it("refuses future dates and a stripe before the belt", () => {
    expect(parse({ joined_at: "2026-10-03" })).toEqual({ ok: false, error: "dateInFuture" });
    expect(
      parse({ experienced: "yes", current_belt: "blue", current_stripes: "1", rank_since: "2026-10-05" }),
    ).toEqual({ ok: false, error: "dateInFuture" });
    expect(
      parse({ experienced: "yes", current_belt: "blue", current_stripes: "1", rank_since: "2025-01-01", stripe_since: "2024-01-01" }),
    ).toEqual({ ok: false, error: "stripeBeforeBelt" });
    expect(
      parse({ experienced: "yes", current_belt: "blue", current_stripes: "1", rank_since: "2025-13-01" }),
    ).toEqual({ ok: false, error: "dateInvalid" });
  });

  it("checks the belt against the ladder for the age", () => {
    expect(parse({ experienced: "yes", current_belt: "", current_stripes: "0" })).toEqual({ ok: false, error: "beltInvalid" });
    expect(parse({ experienced: "yes", current_belt: "pink", current_stripes: "0" })).toEqual({ ok: false, error: "beltInvalid" });
    // 15 years old on TODAY: kids' belts only.
    expect(parse({ birth_date: "2011-01-01", experienced: "yes", current_belt: "blue", current_stripes: "0" })).toEqual({
      ok: false, error: "beltForAge",
    });
    expect(parse({ experienced: "yes", current_belt: "gray", current_stripes: "0" })).toEqual({ ok: false, error: "beltForAge" });
    expect(parse({ birth_date: "2009-06-01", experienced: "yes", current_belt: "green", current_stripes: "0" })).toMatchObject({ ok: true });
  });

  it("allows 0-4 stripes on adult belts and 0-3 on kids' belts", () => {
    expect(parse({ experienced: "yes", current_belt: "blue", current_stripes: "4" })).toMatchObject({ ok: true });
    expect(parse({ experienced: "yes", current_belt: "blue", current_stripes: "5" })).toEqual({ ok: false, error: "stripesInvalid" });
    expect(parse({ experienced: "yes", current_belt: "blue", current_stripes: "1.5" })).toEqual({ ok: false, error: "stripesInvalid" });
    expect(
      parse({ birth_date: "2016-01-01", experienced: "yes", current_belt: "gray", current_stripes: "4" }),
    ).toEqual({ ok: false, error: "stripesInvalid" });
  });
});
