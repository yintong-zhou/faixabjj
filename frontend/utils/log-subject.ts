// What kind of thing an app_log row's subject_id points at, from the action
// that wrote it (utils/log.ts logEvent). The log stores ids only; /logs turns a
// gym into its name and a gym manager into theirs — both already visible to the
// superadmin — and says only the *kind* of anyone else, never a member's name.
export type SubjectKind = "gym" | "manager" | "member" | "account" | "request";

export function subjectKind(scope: string, action: string): SubjectKind {
  if (scope === "gyms") {
    return action === "resetManagerPassword" || action === "revokeManager" ? "manager" : "gym";
  }
  if (action === "rejectRegistration") return "request";
  // These two carry an auth user id, the others a person id.
  if (action === "setTemporaryPassword" || action === "revokeAccess") return "account";
  return "member";
}
