import { describe, expect, it } from "vitest";
import { LINK_TTL_SECONDS, readLink, signLink } from "./auth-link-token";

const SECRET = "s".repeat(32);
const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const reset = { k: "reset" as const, u: "user-1", b: "2026-10-10T11:00:00Z" };

describe("auth link token", () => {
  it("round-trips a genuine link", () => {
    const token = signLink(reset, SECRET, NOW);
    expect(readLink(token, "reset", SECRET, NOW)).toEqual({ ...reset, x: NOW / 1000 + LINK_TTL_SECONDS });
  });

  it("expires after 30 minutes", () => {
    const token = signLink(reset, SECRET, NOW);
    expect(readLink(token, "reset", SECRET, NOW + (LINK_TTL_SECONDS - 1) * 1000)).not.toBeNull();
    expect(readLink(token, "reset", SECRET, NOW + LINK_TTL_SECONDS * 1000)).toBeNull();
  });

  it("refuses another secret, another kind and a tampered payload", () => {
    const token = signLink(reset, SECRET, NOW);
    expect(readLink(token, "reset", "t".repeat(32), NOW)).toBeNull();
    expect(readLink(token, "email", SECRET, NOW)).toBeNull();

    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...reset, u: "user-2", x: NOW / 1000 + 60 })).toString("base64url");
    expect(readLink(`${forged}.${signature}`, "reset", SECRET, NOW)).toBeNull();
  });

  it("refuses garbage", () => {
    for (const junk of [undefined, null, 42, "", "a", "a.b", "a.b.c", "x".repeat(3000)]) {
      expect(readLink(junk, "reset", SECRET, NOW)).toBeNull();
    }
  });

  it("carries the new address of an email change", () => {
    const token = signLink({ k: "email", u: "user-1", b: "old@example.test", e: "new@example.test" }, SECRET, NOW);
    expect(readLink(token, "email", SECRET, NOW)?.e).toBe("new@example.test");
  });
});
