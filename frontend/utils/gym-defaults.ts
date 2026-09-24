// What a new gym starts from. These used to be the app's constants; since the
// portal hosts several gyms they are each gym's own settings, stored on its
// `gym` row, and these values only fill the form for a gym being created.

export const DEFAULT_TIMEZONE = "Europe/Rome";

/** One attendance is one lesson; this is how long a lesson lasts on the mat. */
export const DEFAULT_SESSION_LENGTH_HOURS = 1;

/** Lessons a member is assumed to attend in a week, before records existed. */
export const DEFAULT_LESSONS_PER_WEEK = 3;

// A short list rather than every IANA zone: a select of four hundred entries
// is unusable on a phone, and these are the countries the portal serves. Add
// a zone here when a gym needs it — the database accepts any valid name.
export const GYM_TIMEZONES = [
  "Europe/Rome",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "America/Sao_Paulo",
  "America/New_York",
] as const;
