"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  const email = formData.get("email") as string;

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
