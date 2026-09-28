// Validation of the gym form, shared by "create" and "edit". Pure and
// unit-tested; the server actions call it because a form's `required` and
// `min` are skipped by a crafted POST.

import { GYM_TIMEZONES } from "./gym-defaults";

export type GymFormError =
  | "name"
  | "timezone"
  | "trackingStartedOn"
  | "sessionLengthHours"
  | "lessonsPerWeek"
  | "location";

export type GymForm = {
  name: string;
  timezone: string;
  trackingStartedOn: string;
  sessionLengthHours: number;
  lessonsPerWeek: number;
  latitude: number | null;
  longitude: number | null;
};

export type GymFormInput = Record<
  "name" | "timezone" | "tracking_started_on" | "session_length_hours" | "lessons_per_week",
  string | null | undefined
> &
  Partial<Record<"latitude" | "longitude", string | null | undefined>>;

export type ParsedGymForm =
  | { ok: true; value: GymForm }
  | { ok: false; error: GymFormError };

export type GymLocation = { latitude: number; longitude: number };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const trimmed = (raw: unknown) => (typeof raw === "string" ? raw.trim() : "");

// Both or neither. A comma is read as the decimal point, the way an Italian or
// Brazilian keyboard types it; the database re-checks the range
// (gym_location_valid).
export function parseLocation(
  rawLat: unknown,
  rawLng: unknown,
): { ok: true; value: GymLocation | null } | { ok: false } {
  const lat = trimmed(rawLat);
  const lng = trimmed(rawLng);
  if (lat === "" && lng === "") return { ok: true, value: null };
  if (lat === "" || lng === "") return { ok: false };

  const latitude = Number(lat.replace(",", "."));
  const longitude = Number(lng.replace(",", "."));
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return { ok: false };
  }
  return { ok: true, value: { latitude, longitude } };
}

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  // Date rolls 2026-02-31 over to 3 March; a real date survives the round trip.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function inRange(raw: string | null | undefined, min: number, max: number): number | null {
  const value = Number((raw ?? "").trim());
  return raw && Number.isFinite(value) && value > min && value <= max ? value : null;
}

export function parseGymForm(input: GymFormInput, today: string): ParsedGymForm {
  const name = (input.name ?? "").trim();
  if (name.length < 1 || name.length > 120) return { ok: false, error: "name" };

  const timezone = (input.timezone ?? "").trim();
  if (!(GYM_TIMEZONES as readonly string[]).includes(timezone)) {
    return { ok: false, error: "timezone" };
  }

  // Never in the future: the estimate would keep growing over weeks in which
  // members are already checking in, and both would count.
  const trackingStartedOn = (input.tracking_started_on ?? "").trim();
  if (!isRealDate(trackingStartedOn) || trackingStartedOn > today) {
    return { ok: false, error: "trackingStartedOn" };
  }

  const sessionLengthHours = inRange(input.session_length_hours, 0, 8);
  if (sessionLengthHours === null) return { ok: false, error: "sessionLengthHours" };

  const lessonsPerWeek = inRange(input.lessons_per_week, 0, 14);
  if (lessonsPerWeek === null) return { ok: false, error: "lessonsPerWeek" };

  const location = parseLocation(input.latitude, input.longitude);
  if (!location.ok) return { ok: false, error: "location" };

  return {
    ok: true,
    value: {
      name,
      timezone,
      trackingStartedOn,
      sessionLengthHours,
      lessonsPerWeek,
      latitude: location.value?.latitude ?? null,
      longitude: location.value?.longitude ?? null,
    },
  };
}

// Deleting a gym erases everything it holds, so the name must be typed
// exactly — case included. Surrounding spaces are forgiven, nothing else.
export function deletionConfirmed(name: string, typed: string | null | undefined): boolean {
  return !!typed && typed.trim() === name;
}
