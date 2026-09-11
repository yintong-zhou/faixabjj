"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/utils/supabase/require-admin";
import { getOrCreateProfile } from "@/utils/supabase/profile";

function back(params: Record<string, string>) {
  redirect(`/account?${new URLSearchParams(params).toString()}`);
}

const text = (formData: FormData, key: string) => {
  const value = (formData.get(key) as string | null)?.trim();
  return value ? value : null;
};

export async function updateProfile(formData: FormData) {
  const { supabase, userId, email: currentEmail } = await requireAdmin("/account");
  const profile = await getOrCreateProfile(supabase, userId, currentEmail);

  if (!profile) {
    back({ error: "Profilo non trovato." });
    return;
  }

  const fullName = text(formData, "full_name");
  if (!fullName) {
    back({ error: "Il nome non può essere vuoto." });
    return;
  }

  const newEmail = text(formData, "email");

  const { error } = await supabase
    .from("person")
    .update({
      full_name: fullName,
      phone: text(formData, "phone"),
      birth_date: text(formData, "birth_date"),
      notes: text(formData, "notes"),
    })
    .eq("id", profile.id);

  if (error) {
    back({ error: "Non è stato possibile salvare il profilo." });
    return;
  }

  // The auth record is the source of truth for the email; `person.email` is a
  // convenience copy. Supabase sends a confirmation link and only swaps the
  // address once it is clicked, so the change is never immediate.
  if (newEmail && newEmail !== currentEmail) {
    const { error: emailError } = await supabase.auth.updateUser({ email: newEmail });

    if (emailError) {
      back({ error: "Profilo salvato, ma il cambio email non è riuscito." });
      return;
    }

    revalidatePath("/account");
    back({ ok: "Profilo salvato. Conferma il nuovo indirizzo dal link che ti abbiamo inviato per email." });
    return;
  }

  revalidatePath("/account");
  back({ ok: "Profilo aggiornato." });
}

export async function updatePassword(formData: FormData) {
  const { supabase } = await requireAdmin("/account");

  const password = formData.get("password") as string;
  const confirm = formData.get("confirm_password") as string;

  if (!password || password.length < 8) {
    back({ error: "La password deve avere almeno 8 caratteri." });
    return;
  }

  if (password !== confirm) {
    back({ error: "Le due password non coincidono." });
    return;
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    back({ error: "Non è stato possibile aggiornare la password." });
    return;
  }

  back({ ok: "Password aggiornata." });
}
