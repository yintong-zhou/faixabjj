"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { turnstileToken } from "@/utils/turnstile";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const next = (formData.get("next") as string) || "/dashboard";

  const supabase = createClient(await cookies());
  // Supabase verifies the challenge itself, before it looks at the password —
  // see utils/turnstile.ts for why the check is not repeated here. Undefined
  // when no widget was drawn, which is the local case; a project with captcha
  // protection on then refuses the call, and that is the correct answer.
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: turnstileToken(formData) },
  });

  if (error) {
    // The screen stays generic, deliberately. The log does not: "wrong
    // password" and "Supabase refused the request for a reason that has
    // nothing to do with the password" are the same sentence to the reader,
    // and telling them apart used to mean guessing.
    logDbError("login", "signInWithPassword", {
      code: error.code ?? String(error.status ?? ""),
      message: error.message,
    });

    // Generic message on purpose — a specific "user not found" vs "wrong
    // password" distinction would let someone enumerate registered emails.
    // The message is looked up in the reader's language: an error that comes
    // back through a redirect is still copy, and the one place it is written
    // is the dictionary.
    //
    // The refused challenge is the one case that gets its own message, because
    // it is the one the reader can act on: reload and try again. Telling them
    // their password is wrong when it is not sends them to reset a password
    // that works.
    const { t } = await getDictionary();
    const message =
      error.code === "captcha_failed" ? t.auth.captchaFailed : t.auth.wrongCredentials;
    const params = new URLSearchParams({ error: message });
    if (next) params.set("next", next);
    redirect(`/login?${params.toString()}`);
  }

  revalidatePath("/", "layout");
  redirect(next);
}
