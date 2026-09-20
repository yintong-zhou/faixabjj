"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { turnstileToken } from "@/utils/turnstile";

export async function requestPasswordReset(formData: FormData) {
  const email = formData.get("email") as string;

  const supabase = createClient(await cookies());
  const headersList = await headers();
  const origin = headersList.get("origin") ?? `https://${headersList.get("host")}`;

  // This is the only action in the app that sends mail, and it sends it to an
  // address the sender chooses, so it is worth a challenge: ungated it is a
  // way to post a stranger's inbox through the gym's quota. Supabase checks
  // the token before it sends, for the same reason it checks it before reading
  // a password — see utils/turnstile.ts.
  //
  // The outcome is not read, and a refusal is not reported: this page answers
  // ?sent=1 whatever happens, or it becomes an oracle for which addresses have
  // an account.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
    captchaToken: turnstileToken(formData),
  });

  // Always the same redirect regardless of whether the address is
  // registered, to avoid leaking which emails have accounts.
  redirect("/forgot-password?sent=1");
}
