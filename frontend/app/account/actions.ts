"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/utils/supabase/require-admin";
import { getOrCreateProfile } from "@/utils/supabase/profile";
import { getDictionary } from "@/utils/i18n/server";

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

  const newEmail = text(formData, "email");

  const { error } = await supabase
    .from("person")
    .update({
      full_name: fullName,
      phone: text(formData, "phone"),
      birth_date: text(formData, "birth_date"),
      notes: text(formData, "notes"),
    })
    .eq("id", profile.id);

  if (error) {
    back({ error: t.msg.profileSaveFailed });
    return;
  }

  // The auth record is the source of truth for the email; `person.email` is a
  // convenience copy. Supabase sends a confirmation link and only swaps the
  // address once it is clicked, so the change is never immediate.
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
