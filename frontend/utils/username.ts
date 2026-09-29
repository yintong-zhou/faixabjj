import { foldForSearch } from "./search";

// The rules of a username, shared by the forms, the actions and the login.
// The backfill in 20260930000000 follows suggestUsername() — change both
// together. Lower case only and never an `@`: the login tells a username from
// an email by the `@` alone.

export const USERNAME_MAX = 30;

const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

// Room left at the end of a suggestion for a numeric suffix (`mario.rossi2`).
const SUFFIX_ROOM = 4;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

// "José Gonçalves" → "jose.goncalves". Always valid: a name with nothing left
// after the strip becomes "user", a too-short one gets ".user" appended.
export function suggestUsername(fullName: string): string {
  const base = foldForSearch(fullName)
    .trim()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, USERNAME_MAX - SUFFIX_ROOM)
    .replace(/\.+$/, "");
  if (base.length === 0) return "user";
  if (base.length < 3) return `${base}.user`;
  return base;
}

// The n-th candidate for a wanted username: the name itself first, then
// name2, name3…, cut so the whole never exceeds the maximum.
export function withSuffix(base: string, n: number): string {
  if (n <= 1) return base;
  const tail = String(n);
  return base.slice(0, USERNAME_MAX - tail.length) + tail;
}
