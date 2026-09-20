import Link from "next/link";

import { CalendarPlusIcon, ChevronLeftIcon } from "@/components/icons";
import { getDictionary } from "@/utils/i18n/server";
import { TECHNICAL_ROLES } from "@/utils/members";
import { requireClassManager } from "@/utils/supabase/require-admin";
import { addCourse } from "../actions";
import { CourseFields, type Instructor } from "../course-fields";

const PATH = "/courses/new";

// A form, not a second list of anything — the same reasoning that moved
// "Aggiungi persona" out of the Registro and onto /members/new. As a panel on
// the list it pushed every course below the fold the moment it opened, on a
// form of nine fields that needs two columns at `sm:`; the phone this app is
// used on has room for one or the other, not both.
//
// requireClassManager, like the list itself: running the classes is the
// privilege, never editing the registry. It answers 404, not 403.
export default async function NewCoursePage() {
  const { t } = await getDictionary();
  const { supabase } = await requireClassManager(PATH);

  const { data: instructorRows } = await supabase
    .from("member_overview")
    .select("id, full_name")
    .overlaps("active_roles", TECHNICAL_ROLES)
    .order("full_name");

  const instructors = (instructorRows ?? []) as Instructor[];

  return (
    <div className="flex w-full flex-col gap-4 sm:gap-5">
      <Link
        href="/courses"
        className="flex w-fit items-center gap-1 text-sm font-medium text-accent hover:opacity-80"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        {t.nav.corsi}
      </Link>

      <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
        <CalendarPlusIcon className="h-5 w-5 shrink-0 text-accent" />
        {t.corsi.addCourse}
      </h1>

      {/* addCourse redirects to /courses with its own message, so a saved
          course lands back on the list it belongs to and this page never has
          to report anything itself. */}
      <form action={addCourse} className="flex flex-col gap-3 sm:gap-4">
        <p className="text-xs text-foreground/55">{t.corsi.addHint}</p>

        <CourseFields instructors={instructors} idPrefix="new" t={t} />

        <button
          type="submit"
          className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {t.corsi.createCourse}
        </button>
      </form>
    </div>
  );
}
