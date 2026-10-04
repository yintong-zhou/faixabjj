"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { todayIn } from "@/utils/dates";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { parseRegistration } from "@/utils/registration";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireGymSettings } from "@/utils/supabase/gym";
import { activeRoles } from "@/utils/supabase/profile";
import { requireUserManager } from "@/utils/supabase/require-admin";

const PATH = "/members/requests";

function back(params: Record<string, string>): never {
  redirect(`${PATH}?${new URLSearchParams(params).toString()}`);
}

type RequestRow = {
  id: string;
  auth_user_id: string;
  gym_id: string;
  email: string;
  username: string;
  full_name: string;
  created_at: string;
};

// Read through the user's client: RLS answers only for user managers, only
// inside their gym — that is the proof every service-role call below rests on.
async function requestInMyGym(supabase: SupabaseClient, id: string): Promise<RequestRow | null> {
  if (!id) return null;
  const { data, error } = await supabase
    .from("registration_request")
    .select("id, auth_user_id, gym_id, email, username, full_name, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) logDbError("requests", "requestInMyGym", error);
  return (data as RequestRow | null) ?? null;
}

// Admits a self-registered athlete: the gym goes into the account's
// app_metadata, the auth trigger creates (or links) the person row, and the
// row is filled with the — possibly corrected — data, as addPerson does: with
// the service role, because the starting belt is not a promotion and the
// database accepts a belt change only inside record_promotion() otherwise.
//
// A repeat is refused once the account has a gym (clearing a leftover
// request); two approvals racing past that check write the same values. A step
// that fails after the gym was assigned puts the account back as pending.
export async function approveRegistration(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireUserManager(PATH);
  const gym = await requireGymSettings();

  const request = await requestInMyGym(supabase, String(formData.get("request_id") ?? ""));
  if (!request) back({ error: t.requests.alreadyHandled });

  // The username is the athlete's and is not edited here (staff never edit
  // usernames); password and consent belong to the signup only.
  const parsed = parseRegistration(
    (key) => (key === "username" ? request.username : (formData.get(key) as string | null)),
    todayIn(gym.timezone),
    "approval",
  );
  if (!parsed.ok) back({ error: t.join.errors[parsed.error] });
  const r = parsed.value;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    back({ error: t.msg.adminClientMissing });
  }

  const uid = request.auth_user_id;

  // An account that already has a gym was approved meanwhile (double click,
  // another manager, a retry): refuse before anything is written, so a repeat
  // can never touch the profile the first approval produced.
  const { data: existing, error: existingError } = await admin.auth.admin.getUserById(uid);
  if (existingError || !existing?.user) {
    logDbError("requests", "approve:getUserById", {
      code: existingError?.code ?? "no-user",
      message: existingError?.message ?? "no user returned",
    });
    back({ error: t.requests.failed });
  }
  const assignedGym = (existing.user.app_metadata as { gym_id?: string | null }).gym_id;
  if (assignedGym) {
    // Approved here already, but the request outlived it (its delete failed):
    // clear it, so it stops showing as pending.
    if (assignedGym === gym.id) {
      const { error } = await supabase.from("registration_request").delete().eq("id", request.id);
      if (error) logDbError("requests", "approve:cleanup", error);
      revalidatePath("/members");
      revalidatePath(PATH);
      revalidatePath("/dashboard");
    }
    back({ error: t.requests.alreadyHandled });
  }

  // First, so a taken address stops everything while nothing has changed yet.
  // Compared with the account's current address, not the request's: the two
  // differ after an earlier attempt changed the address and failed later.
  if (r.email !== existing.user.email) {
    const { error } = await admin.auth.admin.updateUserById(uid, { email: r.email, email_confirm: true });
    if (error) {
      // Generic on screen: a specific message would tell the gym's staff whether
      // an address has an account anywhere on the platform.
      logDbError("requests", "approve:email", { code: error.code ?? null, message: error.message });
      back({ error: t.requests.failed });
    }
  }

  const { error: metaError } = await admin.auth.admin.updateUserById(uid, {
    app_metadata: { gym_id: gym.id, pending_gym_id: null },
  });
  if (metaError) {
    logDbError("requests", "approve:app_metadata", { code: metaError.code ?? null, message: metaError.message });
    back({ error: t.requests.failed });
  }

  // Set once the trigger has acted: the row it linked (an older, account-less
  // member) with the username it had, or null when it created the row itself.
  let linked: { previousUsername: string | null } | null = null;

  // Puts the account back as pending: gym out of app_metadata first (the
  // trigger then does nothing), then the profile it created is removed, or the
  // existing row it linked is unlinked again. One update for the unlink: the
  // username goes back with it, or the request that holds it would collide.
  async function undo(personId: string | null) {
    const { error: metaUndoError } = await admin.auth.admin.updateUserById(uid, {
      app_metadata: { gym_id: null, pending_gym_id: gym.id },
    });
    if (metaUndoError) {
      logDbError("requests", "approve:undo:app_metadata", {
        code: metaUndoError.code ?? null,
        message: metaUndoError.message,
      });
    }
    if (!personId) return;
    const { error } = linked
      ? await admin
          .from("person")
          .update({ auth_user_id: null, username: linked.previousUsername })
          .eq("id", personId)
      : await admin.from("person").delete().eq("id", personId);
    if (error) logDbError("requests", "approve:undo", error);
  }

  const { data: person, error: personError } = await admin
    .from("person")
    .select("id, created_at, username")
    .eq("auth_user_id", uid)
    .eq("gym_id", gym.id)
    .maybeSingle();
  if (personError || !person) {
    logDbError("requests", "approve:person", personError ?? { code: "no-rows", message: "trigger created no person" });
    await undo(null);
    back({ error: t.requests.failed });
  }
  const found = person as { id: string; created_at: string; username: string | null };
  const personId = found.id;
  // The row existed before the request: the trigger linked it instead of
  // creating one. Decided from the row itself, after the trigger, so a repeat
  // can never mistake a member's profile for a fresh one.
  if (new Date(found.created_at) < new Date(request.created_at)) {
    linked = { previousUsername: found.username };
  }

  // A linked existing row keeps its own grade and dates (the warning on the
  // page says so); it only gains the username the athlete chose.
  const { error: updateError } = await admin
    .from("person")
    .update(
      linked
        ? { username: request.username }
        : {
            full_name: r.fullName,
            email: r.email,
            username: request.username,
            birth_date: r.birthDate,
            joined_at: r.joinedAt,
            current_belt: r.belt,
            current_stripes: r.stripes,
            rank_since: r.rankSince,
            stripe_since: r.stripeSince,
          },
    )
    .eq("id", personId);
  if (updateError) {
    logDbError("requests", "approve:profile", updateError);
    await undo(personId);
    back({ error: t.requests.failed });
  }

  // On the user's client, like addPerson: RLS checks the manager may assign it.
  // A linked row that still holds an open role keeps it instead.
  if ((await activeRoles(supabase, personId)).length === 0) {
    const { error: roleError } = await supabase.from("assigned_role").insert({ person_id: personId, role: "student" });
    if (roleError && roleError.code !== "23505") {
      logDbError("requests", "approve:role", roleError);
      await undo(personId);
      back({ error: t.requests.failed });
    }
  }

  // The athlete is in; a request left behind would only reserve the username
  // the profile now holds. Service role: the row was proven ours above.
  const { error: deleteError } = await admin.from("registration_request").delete().eq("id", request.id);
  if (deleteError) logDbError("requests", "approve:delete", deleteError);

  revalidatePath("/members");
  revalidatePath(PATH);
  revalidatePath("/dashboard");
  back({ ok: t.requests.approved(r.fullName) });
}

