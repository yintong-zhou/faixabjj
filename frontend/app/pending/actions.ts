"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { logDbError } from "@/utils/log";
import { createClient } from "@/utils/supabase/server";

// After approval the account's app_metadata has the gym, but the JWT in the
// cookie still carries pending_gym_id until it is refreshed (up to an hour).
// Refreshing here — a server action may write cookies, a page may not — lets
// the athlete in at once; /dashboard sends a still-pending account straight
// back. A rejected request deleted the account, so the refresh fails: sign out
// rather than leave a dead session on this page.
export async function checkAgain() {
  const supabase = createClient(await cookies());
  const { error } = await supabase.auth.refreshSession();

  if (error) {
    logDbError("pending", "refreshSession", { code: error.code ?? null, message: error.message });
    await supabase.auth.signOut();
    revalidatePath("/", "layout");
    redirect("/login");
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
