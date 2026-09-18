"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDictionary } from "@/utils/i18n/server";
import { requireRegistryEditor } from "@/utils/supabase/require-admin";

const PATH = "/promotions";

function logDbError(
  where: string,
  error: { code?: string | null; message?: string | null; details?: string | null },
) {
  console.error(
    `[promotions] ${where} failed: ${error.code ?? "no code"} ${error.message ?? ""} ${
      error.details ?? ""
    }`.trim(),
  );
}

function back(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  redirect(`${PATH}?${search.toString()}`);
}

const number = (formData: FormData, key: string): number | null => {
  const raw = (formData.get(key) as string | null)?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

// Tunes one row of promotion_criteria. The grade itself is never editable:
// the ladder is fixed, only its numbers are the gym's business — so belt and
// stripe arrive as hidden fields and are used to address the row, never to
// create one.
export async function updateCriterion(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireRegistryEditor(PATH);

  const belt = (formData.get("belt") as string | null)?.trim();
  const stripe = number(formData, "stripe");
  if (!belt || stripe === null) {
    back({ error: t.msg.criterionFailed });
    return;
  }

  const minHours = number(formData, "min_hours");
  const minDays = number(formData, "min_time_at_rank_days");
  if (minHours === null || minHours < 0 || minDays === null || minDays < 0) {
    back({ error: t.msg.criterionFailed });
    return;
  }

  const minAge = number(formData, "min_age_years");
  const notes = (formData.get("notes") as string | null)?.trim() || null;

  const { error } = await supabase
    .from("promotion_criteria")
    .update({
      min_hours: minHours,
      min_time_at_rank_days: Math.round(minDays),
      min_age_years: minAge === null ? null : Math.round(minAge),
      notes,
    })
    .eq("belt", belt)
    .eq("stripe", stripe);

  if (error) {
    // The database's own text never reaches the screen: codes and constraint
    // names describe the schema, which is not the reader's business.
    logDbError("updateCriterion", error);
    back({ error: t.msg.criterionFailed });
    return;
  }

  revalidatePath(PATH);
  back({ ok: t.msg.criterionSaved });
}
