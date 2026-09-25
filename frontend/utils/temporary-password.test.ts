import { describe, expect, it } from "vitest";

import { generateTemporaryPassword } from "./temporary-password";

describe("generateTemporaryPassword", () => {
  it("draws three groups of four readable characters", () => {
    for (let i = 0; i < 200; i += 1) {
      const password = generateTemporaryPassword();
      expect(password).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{4}(-[a-km-zA-HJ-NP-Z2-9]{4}){2}$/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
    }
  });

  it("is never the same twice", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateTemporaryPassword()));
    expect(seen.size).toBe(500);
  });

  // 57 characters: 0 → "a", 25 → "A", 49 → "2", 1 → "b".
  const pattern = [0, 25, 49, 1];

  it("throws away the bytes that would bias the alphabet", () => {
    // Bytes from 228 up (4 × 57) are skipped, not wrapped round.
    const source = (buffer: Uint8Array) => {
      buffer.set([255, 228, ...Array.from({ length: buffer.length - 2 }, (_, i) => pattern[i % 4])]);
      return buffer;
    };
    expect(generateTemporaryPassword(source)).toBe("aA2b-aA2b-aA2b");
  });

  it("draws again when a character class is missing", () => {
    let calls = 0;
    const source = (buffer: Uint8Array) => {
      calls += 1;
      if (calls === 1) buffer.fill(0);
      else buffer.set(Array.from({ length: buffer.length }, (_, i) => pattern[i % 4]));
      return buffer;
    };
    expect(generateTemporaryPassword(source)).toBe("aA2b-aA2b-aA2b");
    expect(calls).toBe(2);
  });
});
