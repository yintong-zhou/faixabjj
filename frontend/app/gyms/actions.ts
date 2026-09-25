"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { todayIn } from "@/utils/dates";
import { DEFAULT_TIMEZONE } from "@/utils/gym-defaults";
import { deletionConfirmed, parseGymForm } from "@/utils/gyms";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { createAdminClient } from "@/utils/supabase/admin";
import { requirePlatformAdmin } from "@/utils/supabase/require-admin";
import { generateTemporaryPassword } from "@/utils/temporary-password";
import { flashTemporaryPassword } from "@/utils/temporary-password-flash";

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
    latitude: field(formData, "latitude"),
    longitude: field(formData, "longitude"),
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
      latitude: value.latitude,
      longitude: value.longitude,
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
      latitude: value.latitude,
      longitude: value.longitude,
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
// The accounts to remove are looked up *before* the gym row is deleted: its
// cascade erases every person row, which is the only record of who to delete
// from auth — so a failed lookup here is a precondition, not a detail to log
// and carry on from, or the cascade would orphan every one of the gym's auth
// accounts with no trace of them left anywhere. Once that lookup has
// succeeded, the gym row goes; the accounts are removed after, with the
// service role, and if any of them fails the gym is already gone, so the
// message says how many accounts are left to delete by hand rather than
// pretending otherwise.
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
  if (accountsError) {
    // This list is the only record of the gym's auth_user_ids: the gym row's
    // cascade is about to erase every person row, so a failed lookup here
    // must stop the deletion rather than proceed and orphan those accounts.
    logDbError("gyms", "deleteGym:accounts", accountsError);
    to(detail, { error: t.gyms.msg.failed });
  }

  // No person row may be linked to a platform superadmin (the database refuses
  // it: guard_person_auth_user), but this loop deletes auth accounts with the
  // service role, so it does not rest on that alone: a superadmin account is
  // never deleted from here. Unknown superadmins would make the skip
  // meaningless, so a failed lookup stops the deletion like the one above.
  const { data: platformAdmins, error: platformAdminsError } = await admin
    .from("platform_admin")
    .select("auth_user_id");
  if (platformAdminsError) {
    logDbError("gyms", "deleteGym:platformAdmins", platformAdminsError);
    to(detail, { error: t.gyms.msg.failed });
  }
  const protectedIds = new Set(
    ((platformAdmins ?? []) as { auth_user_id: string }[]).map((r) => r.auth_user_id),
  );

  // Status re-checked in the delete itself: a gym reactivated since the lookup
  // above matches no row, and the zero-row check turns the lost race into a
  // failure instead of deleting an active gym.
  const { data: deleted, error } = await supabase
    .from("gym")
    .delete()
    .eq("id", id)
    .eq("status", "suspended")
    .select("id");
  if (error || !deleted || deleted.length === 0) {
    logDbError("gyms", "deleteGym", error ?? { code: "no-rows", message: "delete matched no rows" });
    to(detail, { error: t.gyms.msg.failed });
  }

  let failed = 0;
  for (const row of (accounts ?? []) as { auth_user_id: string }[]) {
    if (protectedIds.has(row.auth_user_id)) {
      console.error("[gyms] deleteGym skipped a platform admin account linked to the gym");
      continue;
    }
    const { error: authError } = await admin.auth.admin.deleteUser(row.auth_user_id);
    if (authError) {
      logDbError("gyms", "deleteGym:deleteUser", { code: authError.code ?? null, message: authError.message });
      failed += 1;
    }
  }

  revalidatePath(LIST);
  to(LIST, failed ? { error: t.gyms.msg.accountsNotDeleted(failed) } : { ok: t.gyms.msg.deleted(gym.name) });
}

// A manager is an `admin` of the gym: created on a temporary password drawn for
// it alone, shown once, with the forced change armed, like every account the
// portal creates. The gym
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

  const password = generateTemporaryPassword();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
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

  // The auth trigger links to an *existing* account-less person by email
  // before creating a new row — which is exactly what happens on re-adding
  // somebody revokeManager only removed the auth account for, leaving their
  // person row and open `admin` role untouched. That re-link then hits
  // assigned_role_active_unique (person_id, role) where end_date is null:
  // 23505, not a real failure, so it is treated as the manager already being
  // in place rather than as an error to report and undo.
  let roleError: { code?: string | null; message?: string | null } | null = null;
  if (!person) {
    roleError = personError ?? { code: "no-person", message: "trigger created or linked no person row" };
  } else {
    const { error: insertError } = await admin
      .from("assigned_role")
      .insert({ person_id: person.id, role: "admin", gym_id: gymId });
    roleError = insertError && insertError.code !== "23505" ? insertError : null;
  }

  // A manager is never left as a bare account: if no person row exists to
  // hold the role, or the role could not be recorded, the auth user just
  // created is deleted rather than left invisible in gym_managers and
  // unusable to retry (its email would otherwise look permanently taken).
  if (roleError) {
    logDbError("gyms", "addManager:role", roleError);
    const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
    if (cleanupError) {
      logDbError("gyms", "addManager:cleanup", {
        code: cleanupError.code ?? null,
        message: cleanupError.message,
      });
    }
    to(detail, { error: t.gyms.msg.failed });
  }

  revalidatePath(detail);
  revalidatePath(LIST);
  to(detail, {
    ok: t.gyms.msg.managerAdded(email),
    pw: await flashTemporaryPassword({ email, password }),
  });
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

  const password = generateTemporaryPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    // Keeps gym_id: app_metadata is merged, but it is restated so the account
    // can never lose its gym through this call.
    app_metadata: { must_change_password: true, gym_id: gymId },
  });
  if (error) {
    logDbError("gyms", "resetManagerPassword", { code: error.code ?? null, message: error.message });
    to(detail, { error: t.gyms.msg.failed });
  }

  to(detail, {
    ok: t.gyms.msg.passwordReset(manager.email ?? ""),
    pw: await flashTemporaryPassword({ email: manager.email ?? "", password }),
  });
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
