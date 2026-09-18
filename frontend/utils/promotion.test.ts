import { describe, expect, it } from "vitest";

import { nextStep } from "./promotion";

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
