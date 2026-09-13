"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getDictionary } from "@/utils/i18n/server";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const next = (formData.get("next") as string) || "/dashboard";

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