// Deletes the account the request created; the request goes with it (cascade).
// Refused for an account that already has a gym (approved meanwhile) or is not
// pending for this gym, and never touches a platform admin.
export async function rejectRegistration(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireUserManager(PATH);

  const request = await requestInMyGym(supabase, String(formData.get("request_id") ?? ""));
  if (!request) back({ error: t.requests.alreadyHandled });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    back({ error: t.msg.adminClientMissing });
  }

  const { data: platformAdmin, error: platformAdminError } = await admin
    .from("platform_admin")
    .select("auth_user_id")
    .eq("auth_user_id", request.auth_user_id)
    .maybeSingle();
  if (platformAdminError || platformAdmin) {
    if (platformAdminError) logDbError("requests", "reject:platform_admin", platformAdminError);
    else console.error("[requests] reject refused: target is a platform admin");
    back({ error: t.requests.failed });
  }

  const { data, error } = await admin.auth.admin.getUserById(request.auth_user_id);
  if (error || !data?.user) {
    logDbError("requests", "reject:getUserById", {
      code: error?.code ?? "no-user",
      message: error?.message ?? "no user returned",
    });
    back({ error: t.requests.failed });
  }
  const meta = data.user.app_metadata as { gym_id?: string | null; pending_gym_id?: string | null };
  if (meta.gym_id || meta.pending_gym_id !== request.gym_id) {
    console.error("[requests] reject refused: account is not pending for this gym");
    back({ error: t.requests.alreadyHandled });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(request.auth_user_id);
  if (deleteError) {
    logDbError("requests", "reject:deleteUser", { code: deleteError.code ?? null, message: deleteError.message });
    back({ error: t.requests.failed });
  }

  revalidatePath("/members");
  revalidatePath(PATH);
  revalidatePath("/dashboard");
  back({ ok: t.requests.rejected(request.full_name) });
}
