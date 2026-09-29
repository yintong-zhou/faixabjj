import { describe, expect, it } from "vitest";
import { isValidUsername, normalizeUsername, suggestUsername, withSuffix } from "./username";

describe("normalizeUsername", () => {
  it("trims and lower-cases", () => {
    expect(normalizeUsername("  Mario.Rossi ")).toBe("mario.rossi");
  });
});

describe("isValidUsername", () => {
  it("accepts the allowed alphabet, 3 to 30 characters", () => {
    expect(isValidUsername("mario.rossi")).toBe(true);
    expect(isValidUsername("a_b-c.9")).toBe(true);
    expect(isValidUsername("abc")).toBe(true);
    expect(isValidUsername("a".repeat(30))).toBe(true);
  });

  it("refuses @, capitals, spaces and wrong lengths", () => {
    expect(isValidUsername("a@b")).toBe(false);
    expect(isValidUsername("Mario")).toBe(false);
    expect(isValidUsername("mario rossi")).toBe(false);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("a".repeat(31))).toBe(false);
  });
});

describe("suggestUsername", () => {
  it("joins the words with dots, without accents", () => {
    expect(suggestUsername("Mario Rossi")).toBe("mario.rossi");
    expect(suggestUsername("  José   Gonçalves ")).toBe("jose.goncalves");
    expect(suggestUsername("Søren Straße")).toBe("soren.strasse");
  });

  it("drops characters outside the alphabet", () => {
    expect(suggestUsername("Anna-Maria O'Neil")).toBe("anna-maria.oneil");
    expect(suggestUsername("Luca (Jr.)")).toBe("luca.jr");
  });

  it("always returns a valid username", () => {
    expect(suggestUsername("李雷")).toBe("user");
    expect(suggestUsername("")).toBe("user");
    expect(suggestUsername("Al")).toBe("al.user");
    const long = suggestUsername("Maximiliano Alessandro Bartolomeo Rossi");
    expect(long.length).toBeLessThanOrEqual(26);
    expect(isValidUsername(long)).toBe(true);
    expect(long.endsWith(".")).toBe(false);
  });
});

describe("withSuffix", () => {
  it("leaves the first try alone", () => {
    expect(withSuffix("mario.rossi", 1)).toBe("mario.rossi");
  });

  it("appends the number", () => {
    expect(withSuffix("mario.rossi", 2)).toBe("mario.rossi2");
    expect(withSuffix("mario.rossi", 50)).toBe("mario.rossi50");
  });

  it("keeps a 30-character base within 30", () => {
    const base = "a".repeat(30);
    expect(withSuffix(base, 2)).toBe("a".repeat(29) + "2");
    expect(withSuffix(base, 12).length).toBe(30);
    expect(isValidUsername(withSuffix(base, 12))).toBe(true);
  });
});
