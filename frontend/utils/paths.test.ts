import { describe, expect, it } from "vitest";

import { underPath } from "./paths";

describe("underPath", () => {
  it("matches the path itself and anything below it", () => {
    expect(underPath("/gyms", "/gyms")).toBe(true);
    expect(underPath("/gyms/new", "/gyms")).toBe(true);
    expect(underPath("/check-in", "/check-in")).toBe(true);
  });

  it("does not confuse /gym with /gyms", () => {
    expect(underPath("/gyms", "/gym")).toBe(false);
    expect(underPath("/gyms/abc", "/gym")).toBe(false);
    expect(underPath("/gym", "/gyms")).toBe(false);
    expect(underPath("/gym", "/gym")).toBe(true);
  });

  it("does not match a longer segment", () => {
    expect(underPath("/membersx", "/members")).toBe(false);
    expect(underPath("/", "/members")).toBe(false);
  });
});
