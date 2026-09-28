// The member's check-in, the parts that are pure: reading what check_in()
// answers, choosing the message, and naming a geolocation failure. The rule
// itself (distance, precision, window) lives in the database, not here.

import type { Dictionary } from "./i18n/dictionaries/it";

export type CheckinResult =
  | "ok"
  | "already"
  | "closed"
  | "location_needed"
  | "imprecise"
  | "too_far";

export type CheckinOutcome = { result: CheckinResult; distanceM: number | null };

const RESULTS: readonly string[] = [
  "ok",
  "already",
  "closed",
  "location_needed",
  "imprecise",
  "too_far",
];

// check_in() returns jsonb {result, distance_m}. Anything else — a missing
// migration, a changed function — is a failure the caller must log, never a
// result to guess at.
export function parseCheckinOutcome(data: unknown): CheckinOutcome | null {
  if (!data || typeof data !== "object") return null;
  const { result, distance_m } = data as { result?: unknown; distance_m?: unknown };
  if (typeof result !== "string" || !RESULTS.includes(result)) return null;
  return {
    result: result as CheckinResult,
    distanceM: typeof distance_m === "number" && Number.isFinite(distance_m) ? distance_m : null,
  };
}

// "already" counts as success: a second tap finding the first is the member
// being present, not an error to alarm them with.
export function checkinMessage(
  outcome: CheckinOutcome,
  t: Dictionary,
): { ok: boolean; text: string } {
  switch (outcome.result) {
    case "ok":
      return { ok: true, text: t.msg.checkinRecorded };
    case "already":
      return { ok: true, text: t.msg.alreadyPresent };
    case "closed":
      return { ok: false, text: t.msg.checkinClosed };
    case "location_needed":
      return { ok: false, text: t.checkin.locationNeeded };
    case "imprecise":
      return { ok: false, text: t.checkin.imprecise };
    case "too_far":
      return {
        ok: false,
        // The function always sends the distance with too_far; 0 would only
        // show if it did not, and still reads as "too far".
        text: t.checkin.tooFar(outcome.distanceM ?? 0),
      };
  }
}

export type GeoFailure = "denied" | "unavailable" | "timeout" | "unsupported";

// GeolocationPositionError: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE,
// 3 TIMEOUT. An unknown code is treated as "unavailable": retrying is the
// right advice for it.
export function geoFailure(code: number): GeoFailure {
  if (code === 1) return "denied";
  if (code === 3) return "timeout";
  return "unavailable";
}

// A number from a form field. Empty or not finite means "not sent": the
// database then answers location_needed instead of receiving NaN.
export function optionalNumber(raw: unknown): number | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

// A link, not an embed: no third-party script, no cookie.
export function mapUrl(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;
}
