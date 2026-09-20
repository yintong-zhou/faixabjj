"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getDictionary } from "@/utils/i18n/server";
import { verifyTurnstile } from "@/utils/turnstile";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const next = (formData.get("next") as string) || "/dashboard";

  // Before the credentials are even looked at: the point of the widget is that
  // a script cannot get this far, and checking afterwards would still let one
  // try a password per request.
  if (!(await verifyTurnstile(formData, "login"))) {
    const { t } = await getDictionary();
    const params = new URLSearchParams({ error: t.auth.captchaFailed });
    if (next) params.set("next", next);
    redirect(`/login?${params.toString()}`);
  }

  const supabase = createClient(await cookies());
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Generic message on purpose — a specific "user not found" vs "wrong
    // password" distinction would let someone enumerate registered emails.
    // The message is looked up in the reader's language: an error that comes
    // back through a redirect is still copy, and the one place it is written
    // is the dictionary.
    const { t } = await getDictionary();
    const params = new URLSearchParams({ error: t.auth.wrongCredentials });
    if (next) params.set("next", next);
    redirect(`/login?${params.toString()}`);
  }

  revalidatePath("/", "layout");
  redirect(next);
}
