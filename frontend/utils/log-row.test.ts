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

  it("never stores an email that a message quotes", () => {
    const row = errorRow("join", "register:createUser", {
      code: "email_address_invalid",
      message: 'Email address "someone@example.com" is invalid',
    });
    expect(row?.message).toBe('Email address "<email>" is invalid');
  });

  // Failures anyone can cause at will — a login POST without the challenge, a
  // wrong password, an address already registered — would push every useful
  // row past the 2000-row cap. They stay on the console only.
  it("returns null for failures an outsider can cause", () => {
    for (const code of ["invalid_credentials", "captcha_failed", "over_request_rate_limit", "email_exists"]) {
      expect(errorRow("login", "signInWithPassword", { code, message: "x" })).toBeNull();
    }
    expect(errorRow("login", "signInWithPassword", { code: "500", message: "x" })).not.toBeNull();
  });
});
