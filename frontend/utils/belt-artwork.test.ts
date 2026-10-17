import { describe, expect, it } from "vitest";

import { beltImageSrc } from "./belt-artwork";

describe("beltImageSrc", () => {
  it("names the file after the enum value, `_` as `-`", () => {
    expect(beltImageSrc("blue", 2)).toBe("/belts/adults/blue-2-stripe.png");
    expect(beltImageSrc("gray_white", 1)).toBe("/belts/kids/gray-white-1-stripe.png");
  });

  it("caps stripes at what the artwork has, per colour", () => {
    expect(beltImageSrc("blue", 9)).toBe("/belts/adults/blue-4-stripe.png");
    expect(beltImageSrc("black", 9)).toBe("/belts/adults/black-6-stripe.png");
    expect(beltImageSrc("green", 4)).toBe("/belts/kids/green-3-stripe.png");
    expect(beltImageSrc("white", -1)).toBe("/belts/adults/white-0-stripe.png");
  });

  it("has nothing for a belt without artwork", () => {
    expect(beltImageSrc("coral", 0)).toBeNull();
  });
});
