import "server-only";

import { after } from "next/server";

import { errorRow, type DbError } from "@/utils/log-row";
import { createAdminClient, isAdminClientConfigured } from "@/utils/supabase/admin";

// One place to report a database failure — and, since app_log, a key event.
//
// Nothing from the database is ever put on screen: the codes and constraint
// names describe the schema, and that is not a member's business. The reason
// goes to the server log, where whoever runs the gym's deployment can find it,
// and to app_log, which the platform superadmin reads on /logs.
//
// The rule this exists to enforce is that a query which fails must never look
// like a query that returned nothing. A dashboard rendering zeros, a list
// rendering empty and a check-in reported as "closed" have all, at some point
// in this project, been a broken query with no trace of itself anywhere.
export function logDbError(scope: string, where: string, error: DbError) {
  console.error(
    `[${scope}] ${where} failed: ${error.code ?? "no code"} ${error.message ?? ""} ${
      error.details ?? ""
    }`.trim(),
  );
  persist(errorRow(scope, where, error));
}

// A key action that succeeded: who (actor), in which gym, on what (subject).
// Ids only — never a name or an email.
export function logEvent(
  session: { userId: string; gymId: string | null },
  scope: string,
  action: string,
  subjectId?: string | null,
) {
  persist({
    level: "event",
    scope,
    action,
    actor_id: session.userId,
    gym_id: session.gymId,
    subject_id: subjectId ?? null,
  });
}

// Written after the response, with the service role (only it may insert).
// Logging must never break or delay the action it describes: without the
// secret key, outside a request (after() throws there) or on a failed insert,
// the console is all there is — and never logDbError, which would recurse.
function persist(row: Record<string, unknown>) {
  if (!isAdminClientConfigured()) return;
  try {
    after(async () => {
      const { error } = await createAdminClient().from("app_log").insert(row);
      if (error) {
        console.error(`[log] app_log insert failed: ${error.code ?? "no code"} ${error.message ?? ""}`.trim());
      }
    });
  } catch {
    // No request scope: nothing to attach the write to.
  }
}
