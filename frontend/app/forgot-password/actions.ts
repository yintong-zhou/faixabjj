"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { verifyTurnstile } from "@/utils/turnstile";

export async function requestPasswordReset(formData: FormData) {
  const email = formData.get("email") as string;

  // This is the only action in the app that sends mail, and it sends it to an
  // address the sender chooses. Ungated it is a way to post a stranger's inbox
  // through the gym's quota, so the challenge comes before the send.
  //
  // A refusal still lands on ?sent=1, exactly like every other outcome: the
  // page must not become an oracle for which addresses have an account, and
  // the real reason is in the server log.
  if (!(await verifyTurnstile(formData, "password_reset"))) {
    redirect("/forgot-password?sent=1");
  }

  const supabase = createClient(await cookies());
  const headersList = await headers();
  const origin = headersList.get("origin") ?? `https://${headersList.get("host")}`;

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });

  // Always the same redirect regardless of whether the address is
  // registered, to avoid leaking which emails have accounts.
  redirect("/forgot-password?sent=1");
}
