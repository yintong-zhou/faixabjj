import { describe, expect, it } from "vitest";
import { parseLoginIdentifier } from "./login-identifier";

describe("parseLoginIdentifier", () => {
  it("treats anything with @ as an email, trimmed", () => {
    expect(parseLoginIdentifier(" Mario@Example.com ")).toEqual({
      kind: "email",
      email: "Mario@Example.com",
    });
  });

  it("normalises a username", () => {
    expect(parseLoginIdentifier(" Mario.Rossi ")).toEqual({
      kind: "username",
      username: "mario.rossi",
    });
  });

  it("marks what can be neither as invalid", () => {
    expect(parseLoginIdentifier("")).toEqual({ kind: "invalid" });
    expect(parseLoginIdentifier("   ")).toEqual({ kind: "invalid" });
    expect(parseLoginIdentifier("ab")).toEqual({ kind: "invalid" });
    expect(parseLoginIdentifier("mario rossi")).toEqual({ kind: "invalid" });
  });
});
