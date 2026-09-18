"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOrCreateProfile } from "@/utils/supabase/profile";
import {
  requireAdmin,
  requireClassManager,
} from "@/utils/supabase/require-admin";
import { getDictionary } from "@/utils/i18n/server";

const PATH = "/attendance";

function back(params: Record<string, string>, query?: string) {
  const search = new URLSearchParams(query ?? "");
  for (const [key, value] of Object.entries(params)) {
    search.set(key, value);
  }
  redirect(`${PATH}?${search.toString()}`);
}

function backToSession(
  sessionId: string,
  params: Record<string, string>,
  from?: string,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    search.set(key, value);
  }
  if (from) {
    search.set("from", from);
  }
  redirect(`/attendance/${sessionId}?${search.toString()}`);
}

// The member is told something they can act on; the reason goes to the server
// log, where whoever runs the gym's deployment can find it. Nothing from the
// database is ever put on screen: the codes and constraint names describe the
// schema, and that is not a member's business.
function logDbError(
  where: string,
  error: { code?: string | null; message?: string | null; details?: string | null },
) {
  console.error(
    `[attendance] ${where} failed: ${error.code ?? "no code"} ${error.message ?? ""} ${
      error.details ?? ""
    }`.trim(),
  );
}

// ---------------------------------------------------------------------------
// Student check-in
// ---------------------------------------------------------------------------
// Runs on the member's own Supabase client, so RLS decides. The time window is
// not re-checked here on purpose: the policy enforces it, and a second copy in
// TypeScript would be a second definition free to drift from the first.
export async function checkIn(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase, userId, email } = await requireAdmin(PATH);
  const query = (formData.get("_query") as string | null) ?? "";
  const sessionId = formData.get("session_id") as string;

  if (!sessionId) {
    back({ error: t.msg.sessionNotSpecified }, query);
    return;
  }

  const profile = await getOrCreateProfile(supabase, userId, email);
  if (!profile) {
    back({ error: t.msg.profileUnavailable }, query);
    return;
  }

  const { error } = await supabase.from("attendance").insert({
    person_id: profile.id,
    session_id: sessionId,
    present: true,
    checked_in_by: "self",
  });

  if (error) {
    // Only two codes mean something the member can act on. Everything else —
    // the network, a missing migration, a mangled session id — used to be
    // reported as "check-in closed", which sends both the member and the
    // instructor to look at the clock for a problem that is not there.
    let message = t.msg.checkinFailed;
    if (error.code === "23505") message = t.msg.alreadyPresent;
    else if (error.code === "42501") message = t.msg.checkinClosed;
    else logDbError("checkIn", error);

    back({ error: message }, query);
    return;
  }

  revalidatePath(PATH);
  back({ ok: t.msg.checkinRecorded }, query);
}

export async function undoCheckIn(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase, userId, email } = await requireAdmin(PATH);
  const query = (formData.get("_query") as string | null) ?? "";
  const sessionId = formData.get("session_id") as string;

  if (!sessionId) {
    back({ error: t.msg.sessionNotSpecified }, query);
    return;
  }

  const profile = await getOrCreateProfile(supabase, userId, email);
  if (!profile) {
    back({ error: t.msg.profileUnavailable }, query);
    return;
  }

  // RLS allows this only on the member's own 'self' row and only while the
  // window is open, so a silent zero-row delete means it was refused.
  const { data, error } = await supabase
    .from("attendance")
    .delete()
    .eq("person_id", profile.id)
    .eq("session_id", sessionId)
    .eq("checked_in_by", "self")
    .select("id");

  // A refusal deletes nothing and raises nothing; an error is a different
  // event and must not be dressed up as "too late", which would send the
  // member looking at the clock.
  if (error) {
    logDbError("undoCheckIn", error);
    back({ error: t.msg.undoFailed }, query);
    return;
  }

  if (!data || data.length === 0) {
    back({ error: t.msg.undoTooLate }, query);
    return;
  }

  revalidatePath(PATH);
  back({ ok: t.msg.checkinUndone }, query);
}

