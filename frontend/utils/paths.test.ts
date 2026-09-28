import { describe, expect, it } from "vitest";

import { safeNextPath, underPath } from "./paths";

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

describe("safeNextPath", () => {
  it("keeps a path on this site, with its query and hash", () => {
    expect(safeNextPath("/members", "/dashboard")).toBe("/members");
    expect(safeNextPath("/members?q=ana&p=2#top", "/dashboard")).toBe("/members?q=ana&p=2#top");
  });

  it("refuses anything that leaves the site", () => {
    for (const next of [
      "https://attacker.example/",
      "//attacker.example",
      "/\\attacker.example",
      "\\\\attacker.example",
      "/\t/attacker.example",
      "javascript:alert(1)",
      "members",
      "",
    ]) {
      expect(safeNextPath(next, "/dashboard")).toBe("/dashboard");
    }
  });

  it("falls back when there is no destination", () => {
    expect(safeNextPath(null, "/")).toBe("/");
    expect(safeNextPath(undefined, "/dashboard")).toBe("/dashboard");
  });
});
