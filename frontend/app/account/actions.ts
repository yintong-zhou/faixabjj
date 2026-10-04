"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/utils/supabase/require-admin";
import { getOrCreateProfile } from "@/utils/supabase/profile";
import { getDictionary } from "@/utils/i18n/server";
import type { Dictionary } from "@/utils/i18n/dictionaries/it";
import { logDbError } from "@/utils/log";
import { isValidUsername, normalizeUsername } from "@/utils/username";

function back(params: Record<string, string>) {
  redirect(`/account?${new URLSearchParams(params).toString()}`);
}

const text = (formData: FormData, key: string) => {
  const value = (formData.get(key) as string | null)?.trim();
  return value ? value : null;
};

export async function updateProfile(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase, userId, email: currentEmail } = await requireAdmin("/account");
  const profile = await getOrCreateProfile(supabase, userId, currentEmail);

  if (!profile) {
    back({ error: t.msg.profileNotFound });
    return;
  }

  const fullName = text(formData, "full_name");
  if (!fullName) {
    back({ error: t.msg.nameEmpty });
    return;
  }

  // Left as it is when the field arrives empty; the member's own client and
  // RLS write it (the guard lets a member change their own username).
  const rawUsername = text(formData, "username");
  const username = rawUsername ? normalizeUsername(rawUsername) : profile.username;
  if (username !== null && !isValidUsername(username)) {
    back({ error: t.msg.usernameInvalid });
    return;
  }

  const newEmail = text(formData, "email");

  const { error } = await supabase
    .from("person")
    .update({
      full_name: fullName,
      username,
      phone: text(formData, "phone"),
      birth_date: text(formData, "birth_date"),
      notes: text(formData, "notes"),
    })
    .eq("id", profile.id);

  if (error) {
    backWithUsernameError(error, "updateProfile", t);
    return;
  }

  await finishWithEmail(supabase, newEmail, currentEmail, t);
}

// 23505: somebody — possibly in another gym, or the superadmin — already has
// it. 23514: the format check, for a value that slipped past the one in the
// action.
function backWithUsernameError(
  error: { code?: string; message: string },
  where: string,
  t: Dictionary,
) {
  if (error.code !== "23505" && error.code !== "23514") {
    logDbError("account", where, error);
  }
  back({
    error:
      error.code === "23505"
        ? t.msg.usernameTaken
        : error.code === "23514"
          ? t.msg.usernameInvalid
          : t.msg.profileSaveFailed,
  });
}

// The auth record is the source of truth for the email; `person.email` is a
// convenience copy. Supabase sends a confirmation link and only swaps the
// address once it is clicked, so the change is never immediate.
async function finishWithEmail(
  supabase: SupabaseClient,
  newEmail: string | null,
  currentEmail: string | null | undefined,
  t: Dictionary,
) {
  if (newEmail && newEmail !== currentEmail) {
    const { error: emailError } = await supabase.auth.updateUser({ email: newEmail });

    if (emailError) {
      back({ error: t.msg.profileSavedEmailFailed });
      return;
    }

    revalidatePath("/account");
    back({ ok: t.msg.profileSavedEmailPending });
    return;
  }

  revalidatePath("/account");
  back({ ok: t.msg.profileSaved });
}

// The superadmin's own sign-in details: a username and the email. It has no
// person row, so the username lives on its platform_admin row and is written
// only by set_platform_admin_username(), which touches the caller's own row.
export async function updatePlatformAccount(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase, userId, email: currentEmail, access } = await requireAdmin("/account");

  if (!access.isPlatformAdmin) {
    notFound();
  }

  const { data: row, error: readError } = await supabase
    .from("platform_admin")
    .select("username")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (readError || !row) {
    if (readError) logDbError("account", "updatePlatformAccount:read", readError);
    back({ error: t.msg.profileSaveFailed });
    return;
  }

  // Same rule as a member's: an empty field leaves the username as it is.
  const rawUsername = text(formData, "username");
  const username = rawUsername ? normalizeUsername(rawUsername) : row.username;
  if (username !== null && !isValidUsername(username)) {
    back({ error: t.msg.usernameInvalid });
    return;
  }

  if (username !== row.username) {
    const { error } = await supabase.rpc("set_platform_admin_username", {
      p_username: username,
    });
    if (error) {
      backWithUsernameError(error, "updatePlatformAccount", t);
      return;
    }
  }

  await finishWithEmail(supabase, text(formData, "email"), currentEmail, t);
}

export async function updatePassword(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireAdmin("/account");

  const password = formData.get("password") as string;
  const confirm = formData.get("confirm_password") as string;

  if (!password || password.length < 8) {
    back({ error: t.auth.tooShort });
    return;
  }

  if (password !== confirm) {
    back({ error: t.auth.mismatch });
    return;
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    back({ error: t.auth.updateFailed });
    return;
  }

  back({ ok: t.msg.passwordUpdated });
}
