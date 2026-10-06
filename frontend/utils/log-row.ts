// The app_log row for a failure. Pure, so it is tested; utils/log.ts writes it.
//
// `details` is left out on purpose: in a unique violation it carries the
// row's values (an email, say), and app_log is read in the app. Code and
// message name the constraint — and an address a message happens to quote is
// masked, since ids are all the log may hold.
export type DbError = { code?: string | null; message?: string | null; details?: string | null };

// Failures anyone can cause at will — a login POST without the challenge, a
// wrong password, an address already registered — say nothing about the
// system and would push every useful row past the 2000-row cap: console only.
const OUTSIDER_CODES = new Set([
  "invalid_credentials",
  "captcha_failed",
  "over_request_rate_limit",
  "email_exists",
]);

const EMAIL = /[^\s"'<>]+@[^\s"'<>]+/g;

export function errorRow(scope: string, where: string, error: DbError) {
  if (error.code && OUTSIDER_CODES.has(error.code)) return null;
  return {
    level: "error" as const,
    scope,
    action: where,
    code: error.code || null,
    message: error.message?.replace(EMAIL, "<email>") || null,
  };
}
