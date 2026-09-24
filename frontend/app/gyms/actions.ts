"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { todayIn } from "@/utils/dates";
import { DEFAULT_PASSWORD } from "@/utils/default-password";
import { DEFAULT_TIMEZONE } from "@/utils/gym-defaults";
import { deletionConfirmed, parseGymForm } from "@/utils/gyms";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { createAdminClient } from "@/utils/supabase/admin";
import { requirePlatformAdmin } from "@/utils/supabase/require-admin";

const LIST = "/gyms";

// Every action re-checks requirePlatformAdmin itself: a server action is a
// public endpoint, and several below use the service-role key, which bypasses
// RLS entirely.

function to(path: string, params: Record<string, string>): never {
  const search = new URLSearchParams(params);
  redirect(`${path}?${search.toString()}`);
}

const field = (formData: FormData, key: string) =>
  (formData.get(key) as string | null) ?? null;

function gymInput(formData: FormData) {
  return {
    name: field(formData, "name"),
    timezone: field(formData, "timezone"),
    tracking_started_on: field(formData, "tracking_started_on"),
    session_length_hours: field(formData, "session_length_hours"),
    lessons_per_week: field(formData, "lessons_per_week"),
  };
}

export async function createGym(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requirePlatformAdmin("/gyms/new");

  const parsed = parseGymForm(gymInput(formData), todayIn(DEFAULT_TIMEZONE));
  if (!parsed.ok) to("/gyms/new", { error: t.gyms.invalid[parsed.error] });

  const { value } = parsed;
  const { data, error } = await supabase
    .from("gym")
    .insert({
      name: value.name,
      timezone: value.timezone,
      tracking_started_on: value.trackingStartedOn,
      session_length_hours: value.sessionLengthHours,
      lessons_per_week: value.lessonsPerWeek,
    })
    .select("id")
    .single();

  if (error || !data) {
    logDbError("gyms", "createGym", error ?? { code: "no data" });
    to("/gyms/new", { error: error?.code === "23505" ? t.gyms.msg.nameTaken : t.gyms.msg.failed });
  }

  revalidatePath(LIST);
  to(`/gyms/${data.id}`, { ok: t.gyms.msg.created(value.name) });
}

export async function updateGym(formData: FormData) {
  const { t } = await getDictionary();
  const id = field(formData, "id") ?? "";
  const detail = `/gyms/${id}`;
  const { supabase } = await requirePlatformAdmin(detail);

  const timezone = field(formData, "timezone") ?? DEFAULT_TIMEZONE;
  const parsed = parseGymForm(gymInput(formData), todayIn(timezone));
  if (!parsed.ok) to(detail, { error: t.gyms.invalid[parsed.error] });

  const { value } = parsed;
  const { data, error } = await supabase
    .from("gym")
    .update({
      name: value.name,
      timezone: value.timezone,
      tracking_started_on: value.trackingStartedOn,
      session_length_hours: value.sessionLengthHours,
      lessons_per_week: value.lessonsPerWeek,
    })
    .eq("id", id)
    .select("id");

  if (error || !data || data.length === 0) {
    logDbError("gyms", "updateGym", error ?? { code: "no-rows", message: "update matched no rows" });
    to(detail, { error: error?.code === "23505" ? t.gyms.msg.nameTaken : t.gyms.msg.failed });
  }

  revalidatePath(LIST);
  revalidatePath(detail);
  to(detail, { ok: t.gyms.msg.saved });
}

// Suspend or reactivate. Suspension hides the gym's data and refuses its
// writes in the database (current_gym_id() is null for a suspended gym);
// nothing is deleted, so reactivating brings everything back.
export async function setGymStatus(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requirePlatformAdmin(LIST);

  const id = field(formData, "id") ?? "";
  const status = field(formData, "status");
  const back = field(formData, "_back") === "detail" ? `/gyms/${id}` : LIST;
  if (status !== "active" && status !== "suspended") to(back, { error: t.gyms.msg.failed });

  const { data, error } = await supabase
    .from("gym")
    .update({ status })
    .eq("id", id)
    .select("name")
    .single();

  if (error || !data) {
    logDbError("gyms", "setGymStatus", error ?? { code: "no data" });
    to(back, { error: t.gyms.msg.failed });
  }

  revalidatePath(LIST);
  revalidatePath(`/gyms/${id}`);
  to(back, {
    ok: status === "suspended" ? t.gyms.msg.suspended(data.name) : t.gyms.msg.reactivated(data.name),
  });
}

// Permanent deletion, only for a suspended gym whose exact name was typed.
// The gym row goes first: its cascade removes every record, which is what the
// deletion is for. The gym's auth accounts are removed after, with the service
// role; if any of them fails the gym is already gone, and the message says how
// many accounts are left to delete by hand rather than pretending otherwise.
export async function deleteGym(formData: FormData) {
  const { t } = await getDictionary();
  const id = field(formData, "id") ?? "";
  const detail = `/gyms/${id}`;
  const { supabase } = await requirePlatformAdmin(detail);

  const { data: gym, error: gymError } = await supabase
    .from("gym")
    .select("name, status")
    .eq("id", id)
    .maybeSingle();
  if (gymError) logDbError("gyms", "deleteGym:lookup", gymError);
  if (!gym) to(LIST, { error: t.gyms.msg.failed });
  if (gym.status !== "suspended") to(detail, { error: t.gyms.msg.deleteNeedsSuspension });
  if (!deletionConfirmed(gym.name, field(formData, "confirm_name"))) {
    to(detail, { error: t.gyms.msg.deleteNameMismatch });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    to(detail, { error: t.gyms.msg.secretMissing });
  }

  const { data: accounts, error: accountsError } = await admin
    .from("person")
    .select("auth_user_id")
    .eq("gym_id", id)
    .not("auth_user_id", "is", null);
  if (accountsError) logDbError("gyms", "deleteGym:accounts", accountsError);

  const { data: deleted, error } = await supabase.from("gym").delete().eq("id", id).select("id");
  if (error || !deleted || deleted.length === 0) {
    logDbError("gyms", "deleteGym", error ?? { code: "no-rows", message: "delete matched no rows" });
    to(detail, { error: t.gyms.msg.failed });
  }

  let failed = 0;
  for (const row of (accounts ?? []) as { auth_user_id: string }[]) {
    const { error: authError } = await admin.auth.admin.deleteUser(row.auth_user_id);
    if (authError) {
      logDbError("gyms", "deleteGym:deleteUser", { code: authError.code ?? null, message: authError.message });
      failed += 1;
    }
  }

  revalidatePath(LIST);
  to(LIST, failed ? { error: t.gyms.msg.accountsNotDeleted(failed) } : { ok: t.gyms.msg.deleted(gym.name) });
}

