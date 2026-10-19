"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { sendPasswordChanged } from "@/utils/account-emails";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { accountForLink, createAdminClient } from "@/utils/supabase/admin";

export async function resetPassword(formData: FormData) {
  const token = formData.get("token");
  const password = (formData.get("password") as string | null) ?? "";
  const { t, locale } = await getDictionary();

  // Checked again here, not only on the page: anyone can post to the action.
  const account = await accountForLink(token, "reset");
  if (!account) redirect("/reset-password");

  const back = (error: string) =>
    redirect(`/reset-password?${new URLSearchParams({ token: String(token), error })}`);

  if (password.length < 8) back(t.auth.tooShort);

  // Changing the password moves updated_at, which is what kills the link.
  // A reset also ends any pending forced change: the password is now one only
  // its owner knows, which is all the forced change was for.
  const { error } = await createAdminClient().auth.admin.updateUserById(account.user.id, {
    password,
    app_metadata: { must_change_password: false },
  });
  if (error) {
    logDbError("reset", "updateUserById", { code: error.code ?? null, message: error.message });
    back(t.reset.updateFailed);
  }

  after(() => sendPasswordChanged(account.user.id, locale));
  redirect("/login?reset=1&mail=password");
}
