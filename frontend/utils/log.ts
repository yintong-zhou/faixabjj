import "server-only";

// One place to report a database failure to the server log.
//
// Nothing from the database is ever put on screen: the codes and constraint
// names describe the schema, and that is not a member's business. The reason
// goes here instead, where whoever runs the gym's deployment can find it.
//
// The rule this exists to enforce is that a query which fails must never look
// like a query that returned nothing. A dashboard rendering zeros, a list
// rendering empty and a check-in reported as "closed" have all, at some point
// in this project, been a broken query with no trace of itself anywhere.
export function logDbError(
  scope: string,
  where: string,
  error: { code?: string | null; message?: string | null; details?: string | null },
) {
  console.error(
    `[${scope}] ${where} failed: ${error.code ?? "no code"} ${error.message ?? ""} ${
      error.details ?? ""
    }`.trim(),
  );
}
