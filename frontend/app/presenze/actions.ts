"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOrCreateProfile } from "@/utils/supabase/profile";
import {
  requireAdmin,
  requireClassManager,
} from "@/utils/supabase/require-admin";

const PATH = "/presenze";

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
  redirect(`/presenze/${sessionId}?${search.toString()}`);
}

// ---------------------------------------------------------------------------
// Student check-in
// ---------------------------------------------------------------------------
// Runs on the member's own Supabase client, so RLS decides. The time window is
// not re-checked here on purpose: the policy enforces it, and a second copy in
// TypeScript would be a second definition free to drift from the first.
export async function checkIn(formData: FormData) {
  const { supabase, userId, email } = await requireAdmin(PATH);
  const query = (formData.get("_query") as string | null) ?? "";
  const sessionId = formData.get("session_id") as string;

  if (!sessionId) {
    back({ error: "Lezione non specificata." }, query);
    return;
  }

  const profile = await getOrCreateProfile(supabase, userId, email);
  if (!profile) {
    back({ error: "Il tuo profilo non è disponibile." }, query);
    return;
  }

  const { error } = await supabase.from("attendance").insert({
    person_id: profile.id,
    session_id: sessionId,
    present: true,
    checked_in_by: "self",
  });

  if (error) {
    back(
      {
        error:
          error.code === "23505"
            ? "Risulti già presente a questa lezione."
            : "Il check-in per questa lezione non è aperto.",
      },
      query,
    );
    return;
  }

  revalidatePath(PATH);
  back({ ok: "Check-in registrato." }, query);
}

export async function undoCheckIn(formData: FormData) {
  const { supabase, userId, email } = await requireAdmin(PATH);
  const query = (formData.get("_query") as string | null) ?? "";
  const sessionId = formData.get("session_id") as string;

  const profile = await getOrCreateProfile(supabase, userId, email);
  if (!profile) {
    back({ error: "Il tuo profilo non è disponibile." }, query);
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

  if (error || !data || data.length === 0) {
    back({ error: "Non è più possibile annullare questo check-in." }, query);
    return;
  }

  revalidatePath(PATH);
  back({ ok: "Check-in annullato." }, query);
}

// ---------------------------------------------------------------------------
// Roll call
// ---------------------------------------------------------------------------
// One form, one save. The three states per member are "" (not recorded),
// "present" and "absent"; "not recorded" is a real answer and means no row,
// which is different information from an explicit absence.
export async function saveRollCall(formData: FormData) {
  const { supabase } = await requireClassManager(PATH);
  const sessionId = formData.get("session_id") as string;
  const from = (formData.get("from") as string | null) ?? "";

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

  // Rows the staff sets are marked 'staff', which is what makes them
  // un-undoable by the member they describe.
  const rows = [
    ...present.map((person_id) => ({
      person_id,
      session_id: sessionId,
      present: true,
      checked_in_by: "staff" as const,
    })),
    ...absent.map((person_id) => ({
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
      backToSession(sessionId, { error: "Appello non salvato." }, from);
      return;
    }
  }

  if (cleared.length > 0) {
    const { error } = await supabase
      .from("attendance")
      .delete()
      .eq("session_id", sessionId)
      .in("person_id", cleared);

    if (error) {
      backToSession(sessionId, { error: "Appello salvato solo in parte." }, from);
      return;
    }
  }

  revalidatePath(PATH);
  revalidatePath(`/presenze/${sessionId}`);
  backToSession(
    sessionId,
    { ok: `Appello salvato: ${present.length} presenti.` },
    from,
  );
}

export async function cancelSession(formData: FormData) {
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
    error ? { error: "Annullamento non riuscito." } : { ok: "Lezione annullata." },
    from,
  );
}

export async function restoreSession(formData: FormData) {
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
    error ? { error: "Ripristino non riuscito." } : { ok: "Lezione ripristinata." },
    from,
  );
}

export async function setSessionInstructor(formData: FormData) {
  const { supabase } = await requireClassManager(PATH);
  const sessionId = formData.get("session_id") as string;
  const from = (formData.get("from") as string | null) ?? "";
  const instructorId = (formData.get("instructor_id") as string | null) || null;

  const { error } = await supabase
    .from("class_session")
    .update({ instructor_id: instructorId })
    .eq("id", sessionId);

  revalidatePath(`/presenze/${sessionId}`);
  backToSession(
    sessionId,
    error ? { error: "Istruttore non aggiornato." } : { ok: "Istruttore aggiornato." },
    from,
  );
}
