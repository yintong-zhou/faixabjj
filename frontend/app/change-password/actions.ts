"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireSession } from "@/utils/supabase/require-admin";
import { DEFAULT_PASSWORD } from "@/utils/default-password";
import { getDictionary } from "@/utils/i18n/server";

const PATH = "/change-password";

export async function changePassword(formData: FormData) {
  // requireSession, not requireAdmin: this is the one page a user with a
  // pending password change is allowed to reach.
  const { supabase, userId } = await requireSession(PATH);
  const { t } = await getDictionary();

  const password = (formData.get("password") as string) ?? "";
  const confirm = (formData.get("confirm_password") as string) ?? "";

  if (password.length < 8) {
    redirect(`${PATH}?error=${encodeURIComponent(t.auth.tooShort)}`);
  }

  if (password !== confirm) {
    redirect(`${PATH}?error=${encodeURIComponent(t.auth.mismatch)}`);
  }

  // Without this the forced change would be theatre: confirming the default
  // password twice would satisfy the form and leave the account exactly as
  // exposed as it was.
  if (password === DEFAULT_PASSWORD) {
    redirect(
      `${PATH}?error=${encodeURIComponent(t.auth.sameAsDefault)}`,
    );
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(
      `${PATH}?error=${encodeURIComponent(t.auth.updateFailed)}`,
    );
  }

  // Clearing the obligation needs the service role: `app_metadata` is
  // deliberately not writable by the user it belongs to.
  try {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { must_change_password: false },
    });
  } catch {
    // The password did change; only the flag is stale. The user would be asked
    // once more on the next request rather than being locked out.
    redirect(
      `${PATH}?error=${encodeURIComponent(t.auth.flagNotCleared)}`,
    );
  }

  // The old JWT still carries must_change_password: true, so without a refresh
  // the proxy would bounce the user straight back here.
  await supabase.auth.refreshSession();

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
