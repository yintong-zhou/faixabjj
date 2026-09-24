import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import type { HoursSettings } from "@/utils/hours";
import { createClient } from "@/utils/supabase/server";

export type GymStatus = "active" | "suspended";

export type GymSettings = HoursSettings & {
  id: string;
  name: string;
  status: GymStatus;
  timezone: string;
};

export const GYM_COLUMNS =
  "id, name, status, timezone, tracking_started_on, session_length_hours, lessons_per_week, created_at";

export type GymRow = {
  id: string;
  name: string;
  status: GymStatus;
  timezone: string;
  tracking_started_on: string;
  // PostgREST returns numeric as a string; a string silently wins a `<`.
  session_length_hours: number | string;
  lessons_per_week: number | string;
  created_at: string;
};

export function toGymSettings(row: GymRow): GymSettings {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    timezone: row.timezone,
    trackingStartedOn: row.tracking_started_on,
    sessionLengthHours: Number(row.session_length_hours),
    lessonsPerWeek: Number(row.lessons_per_week),
  };
}

// The signed-in member's gym, once per request. Null for the superadmin (who
// reads every gym row, hence the explicit id) and for a suspended gym, whose
// row RLS no longer shows — requireAdmin has already sent that user away.
export const getGymSettings = cache(async (): Promise<GymSettings | null> => {
  const supabase = createClient(await cookies());
  const { data: gymId } = await supabase.rpc("current_gym_id");
  if (!gymId) return null;

  const { data } = await supabase
    .from("gym")
    .select(GYM_COLUMNS)
    .eq("id", gymId as string)
    .maybeSingle();

  return data ? toGymSettings(data as GymRow) : null;
});

// For gym pages, which have nothing to compute without their gym's figures.
export async function requireGymSettings(): Promise<GymSettings> {
  const settings = await getGymSettings();
  if (!settings) notFound();
  return settings;
}