// ---------------------------------------------------------------------------
// Roll call
// ---------------------------------------------------------------------------
// One form, one save. The three states per member are "" (not recorded),
// "present" and "absent"; "not recorded" is a real answer and means no row,
// which is different information from an explicit absence.
export async function saveRollCall(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireClassManager(PATH);
  const sessionId = formData.get("session_id") as string;
  const from = (formData.get("from") as string | null) ?? "";
  // When the form was rendered. The roll call is a snapshot: a member who
  // checks in while the instructor has the page open is not in it, and
  // deleting what the instructor never saw would silently destroy a check-in
  // in the most ordinary case there is. Missing (a form from before this
  // field existed) means "no protection", which is the old behaviour.
  const loadedAt =
    (formData.get("loaded_at") as string | null) ?? new Date().toISOString();

  if (!sessionId) {
    redirect(PATH);
  }

  const present: string[] = [];
  const absent: string[] = [];
  const cleared: string[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("state_")) continue;
    const personId = key.slice("state_".length);
    if (value === "present") present.push(personId);
    else if (value === "absent") absent.push(personId);
    else cleared.push(personId);
  }

  // Read once: the same rows decide whose provenance survives and which
  // cleared entries are too fresh to delete.
  const { data: existingRows, error: readError } = await supabase
    .from("attendance")
    .select("person_id, present, checked_in_by, created_at")
    .eq("session_id", sessionId);

  if (readError) {
    logDbError("saveRollCall:read", readError);
    backToSession(sessionId, { error: t.msg.rollCallFailed }, from);
    return;
  }

  const existing = new Map(
    ((existingRows ?? []) as {
      person_id: string;
      present: boolean;
      checked_in_by: string;
      created_at: string;
    }[]).map((row) => [row.person_id, row]),
  );

  // A member's own check-in is left exactly as it is when the instructor
  // confirms it unchanged. Rewriting it to 'staff' would erase the one piece
  // of information the tag exists to carry — who declared this presence — and
  // would take away the member's right to undo their own row.
  const unchanged = (personId: string, wanted: boolean) => {
    const row = existing.get(personId);
    return row !== undefined && row.present === wanted;
  };

  // Rows the staff sets are marked 'staff', which is what makes them
  // un-undoable by the member they describe.
  const rows = [
    ...present
      .filter((person_id) => !unchanged(person_id, true))
      .map((person_id) => ({
        person_id,
        session_id: sessionId,
        present: true,
        checked_in_by: "staff" as const,
      })),
    ...absent
      .filter((person_id) => !unchanged(person_id, false))
      .map((person_id) => ({
        person_id,
        session_id: sessionId,
        present: false,
        checked_in_by: "staff" as const,
      })),
  ];

  if (rows.length > 0) {
    const { error } = await supabase
      .from("attendance")
      .upsert(rows, { onConflict: "person_id,session_id" });

    if (error) {
      logDbError("saveRollCall:upsert", error);
      backToSession(sessionId, { error: t.msg.rollCallFailed }, from);
      return;
    }
  }

  // Check-ins that arrived after the form was rendered: the instructor left
  // them "not recorded" because they were not there to be seen.
  const kept = cleared.filter((person_id) => {
    const row = existing.get(person_id);
    return (
      row !== undefined &&
      row.checked_in_by === "self" &&
      Date.parse(row.created_at) > Date.parse(loadedAt)
    );
  });
  const toDelete = cleared.filter(
    (person_id) => existing.has(person_id) && !kept.includes(person_id),
  );

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("attendance")
      .delete()
      .eq("session_id", sessionId)
      .in("person_id", toDelete);

    if (error) {
      logDbError("saveRollCall:delete", error);
      backToSession(sessionId, { error: t.msg.rollCallPartial }, from);
      return;
    }
  }

  revalidatePath(PATH);
  revalidatePath(`/attendance/${sessionId}`);
  backToSession(
    sessionId,
    {
      ok:
        kept.length > 0
          ? t.msg.rollCallSavedKept(present.length + kept.length, kept.length)
          : t.msg.rollCallSaved(present.length),
    },
    from,
  );
}

export async function cancelSession(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireClassManager(PATH);
  const sessionId = formData.get("session_id") as string;
  const from = (formData.get("from") as string | null) ?? "";

  const { error } = await supabase
    .from("class_session")
    .update({ status: "cancelled" })
    .eq("id", sessionId);

  revalidatePath(PATH);
  backToSession(
    sessionId,
    error ? { error: t.msg.cancelFailed } : { ok: t.msg.lessonCancelled },
    from,
  );
}

export async function restoreSession(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireClassManager(PATH);
  const sessionId = formData.get("session_id") as string;
  const from = (formData.get("from") as string | null) ?? "";

  const { error } = await supabase
    .from("class_session")
    .update({ status: "scheduled" })
    .eq("id", sessionId);

  revalidatePath(PATH);
  backToSession(
    sessionId,
    error ? { error: t.msg.restoreFailed } : { ok: t.msg.lessonRestored },
    from,
  );
}

export async function setSessionInstructor(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireClassManager(PATH);
  const sessionId = formData.get("session_id") as string;
  const from = (formData.get("from") as string | null) ?? "";
  const instructorId = (formData.get("instructor_id") as string | null) || null;

  const { error } = await supabase
    .from("class_session")
    .update({ instructor_id: instructorId })
    .eq("id", sessionId);

  revalidatePath(`/attendance/${sessionId}`);
  backToSession(
    sessionId,
    error ? { error: t.msg.instructorNotUpdated } : { ok: t.msg.instructorUpdated },
    from,
  );
}
