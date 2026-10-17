import Link from "next/link";

import { AlertCircleIcon, CalendarPlusIcon, ChevronLeftIcon } from "@/components/icons";
import { todayIn } from "@/utils/dates";
import { getDictionary } from "@/utils/i18n/server";
import { TECHNICAL_ROLES } from "@/utils/members";
import { requireGymSettings } from "@/utils/supabase/gym";
import { getOrCreateProfile } from "@/utils/supabase/profile";
import { requireClassManager } from "@/utils/supabase/require-admin";
import { fieldClass, TimeField, type Instructor } from "../../courses/course-fields";
import { addOpenMat } from "../actions";

const PATH = "/attendance/open-mat";

// A one-off lesson on a day the instructor picks, for the open mats that fall
// outside the course schedule. Same guard as /courses: running the classes is
// the privilege. Answers 404, not 403.
export default async function OpenMatPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { t } = await getDictionary();
  const { supabase, userId, email } = await requireClassManager(PATH);
  const today = todayIn((await requireGymSettings()).timezone);

  const [{ data: instructorRows }, profile] = await Promise.all([
    supabase
      .from("member_overview")
      .select("id, full_name")
      .overlaps("active_roles", TECHNICAL_ROLES)
      .order("full_name"),
    getOrCreateProfile(supabase, userId, email),
  ]);

  const instructors = (instructorRows ?? []) as Instructor[];
  // Whoever creates it is usually the one on the mat.
  const defaultInstructor = instructors.some((p) => p.id === profile?.id)
    ? profile!.id
    : "";

  return (
    <div className="flex w-full flex-col gap-4 sm:gap-5">
      <Link
        href="/attendance"
        className="flex w-fit items-center gap-1 text-sm font-medium text-accent hover:opacity-80"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        {t.presenze.title}
      </Link>

      <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
        <CalendarPlusIcon className="h-5 w-5 shrink-0 text-accent" />
        {t.presenze.addOpenMat}
      </h1>

      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <form action={addOpenMat} className="flex flex-col gap-3 sm:gap-4">
        <p className="text-xs text-foreground/55">{t.presenze.openMatHint}</p>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="openmat-date" className="text-sm font-medium">
              {t.presenze.openMatDate}
            </label>
            <input
              id="openmat-date"
              name="date"
              type="date"
              required
              min={today}
              defaultValue={today}
              className={fieldClass}
            />
          </div>

          <TimeField label={t.corsi.startTime} prefix="start" idPrefix="openmat" t={t} />
          <TimeField label={t.corsi.endTime} prefix="end" idPrefix="openmat" t={t} />

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="openmat-instructor_id" className="text-sm font-medium">
              {t.corsi.instructor}
            </label>
            <select
              id="openmat-instructor_id"
              name="instructor_id"
              defaultValue={defaultInstructor}
              className={fieldClass}
            >
              <option value="">{t.common.none}</option>
              {instructors.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {t.presenze.createOpenMat}
        </button>
      </form>
    </div>
  );
}
