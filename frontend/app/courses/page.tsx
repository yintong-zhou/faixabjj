import Link from "next/link";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  AlertCircleIcon,
  CalendarCheckIcon,
  CalendarPlusIcon,
  CheckCircleIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  TrashIcon,
} from "@/components/icons";
import { RowMenu } from "@/components/row-menu";
import { requireClassManager } from "@/utils/supabase/require-admin";
import { getDictionary } from "@/utils/i18n/server";
import { TECHNICAL_ROLES } from "@/utils/members";
import { formatTime, formatWeekdays } from "@/utils/schedule";
import {
  deleteCourse,
  extendCalendar,
  toggleCourseActive,
  updateCourse,
} from "./actions";
import { CourseFields, type Course, type Instructor } from "./course-fields";

const menuItemClass =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted";

const menuIconClass = "h-4 w-4 shrink-0";

// Same shape as the Registro's two chips: a link that navigates, with no
// chevron, so that it does not read as a panel that opens in place.
const PANEL_LINK =
  "flex min-h-11 w-fit items-center gap-2 rounded-xl border border-border px-3 py-2.5 font-heading text-sm font-semibold transition-colors hover:bg-muted";



export default async function CorsiPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const { t } = await getDictionary();
  // Instructors, maestri and admin. An allievo gets a 404, not a redirect.
  const { supabase } = await requireClassManager("/courses");

  const { data: courseRows, error: queryError } = await supabase
    .from("course_overview")
    .select("*")
    .order("is_active", { ascending: false })
    .order("name");

  const { data: instructorRows } = await supabase
    .from("member_overview")
    .select("id, full_name")
    .overlaps("active_roles", TECHNICAL_ROLES)
    .order("full_name");

  const courses = (courseRows ?? []) as Course[];
  const instructors = (instructorRows ?? []) as Instructor[];

  return (
    <div className="flex w-full flex-col gap-4 sm:gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.corsi.title}
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          {t.corsi.lead}
        </p>
      </header>

      {ok ? (
        <p className="flex items-start gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {ok}
        </p>
      ) : null}
      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {queryError ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {t.corsi.loadFailed}
          </span>
        </p>
      ) : null}

      {/* A link to its own page, not a panel that opens here. The form is nine
          fields and two columns wide at `sm:`, so opening it in place pushed
          every existing course off a phone screen — the same reason
          "Aggiungi persona" left the Registro for /members/new. */}
      <Link href="/courses/new" className={PANEL_LINK}>
        <CalendarPlusIcon className="h-4.5 w-4.5 shrink-0 text-accent" />
        {t.corsi.addCourse}
      </Link>

      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {courses.map((course) => (
          <li key={course.id} className="flex flex-col px-3 py-3 sm:p-4">
            <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {course.name}
                {course.is_active ? null : (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-foreground/55">
                    {t.corsi.suspended}
                  </span>
                )}
              </span>

              <span className="text-xs text-foreground/70">
                {formatWeekdays(course.weekdays, t)}
                {" · "}
                {formatTime(course.start_time)}–{formatTime(course.end_time)}
                {" · "}
                {course.instructor_name ?? t.corsi.noInstructor}
              </span>

              <span className="text-xs text-foreground/55">
                {course.upcoming_sessions === 0
                  ? t.corsi.noUpcoming
                  : t.corsi.upcomingCount(course.upcoming_sessions)}
                {t.corsi.checkinWindow(
                  course.checkin_opens_minutes_before,
                  course.checkin_closes_minutes_after,
                )}
              </span>
            </div>

            <RowMenu label={t.corsi.rowActions(course.name)}>
              <form action={extendCalendar}>
                <input type="hidden" name="course_id" value={course.id} />
                <button type="submit" className={menuItemClass}>
                  <CalendarCheckIcon className={menuIconClass} />
                  {t.corsi.extendCalendar}
                </button>
              </form>

              <form action={toggleCourseActive}>
                <input type="hidden" name="course_id" value={course.id} />
                <input
                  type="hidden"
                  name="is_active"
                  value={course.is_active ? "0" : "1"}
                />
                <button type="submit" className={menuItemClass}>
                  {course.is_active ? (
                    <PauseIcon className={menuIconClass} />
                  ) : (
                    <PlayIcon className={menuIconClass} />
                  )}
                  {course.is_active ? t.corsi.suspend : t.corsi.reactivate}
                </button>
              </form>

              <form action={deleteCourse}>
                <input type="hidden" name="course_id" value={course.id} />
                <ConfirmSubmitButton
                  message={t.corsi.deleteConfirm(course.name)}
                  className={`${menuItemClass} text-accent hover:bg-accent/10`}
                >
                  <TrashIcon className={menuIconClass} />
                  {t.corsi.remove}
                </ConfirmSubmitButton>
              </form>
            </RowMenu>
            </div>

            {/* The edit form sits on the row rather than inside the kebab: a
                full course form in a 15rem dropdown is unusable on a phone. */}
            <details className="mt-1">
              <summary className="cursor-pointer text-xs font-medium text-accent">
                <PencilIcon className="mr-1.5 inline-block h-3.5 w-3.5 align-[-0.2em]" />
                {t.corsi.edit}
              </summary>
              <form
                action={updateCourse}
                className="flex flex-col gap-3 pt-3 sm:gap-4"
              >
                <input type="hidden" name="course_id" value={course.id} />
                <CourseFields
                  course={course}
                  instructors={instructors}
                  idPrefix={`edit-${course.id}`}
                  t={t}
                />
                <button
                  type="submit"
                  className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
                >
                  {t.common.saveChanges}
                </button>
              </form>
            </details>
          </li>
        ))}

        {courses.length === 0 ? (
          <li className="px-3 py-3 text-sm text-foreground/60 sm:p-4">
            {t.corsi.empty}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
