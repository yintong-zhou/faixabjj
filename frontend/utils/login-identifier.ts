import { isValidUsername, normalizeUsername } from "./username";

// What the login's single field holds. An `@` means an email, passed on as
// typed; anything else is a username, normalised the way it was stored. What
// is neither still reaches a sign-in attempt (see login/actions.ts), so it
// fails like a wrong password rather than with a message of its own.
export type LoginIdentifier =
  | { kind: "email"; email: string }
  | { kind: "username"; username: string }
  | { kind: "invalid" };

export function parseLoginIdentifier(raw: string): LoginIdentifier {
  const value = raw.trim();
  if (!value) return { kind: "invalid" };
  if (value.includes("@")) return { kind: "email", email: value };
  const username = normalizeUsername(value);
  return isValidUsername(username) ? { kind: "username", username } : { kind: "invalid" };
}
