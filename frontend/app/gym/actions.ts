"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseLocation } from "@/utils/gyms";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { requireUserManager } from "@/utils/supabase/require-admin";

const PAGE = "/gym";

function to(params: Record<string, string>): never {
  redirect(`${PAGE}?${new URLSearchParams(params).toString()}`);
}

// The manager has no update on gym: set_gym_location() changes the two
// location columns of their own gym and re-checks can_manage_users() itself.
// The guard here is for the page, the function is the authority.
export async function setGymLocation(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireUserManager(PAGE);

  let location: { latitude: number; longitude: number } | null = null;
  if (formData.get("_clear") !== "1") {
    const parsed = parseLocation(formData.get("latitude"), formData.get("longitude"));
    if (!parsed.ok) to({ error: t.gyms.invalid.location });
    location = parsed.value;
  }

  const { error } = await supabase.rpc("set_gym_location", {
    p_lat: location?.latitude ?? null,
    p_lng: location?.longitude ?? null,
  });

  if (error) {
    logDbError("gym", "setGymLocation", error);
    to({ error: t.myGym.failed });
  }

  revalidatePath(PAGE);
  revalidatePath("/attendance");
  revalidatePath("/check-in");
  to({ ok: location ? t.myGym.saved : t.myGym.cleared });
}