// A manager is an `admin` of the gym: created on the shared default password
// with the forced change armed, like every account the portal creates. The gym
// rides in app_metadata, where the auth trigger reads it to make the person
// row; the role is inserted with the service role, since the superadmin holds
// no rights inside the gym.
export async function addManager(formData: FormData) {
  const { t } = await getDictionary();
  const gymId = field(formData, "gym_id") ?? "";
  const detail = `/gyms/${gymId}`;
  const { supabase } = await requirePlatformAdmin(detail);

  const fullName = field(formData, "full_name")?.trim();
  const email = field(formData, "email")?.trim();
  if (!fullName || !email) to(detail, { error: t.gyms.msg.managerMissing });

  // The gym is verified on the superadmin's own (RLS-checked) client before
  // the service role is touched, so a hidden gym_id field posted for a gym
  // that does not exist cannot create an account anywhere.
  const { data: gym, error: gymError } = await supabase
    .from("gym")
    .select("id")
    .eq("id", gymId)
    .maybeSingle();
  if (gymError) logDbError("gyms", "addManager:lookup", gymError);
  if (!gym) to(LIST, { error: t.gyms.msg.failed });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    to(detail, { error: t.gyms.msg.secretMissing });
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { must_change_password: true, gym_id: gymId },
  });
  if (error || !created?.user) {
    if (error) logDbError("gyms", "addManager:createUser", { code: error.code ?? null, message: error.message });
    to(detail, { error: t.gyms.msg.managerFailed });
  }

  const { data: person, error: personError } = await admin
    .from("person")
    .select("id")
    .eq("auth_user_id", created.user.id)
    .maybeSingle();
  if (personError) logDbError("gyms", "addManager:person", personError);

  const { error: roleError } = person
    ? await admin.from("assigned_role").insert({ person_id: person.id, role: "admin", gym_id: gymId })
    : { error: { code: "no-person", message: "trigger did not create a person row" } };

  if (roleError) {
    logDbError("gyms", "addManager:role", roleError);
    to(detail, { error: t.gyms.msg.failed });
  }

  revalidatePath(detail);
  revalidatePath(LIST);
  to(detail, { ok: t.gyms.msg.managerAdded(email, DEFAULT_PASSWORD) });
}

// Both account actions act only on a manager of this gym, checked through
// gym_managers() on the superadmin's own client before the service role is
// touched — never on an instructor or a student, whom the superadmin does not
// see.
async function managerOf(gymId: string, authUserId: string, detail: string) {
  const { supabase } = await requirePlatformAdmin(detail);
  const { data, error } = await supabase.rpc("gym_managers", { p_gym_id: gymId });
  if (error) logDbError("gyms", "managerOf", error);
  return ((data ?? []) as { auth_user_id: string | null; email: string | null }[]).find(
    (m) => m.auth_user_id === authUserId,
  );
}

export async function resetManagerPassword(formData: FormData) {
  const { t } = await getDictionary();
  const gymId = field(formData, "gym_id") ?? "";
  const userId = field(formData, "user_id") ?? "";
  const detail = `/gyms/${gymId}`;

  const manager = await managerOf(gymId, userId, detail);
  if (!manager) to(detail, { error: t.gyms.msg.notAManager });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    to(detail, { error: t.gyms.msg.secretMissing });
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: DEFAULT_PASSWORD,
    // Keeps gym_id: app_metadata is merged, but it is restated so the account
    // can never lose its gym through this call.
    app_metadata: { must_change_password: true, gym_id: gymId },
  });
  if (error) {
    logDbError("gyms", "resetManagerPassword", { code: error.code ?? null, message: error.message });
    to(detail, { error: t.gyms.msg.failed });
  }

  to(detail, { ok: t.gyms.msg.passwordReset(manager.email ?? "") });
}

export async function revokeManager(formData: FormData) {
  const { t } = await getDictionary();
  const gymId = field(formData, "gym_id") ?? "";
  const userId = field(formData, "user_id") ?? "";
  const detail = `/gyms/${gymId}`;

  const manager = await managerOf(gymId, userId, detail);
  if (!manager) to(detail, { error: t.gyms.msg.notAManager });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    to(detail, { error: t.gyms.msg.secretMissing });
  }

  // Deletes the auth account only; person.auth_user_id is ON DELETE SET NULL,
  // so the gym keeps the person and their history, as with any revocation.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    logDbError("gyms", "revokeManager", { code: error.code ?? null, message: error.message });
    to(detail, { error: t.gyms.msg.failed });
  }

  revalidatePath(detail);
  revalidatePath(LIST);
  to(detail, { ok: t.gyms.msg.revoked(manager.email ?? "") });
}
