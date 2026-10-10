"use server";

import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { sendEmailChanged } from "@/utils/account-emails";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { accountForLink, createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export async function confirmEmailChange(formData: FormData) {
  const token = formData.get("token");

  // Checked again here, not only on the page: anyone can post to the action.
  const account = await accountForLink(token, "email");
  const newEmail = account?.link.e;
  if (!account || !newEmail) redirect("/confirm-email");

  const oldEmail = account.user.email ?? "";
  const admin = createAdminClient();

  // The swap kills the link: it was bound to the address it replaces.
  // email_confirm because clicking this link is the confirmation.
  const { data, error } = await admin.auth.admin.updateUserById(account.user.id, {
    email: newEmail,
    email_confirm: true,
  });
  if (error || !data.user) {
    // Most likely the address was taken in the meantime; the screen stays
    // generic either way.
    if (error) logDbError("confirm-email", "updateUserById", { code: error.code ?? null, message: error.message });
    redirect(`/confirm-email?${new URLSearchParams({ token: String(token), failed: "1" })}`);
  }

  // person.email is a convenience copy of the auth email; keep it in step.
  const { error: copyError } = await admin
    .from("person")
    .update({ email: newEmail })
    .eq("auth_user_id", account.user.id);
  if (copyError) logDbError("confirm-email", "person.email", copyError);

  const { locale } = await getDictionary();
  after(() => sendEmailChanged(data.user, oldEmail, account.link.x, locale));

  // If this browser holds the account's session, its JWT still names the old
  // address until refreshed. No session: a harmless no-op.
  await createClient(await cookies()).auth.refreshSession();

  redirect("/confirm-email?done=1");
}
