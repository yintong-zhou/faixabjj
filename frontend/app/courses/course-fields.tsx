import type { Dictionary } from "@/utils/i18n/dictionaries/it";
import { formatTime, weekdayLabels } from "@/utils/schedule";

// The add form and every row's edit form are the same fields with different
// defaults, and they now live on two different routes -- /courses/new and the
// list -- so the component that draws them belongs to neither of them. Two
// copies would drift the moment a field is added to one of them.
export const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";

export type Course = {
  id: string;
  name: string;
  description: string | null;
  weekdays: number[] | null;
  start_time: string;
  end_time: string;
  starts_on: string;
  ends_on: string | null;
  instructor_id: string | null;
  instructor_name: string | null;
  is_active: boolean;
  checkin_opens_minutes_before: number;
  checkin_closes_minutes_after: number;
  upcoming_sessions: number;
};

export type Instructor = { id: string; full_name: string };

const HOURS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
);
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

// Hour and minute as two selects rather than <input type="time">: the native
// time widget follows the operating system's locale and shows AM/PM on a
// machine that is not set to Italian. Two selects read as 24-hour everywhere,
// still need no client JS, and are a reasonable picker on a phone.
function TimeField({
  label,
  prefix,
  value,
  idPrefix,
  t,
}: {
  label: string;
  prefix: "start" | "end";
  value?: string;
  idPrefix: string;
  t: Dictionary;
}) {
  const [hour, minute] = (value ? formatTime(value) : ":").split(":");
  // A new course starts on the hour by default: classes almost always do, and
  // it leaves the hour as the only field that has to be chosen. The hour keeps
  // its empty placeholder on purpose — there is no sensible default for it.
  const minuteValue = minute || "00";

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-1.5">
        <select
          id={`${idPrefix}-${prefix}-hour`}
          name={`${prefix}_hour`}
          required
          defaultValue={hour}
          aria-label={t.corsi.hourAria(label)}
          className={fieldClass}
        >
          <option value="" disabled>
            hh
          </option>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="text-sm font-medium text-foreground/60">
          :
        </span>
        <select
          id={`${idPrefix}-${prefix}-minute`}
          name={`${prefix}_minute`}
          required
          defaultValue={minuteValue}
          aria-label={t.corsi.minuteAria(label)}
          className={fieldClass}
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// The add and edit forms are the same fields; only the defaults differ, so
// they are one component rather than two that drift apart.
export function CourseFields({
  course,
  instructors,
  idPrefix,
  t,
}: {
  course?: Course;
  instructors: Instructor[];
  idPrefix: string;
  t: Dictionary;
}) {
  // A course saved earlier may point at somebody who no longer holds a
  // technical role. Dropping them from the list would make the browser fall
  // back to the first option and silently reassign the course on the next
  // save, so the current holder stays selectable.
  const options =
    course?.instructor_id && !instructors.some((p) => p.id === course.instructor_id)
      ? [
          ...instructors,
          {
            id: course.instructor_id,
            full_name: course.instructor_name ?? t.corsi.currentInstructor,
          },
        ]
      : instructors;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-name`} className="text-sm font-medium">
          {t.corsi.courseName}
        </label>
        <input
          id={`${idPrefix}-name`}
          name="name"
          required
          defaultValue={course?.name ?? ""}
          className={fieldClass}
        />
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">{t.corsi.days}</legend>
        <div className="flex flex-wrap gap-2 pt-1">
          {weekdayLabels(t).map((day) => (
            <label
              key={day.value}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm"
            >
              <input
                type="checkbox"
                name="weekdays"
                value={day.value}
                defaultChecked={course?.weekdays?.includes(day.value) ?? false}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              {day.short}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <TimeField
          label={t.corsi.startTime}
          prefix="start"
          value={course?.start_time}
          idPrefix={idPrefix}
          t={t}
        />

        <TimeField
          label={t.corsi.endTime}
          prefix="end"
          value={course?.end_time}
          idPrefix={idPrefix}
          t={t}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-starts_on`} className="text-sm font-medium">
            {t.corsi.activeFrom}{" "}
            <span className="text-foreground/50">{t.corsi.todayIfEmpty}</span>
          </label>
          <input
            id={`${idPrefix}-starts_on`}
            name="starts_on"
            type="date"
            defaultValue={course?.starts_on ?? ""}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-ends_on`} className="text-sm font-medium">
            {t.corsi.activeUntil}{" "}
            <span className="text-foreground/50">{t.corsi.neverEndsIfEmpty}</span>
          </label>
          <input
            id={`${idPrefix}-ends_on`}
            name="ends_on"
            type="date"
            defaultValue={course?.ends_on ?? ""}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-opens`} className="text-sm font-medium">
            {t.corsi.checkinBefore}
          </label>
          <input
            id={`${idPrefix}-opens`}
            name="checkin_opens_minutes_before"
            type="number"
            min={0}
            max={1440}
            defaultValue={course?.checkin_opens_minutes_before ?? 15}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-closes`} className="text-sm font-medium">
            {t.corsi.checkinAfter}
          </label>
          <input
            id={`${idPrefix}-closes`}
            name="checkin_closes_minutes_after"
            type="number"
            min={0}
            max={1440}
            defaultValue={course?.checkin_closes_minutes_after ?? 0}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={`${idPrefix}-instructor_id`} className="text-sm font-medium">
            {t.corsi.instructor}{" "}
            <span className="text-foreground/50">{t.corsi.instructorDefault}</span>
          </label>
          <select
            id={`${idPrefix}-instructor_id`}
            name="instructor_id"
            defaultValue={course?.instructor_id ?? ""}
            className={fieldClass}
          >
            <option value="">{t.common.none}</option>
            {options.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-description`} className="text-sm font-medium">
          {t.corsi.description}
        </label>
        <textarea
          id={`${idPrefix}-description`}
          name="description"
          rows={2}
          defaultValue={course?.description ?? ""}
          className={`${fieldClass} resize-y`}
        />
      </div>
    </>
  );
}
