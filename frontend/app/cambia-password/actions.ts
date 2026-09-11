"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireSession } from "@/utils/supabase/require-admin";
import { DEFAULT_PASSWORD } from "@/utils/default-password";

const PATH = "/cambia-password";

export async function changePassword(formData: FormData) {
  // requireSession, not requireAdmin: this is the one page a user with a
  // pending password change is allowed to reach.
  const { supabase, userId } = await requireSession(PATH);

  const password = (formData.get("password") as string) ?? "";
  const confirm = (formData.get("confirm_password") as string) ?? "";

  if (password.length < 8) {
    redirect(`${PATH}?error=${encodeURIComponent("La password deve avere almeno 8 caratteri.")}`);
  }

  if (password !== confirm) {
    redirect(`${PATH}?error=${encodeURIComponent("Le due password non coincidono.")}`);
  }

  // Without this the forced change would be theatre: confirming the default
  // password twice would satisfy the form and leave the account exactly as
  // exposed as it was.
  if (password === DEFAULT_PASSWORD) {
    redirect(
      `${PATH}?error=${encodeURIComponent("Scegli una password diversa da quella predefinita.")}`,
    );
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(
      `${PATH}?error=${encodeURIComponent("Non è stato possibile aggiornare la password.")}`,
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
      `${PATH}?error=${encodeURIComponent("Password aggiornata, ma la richiesta di cambio non è stata azzerata. Riprova.")}`,
    );
  }

  // The old JWT still carries must_change_password: true, so without a refresh
  // the proxy would bounce the user straight back here.
  await supabase.auth.refreshSession();

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
