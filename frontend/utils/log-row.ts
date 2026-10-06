// The app_log row for a failure. Pure, so it is tested; utils/log.ts writes it.
//
// `details` is left out on purpose: in a unique violation it carries the
// row's values (an email, say), and app_log is read in the app. Code and
// message name the constraint, never the data.
export type DbError = { code?: string | null; message?: string | null; details?: string | null };

export function errorRow(scope: string, where: string, error: DbError) {
  return {
    level: "error" as const,
    scope,
    action: where,
    code: error.code || null,
    message: error.message || null,
  };
}
