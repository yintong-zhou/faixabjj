import { describe, expect, it } from "vitest";

import { isPortalOnly, PORTAL_ONLY_ROLE } from "./members";

describe("isPortalOnly", () => {
  it("is true only when the sole active role is admin", () => {
    expect(isPortalOnly([PORTAL_ONLY_ROLE])).toBe(true);
  });

  it("is false for somebody who is both admin and staff: they still train", () => {
    expect(isPortalOnly(["head_coach", "admin"])).toBe(false);
    expect(isPortalOnly(["admin", "instructor"])).toBe(false);
  });

  it("is false for a member with no role at all — that is an allievo, who holds a belt", () => {
    expect(isPortalOnly([])).toBe(false);
    expect(isPortalOnly(null)).toBe(false);
    expect(isPortalOnly(undefined)).toBe(false);
  });

  it("is false for every other single role", () => {
    for (const role of ["student", "assistant", "instructor", "head_coach"]) {
      expect(isPortalOnly([role])).toBe(false);
    }
  });
});
