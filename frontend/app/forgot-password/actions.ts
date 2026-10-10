"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { sendResetLink } from "@/utils/account-emails";
import { getDictionary } from "@/utils/i18n/server";
import { turnstileToken } from "@/utils/turnstile";
import { verifyTurnstile } from "@/utils/turnstile-verify";

export async function requestPasswordReset(formData: FormData) {
  const email = ((formData.get("email") as string | null) ?? "").trim();

  // This action sends mail to an address the sender chooses, so it is worth a
  // challenge: ungated it is a way to post a stranger's inbox through the
  // gym's quota. The app verifies the token itself: the link is made here and
  // sent through notify-flow, so Supabase never sees this request.
  if (email && (await verifyTurnstile(turnstileToken(formData)))) {
    const { locale } = await getDictionary();
    // The lookup and the send run after the response, so the answer takes
    // the same time whether or not the address has an account.
    after(() => sendResetLink(email, locale));
  }

  // The outcome is not read, and a refusal is not reported: this page answers
  // ?sent=1 whatever happens, or it becomes an oracle for which addresses have
  // an account.
  redirect("/forgot-password?sent=1");
}
