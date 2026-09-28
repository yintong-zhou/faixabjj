"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOrCreateProfile } from "@/utils/supabase/profile";
import {
  requireAdmin,
  requireClassManager,
} from "@/utils/supabase/require-admin";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { checkinMessage, optionalNumber, parseCheckinOutcome } from "@/utils/checkin";

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

// ---------------------------------------------------------------------------
// Student check-in
// ---------------------------------------------------------------------------
// Runs on the member's own Supabase client and goes through check_in(), which
// decides everything: the window, "already present" and, when the gym has a
// position, the distance. None of it is re-checked here — a second copy in
// TypeScript would be a second definition free to drift from the first. The
// coordinates travel in this request only: they are passed on and never
// logged.
const CHECK_IN_PAGE = "/check-in";

export async function checkIn(formData: FormData) {
  const { t } = await getDictionary();
  const fromCheckInPage = formData.get("_return") === CHECK_IN_PAGE;
  const { supabase, userId, email } = await requireAdmin(fromCheckInPage ? CHECK_IN_PAGE : PATH);
  const query = (formData.get("_query") as string | null) ?? "";
  const sessionId = formData.get("session_id") as string;

  const done = (params: Record<string, string>) => {
    if (fromCheckInPage) redirect(`${CHECK_IN_PAGE}?${new URLSearchParams(params).toString()}`);
    back(params, query);
  };

  if (!sessionId) {
    done({ error: t.msg.sessionNotSpecified });
    return;
  }

  const profile = await getOrCreateProfile(supabase, userId, email);
  if (!profile) {
    done({ error: t.msg.profileUnavailable });
    return;
  }

  const { data, error } = await supabase.rpc("check_in", {
    p_session_id: sessionId,
    p_lat: optionalNumber(formData.get("lat")),
    p_lng: optionalNumber(formData.get("lng")),
    p_accuracy: optionalNumber(formData.get("accuracy")),
  });

  const outcome = error ? null : parseCheckinOutcome(data);
  if (!outcome) {
    // An error is not a closed window: the network, a missing migration or a
    // mangled id must not send the member to look at the clock.
    logDbError(
      "attendance",
      "checkIn",
      error ?? { code: "bad-outcome", message: "check_in returned an unknown shape" },
    );
    done({ error: t.msg.checkinFailed });
    return;
  }

  if (outcome.result === "ok") {
    revalidatePath(PATH);
    revalidatePath(CHECK_IN_PAGE);
  }

  const message = checkinMessage(outcome, t);
  done(message.ok ? { ok: message.text } : { error: message.text });
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
    logDbError("attendance", "undoCheckIn", error);
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
    logDbError("attendance", "saveRollCall:read", readError);
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
      logDbError("attendance", "saveRollCall:upsert", error);
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
      logDbError("attendance", "saveRollCall:delete", error);
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
