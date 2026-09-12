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
import {
  WEEKDAY_LABELS,
  formatTime,
  formatWeekdays,
} from "@/utils/schedule";
import {
  addCourse,
  deleteCourse,
  extendCalendar,
  toggleCourseActive,
  updateCourse,
} from "./actions";

const menuItemClass =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-neutral-light/60";

const menuIconClass = "h-4 w-4 shrink-0";

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";

// Only people who could plausibly lead a class are offered as instructors.
const TECHNICAL_ROLES = ["instructor", "head_coach", "admin"];

type Course = {
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

type Instructor = { id: string; full_name: string };

// The add and edit forms are the same fields; only the defaults differ, so
// they are one component rather than two that drift apart.
function CourseFields({
  course,
  instructors,
  idPrefix,
}: {
  course?: Course;
  instructors: Instructor[];
  idPrefix: string;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-name`} className="text-sm font-medium">
          Nome del corso
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
        <legend className="text-sm font-medium">Giorni</legend>
        <div className="flex flex-wrap gap-2 pt-1">
          {WEEKDAY_LABELS.map((day) => (
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
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-start_time`} className="text-sm font-medium">
            Inizio
          </label>
          <input
            id={`${idPrefix}-start_time`}
            name="start_time"
            type="time"
            required
            defaultValue={course ? formatTime(course.start_time) : ""}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-end_time`} className="text-sm font-medium">
            Fine
          </label>
          <input
            id={`${idPrefix}-end_time`}
            name="end_time"
            type="time"
            required
            defaultValue={course ? formatTime(course.end_time) : ""}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-starts_on`} className="text-sm font-medium">
            Attivo dal <span className="text-foreground/50">(oggi se vuoto)</span>
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
            Fino al <span className="text-foreground/50">(senza fine se vuoto)</span>
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
          <label htmlFor={`${idPrefix}-instructor_id`} className="text-sm font-medium">
            Istruttore
          </label>
          <select
            id={`${idPrefix}-instructor_id`}
            name="instructor_id"
            defaultValue={course?.instructor_id ?? ""}
            className={fieldClass}
          >
            <option value="">Nessuno</option>
            {instructors.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-opens`} className="text-sm font-medium">
            Check-in da (min prima)
          </label>
          <input
            id={`${idPrefix}-opens`}
            name="checkin_opens_minutes_before"
            type="number"
            min={0}
            max={1440}
            defaultValue={course?.checkin_opens_minutes_before ?? 60}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-closes`} className="text-sm font-medium">
            Check-in fino a (min dopo)
          </label>
          <input
            id={`${idPrefix}-closes`}
            name="checkin_closes_minutes_after"
            type="number"
            min={0}
            max={1440}
            defaultValue={course?.checkin_closes_minutes_after ?? 30}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-description`} className="text-sm font-medium">
          Descrizione
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

export default async function CorsiPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  // Instructors, maestri and admin. An allievo gets a 404, not a redirect.
  const { supabase } = await requireClassManager("/corsi");

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
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Corsi</h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          I corsi ricorrenti della palestra. Da qui nasce il calendario delle
          lezioni che trovi in Presenze.
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
            Non è stato possibile caricare i corsi. Controlla che le migration
            del database siano state applicate.
          </span>
        </p>
      ) : null}

      <details className="rounded-xl border border-border">
        {/* Inline icon, not a flex summary: flex removes the native
            disclosure triangle. */}
        <summary className="cursor-pointer px-4 py-3 font-heading text-base font-semibold sm:px-5 sm:py-4">
          <CalendarPlusIcon className="mr-2 inline-block h-4.5 w-4.5 align-[-0.2em] text-accent" />
          Aggiungi corso
        </summary>

        <form
          action={addCourse}
          className="flex flex-col gap-3 px-4 pb-4 sm:gap-4 sm:px-5 sm:pb-5"
        >
          <p className="text-xs text-foreground/55">
            Salvando il corso vengono generate le lezioni delle prossime otto
            settimane. Le lezioni già passate non vengono mai toccate.
          </p>

          <CourseFields instructors={instructors} idPrefix="new" />

          <button
            type="submit"
            className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Crea corso
          </button>
        </form>
      </details>

      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {courses.map((course) => (
          <li key={course.id} className="flex flex-col px-3 py-3 sm:p-4">
            <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {course.name}
                {course.is_active ? null : (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-foreground/55">
                    sospeso
                  </span>
                )}
              </span>

              <span className="text-xs text-foreground/70">
                {formatWeekdays(course.weekdays)}
                {" · "}
                {formatTime(course.start_time)}–{formatTime(course.end_time)}
                {" · "}
                {course.instructor_name ?? "nessun istruttore"}
              </span>

              <span className="text-xs text-foreground/55">
                {course.upcoming_sessions === 0
                  ? "nessuna lezione futura in calendario"
                  : `${course.upcoming_sessions} lezioni in calendario`}
                {" · check-in da "}
                {course.checkin_opens_minutes_before} min prima a{" "}
                {course.checkin_closes_minutes_after} min dopo
              </span>
            </div>

            <RowMenu label={`Azioni per ${course.name}`}>
              <form action={extendCalendar}>
                <input type="hidden" name="course_id" value={course.id} />
                <button type="submit" className={menuItemClass}>
                  <CalendarCheckIcon className={menuIconClass} />
                  Estendi calendario
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
                  {course.is_active ? "Sospendi" : "Riattiva"}
                </button>
              </form>

              <form action={deleteCourse}>
                <input type="hidden" name="course_id" value={course.id} />
                <ConfirmSubmitButton
                  message={`Eliminare ${course.name}? Possibile solo se non ha presenze registrate; altrimenti puoi sospenderlo.`}
                  className={`${menuItemClass} text-accent hover:bg-accent/10`}
                >
                  <TrashIcon className={menuIconClass} />
                  Elimina
                </ConfirmSubmitButton>
              </form>
            </RowMenu>
            </div>

            {/* The edit form sits on the row rather than inside the kebab: a
                full course form in a 15rem dropdown is unusable on a phone. */}
            <details className="mt-1">
              <summary className="cursor-pointer text-xs font-medium text-accent">
                <PencilIcon className="mr-1.5 inline-block h-3.5 w-3.5 align-[-0.2em]" />
                Modifica
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
                />
                <button
                  type="submit"
                  className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
                >
                  Salva modifiche
                </button>
              </form>
            </details>
          </li>
        ))}

        {courses.length === 0 ? (
          <li className="px-3 py-3 text-sm text-foreground/60 sm:p-4">
            Nessun corso ancora. Creane uno qui sopra: le lezioni compaiono in
            Presenze subito dopo.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
