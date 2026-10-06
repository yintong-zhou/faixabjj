import { describe, expect, it } from "vitest";

import { errorRow } from "./log-row";

describe("errorRow", () => {
  it("keeps code and message and never the details", () => {
    const row = errorRow("members", "addPerson", {
      code: "23505",
      message: 'duplicate key value violates unique constraint "person_email_key"',
      details: "Key (email)=(someone@example.com) already exists.",
    });
    expect(row).toEqual({
      level: "error",
      scope: "members",
      action: "addPerson",
      code: "23505",
      message: 'duplicate key value violates unique constraint "person_email_key"',
    });
    expect(JSON.stringify(row)).not.toContain("someone@example.com");
  });

  it("stores missing or empty fields as null", () => {
    expect(errorRow("login", "signInWithPassword", { code: "", message: null })).toEqual({
      level: "error",
      scope: "login",
      action: "signInWithPassword",
      code: null,
      message: null,
    });
  });
});
