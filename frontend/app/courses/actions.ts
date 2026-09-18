"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClassManager } from "@/utils/supabase/require-admin";
import { addDays, expandWeekdays, parseWeekdays } from "@/utils/schedule";
import type { Dictionary } from "@/utils/i18n/dictionaries/it";
import { getDictionary } from "@/utils/i18n/server";

const PATH = "/courses";

// Eight weeks of lessons is far enough ahead to plan around and near enough
// that editing a course does not have to rewrite a year of calendar.
const HORIZON_DAYS = 56;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function back(params: Record<string, string>, query?: string) {
  const search = new URLSearchParams(query ?? "");
  for (const [key, value] of Object.entries(params)) {
    search.set(key, value);
  }
  redirect(`${PATH}?${search.toString()}`);
}

const text = (formData: FormData, key: string) => {
  const value = (formData.get(key) as string | null)?.trim();
  return value ? value : null;
};

type CourseValues = {
  name: string;
  description: string | null;
  weekdays: number[];
  start_time: string;
  end_time: string;
  starts_on: string;
  ends_on: string | null;
  instructor_id: string | null;
  checkin_opens_minutes_before: number;
  checkin_closes_minutes_after: number;
};

// The form posts hour and minute separately rather than using an
// <input type="time">, whose widget follows the operating system's locale and
// shows AM/PM on a machine that is not set to Italian. Two selects read the
// same on every locale, and this is where they become "HH:MM".
function readTime(formData: FormData, prefix: string): string | null {
  const hour = (formData.get(`${prefix}_hour`) as string | null)?.trim();
  const minute = (formData.get(`${prefix}_minute`) as string | null)?.trim();

  const h = Number.parseInt(hour ?? "", 10);
  const m = Number.parseInt(minute ?? "", 10);
  if (!Number.isInteger(h) || h < 0 || h > 23) return null;
  if (!Number.isInteger(m) || m < 0 || m > 59) return null;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Validated here and not only through the form's `required` attributes, which
// a crafted POST skips.
function readCourseForm(
  formData: FormData,
  t: Dictionary,
): { error: string } | { values: CourseValues } {
  const name = text(formData, "name");
  if (!name) return { error: t.msg.courseNameRequired };

  const startTime = readTime(formData, "start");
  const endTime = readTime(formData, "end");
  if (!startTime || !endTime) {
    return { error: t.msg.timesRequired };
  }
  if (endTime <= startTime) {
    return { error: t.msg.endBeforeStart };
  }

  const weekdays = parseWeekdays(formData.getAll("weekdays").map(String));
  if (weekdays.length === 0) {
    return { error: t.msg.pickOneDay };
  }

  const opensBefore = Number.parseInt(
    (formData.get("checkin_opens_minutes_before") as string) ?? "15",
    10,
  );
  const closesAfter = Number.parseInt(
    (formData.get("checkin_closes_minutes_after") as string) ?? "0",
    10,
  );
  if (!Number.isInteger(opensBefore) || opensBefore < 0 || opensBefore > 1440) {
    return { error: t.msg.opensRange };
  }
  if (!Number.isInteger(closesAfter) || closesAfter < 0 || closesAfter > 1440) {
    return { error: t.msg.closesRange };
  }

  const startsOn = text(formData, "starts_on");
  const endsOn = text(formData, "ends_on");
  if (startsOn && endsOn && endsOn < startsOn) {
    return { error: t.msg.endDateBeforeStart };
  }

  return {
    values: {
      name,
      description: text(formData, "description"),
      weekdays,
      start_time: startTime,
      end_time: endTime,
      starts_on: startsOn ?? today(),
      ends_on: endsOn,
      // The course's default instructor. sync_course_sessions() copies it onto
      // the sessions it creates, and leaves an existing session's instructor
      // alone — a substitution recorded on one lesson survives a course edit.
      instructor_id: text(formData, "instructor_id"),
      checkin_opens_minutes_before: opensBefore,
      checkin_closes_minutes_after: closesAfter,
    },
  };
}

type SyncTarget = {
  id: string;
  weekdays: number[];
  starts_on: string;
  ends_on: string | null;
};

// The weekday expansion is the unit-tested TypeScript function; Postgres only
// receives the resulting list of dates, so the calendar maths has one home.
// What SQL does is the part only SQL can do atomically — drop the future
// sessions the new schedule supersedes, but only where nobody was recorded.
async function syncSessions(supabase: SupabaseClient, course: SyncTarget) {
  const from = course.starts_on > today() ? course.starts_on : today();
  const horizon = addDays(today(), HORIZON_DAYS);
  const until = course.ends_on && course.ends_on < horizon ? course.ends_on : horizon;

  const dates = expandWeekdays({ weekdays: course.weekdays, from, until });
  const { error } = await supabase.rpc("sync_course_sessions", {
    p_course_id: course.id,
    p_dates: dates,
  });

  return { error, count: dates.length };
}

const SYNC_COLUMNS = "id, weekdays, starts_on, ends_on";

export async function addCourse(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireClassManager(PATH);
  const query = (formData.get("_query") as string | null) ?? "";

  const parsed = readCourseForm(formData, t);
  if ("error" in parsed) {
    back({ error: parsed.error }, query);
    return;
  }

  const { data, error } = await supabase
    .from("course")
    .insert(parsed.values)
    .select(SYNC_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    back({ error: t.msg.courseNotCreated }, query);
    return;
  }

  const synced = await syncSessions(supabase, data as SyncTarget);
  revalidatePath(PATH);
  revalidatePath("/attendance");

  back(
    synced.error
      ? { error: t.msg.courseCreatedNoCalendar(parsed.values.name) }
      : {
          ok: t.msg.courseCreated(parsed.values.name, synced.count),
        },
    query,
  );
}

export async function updateCourse(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireClassManager(PATH);
  const query = (formData.get("_query") as string | null) ?? "";
  const id = formData.get("course_id") as string;

  if (!id) {
    back({ error: t.msg.courseNotSpecified }, query);
    return;
  }

  const parsed = readCourseForm(formData, t);
  if ("error" in parsed) {
    back({ error: parsed.error }, query);
    return;
  }

  const { data, error } = await supabase
    .from("course")
    .update(parsed.values)
    .eq("id", id)
    .select(SYNC_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    back({ error: t.msg.courseUpdateFailed }, query);
    return;
  }

  // Lessons already attended keep their old time: that rule lives in
  // sync_course_sessions, not here.
  const synced = await syncSessions(supabase, data as SyncTarget);
  revalidatePath(PATH);
  revalidatePath("/attendance");

  back(
    synced.error
      ? { error: t.msg.courseUpdatedNoCalendar }
      : { ok: t.msg.courseUpdated(parsed.values.name) },
    query,
  );
}

export async function extendCalendar(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireClassManager(PATH);
  const query = (formData.get("_query") as string | null) ?? "";
  const id = formData.get("course_id") as string;

  const { data, error } = await supabase
    .from("course")
    .select(`${SYNC_COLUMNS}, name`)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    back({ error: t.msg.courseNotFound }, query);
    return;
  }

  const synced = await syncSessions(supabase, data as SyncTarget);
  revalidatePath(PATH);
  revalidatePath("/attendance");

  back(
    synced.error
      ? { error: t.msg.calendarNotExtended }
      : {
          ok: t.msg.calendarExtended((data as { name: string }).name, synced.count),
        },
    query,
  );
}

export async function toggleCourseActive(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireClassManager(PATH);
  const query = (formData.get("_query") as string | null) ?? "";
  const id = formData.get("course_id") as string;
  const active = formData.get("is_active") === "1";

  const { error } = await supabase
    .from("course")
    .update({ is_active: active })
    .eq("id", id);

  if (error) {
    back({ error: t.msg.genericFailed }, query);
    return;
  }

  revalidatePath(PATH);
  back({ ok: active ? t.msg.courseReactivated : t.msg.courseSuspended }, query);
}

export async function deleteCourse(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireClassManager(PATH);
  const query = (formData.get("_query") as string | null) ?? "";
  const id = formData.get("course_id") as string;

  const { error } = await supabase.from("course").delete().eq("id", id);

  if (error) {
    // guard_course_delete raises this when the course has history; its message
    // is already the one to show.
    back(
      {
        error: error.message.includes("presenze registrate")
          ? t.msg.courseHasAttendance
          : t.msg.deleteFailed,
      },
      query,
    );
    return;
  }

  revalidatePath(PATH);
  revalidatePath("/attendance");
  back({ ok: t.msg.courseDeleted }, query);
}
