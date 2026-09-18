import Link from "next/link";
import { notFound } from "next/navigation";
import { Belt } from "@/components/belt";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  MinusCircleIcon,
  PlayIcon,
  XCircleIcon,
} from "@/components/icons";
import { requireClassManager } from "@/utils/supabase/require-admin";
import { beltRank } from "@/utils/supabase/profile";
import { PORTAL_ONLY_ROLES, TECHNICAL_ROLES } from "@/utils/members";
import { formatDayHeading, formatTime } from "@/utils/schedule";
import { getDictionary } from "@/utils/i18n/server";
import type { Dictionary } from "@/utils/i18n/dictionaries/it";
import {
  cancelSession,
  restoreSession,
  saveRollCall,
  setSessionInstructor,
} from "../actions";

// Present is green, absent is red, not recorded is neutral. The tokens flip
// per theme — a dark green that reads well on white is nearly black on the
// dark theme.
//
// A function of the dictionary rather than a constant, because the three
// titles are words: they are the legend, the tooltip and the screen-reader
// label all at once.
function rollCallStates(t: Dictionary) {
  return [
    {
      value: "",
      title: t.rollCall.notRecorded,
      icon: MinusCircleIcon,
      checkedClass: "peer-checked:bg-muted peer-checked:text-foreground/70",
      legendClass: "text-foreground/40",
    },
    {
      value: "present",
      title: t.rollCall.present,
      icon: CheckCircleIcon,
      checkedClass: "peer-checked:bg-success/10 peer-checked:text-success",
      legendClass: "text-success",
    },
    {
      value: "absent",
      title: t.rollCall.absent,
      icon: XCircleIcon,
      checkedClass: "peer-checked:bg-danger/10 peer-checked:text-danger",
      legendClass: "text-danger",
    },
  ];
}

type Session = {
  id: string;
  course_name: string;
  course_active: boolean;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
  instructor_id: string | null;
  instructor_name: string | null;
};

type Member = {
  id: string;
  full_name: string;
  current_belt: string;
  current_stripes: number;
  active_roles: string[];
};

type AttendanceRow = {
  person_id: string;
  present: boolean;
  checked_in_by: string;
};

export default async function RollCallPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { from, ok, error } = await searchParams;
  const { t } = await getDictionary();
  const states = rollCallStates(t);
  // Staff only. A student reaches the lesson list but never the roll call.
  const { supabase } = await requireClassManager(`/attendance/${id}`);

  const { data } = await supabase
    .from("session_overview")
    .select(
      "id, course_name, course_active, session_date, start_time, end_time, status, instructor_id, instructor_name",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    notFound();
  }

  const session = data as Session;
  const cancelled = session.status === "cancelled";
  // A suspended course drops out of the calendar from today on and its
  // check-in is closed, but this page stays reachable: correcting the record
  // of a lesson that already happened is exactly what an instructor needs
  // after a course is put on hold.
  const courseSuspended = session.course_active === false;

  const [{ data: memberRows }, { data: attendanceRows }, { data: instructorRows }] =
    await Promise.all([
      supabase
        .from("member_overview")
        .select("id, full_name, current_belt, current_stripes, active_roles")
        // Somebody who only runs the portal does not attend the class.
        .not("active_roles", "eq", PORTAL_ONLY_ROLES)
        .order("full_name"),
      supabase
        .from("attendance")
        .select("person_id, present, checked_in_by")
        .eq("session_id", id),
      supabase
        .from("member_overview")
        .select("id, full_name")
        .overlaps("active_roles", TECHNICAL_ROLES)
        .order("full_name"),
    ]);

  const instructors = (instructorRows ?? []) as { id: string; full_name: string }[];

  const recorded = new Map<string, AttendanceRow>();
  for (const row of (attendanceRows ?? []) as AttendanceRow[]) {
    recorded.set(row.person_id, row);
  }

  // Whoever is teaching this lesson is on the mat, so they start ticked
  // present. It is only a default: the state can still be changed before
  // saving, and nothing is written until the roll call is submitted — the
  // instructor's own confirmation stays the thing that records the hour.
  const stateFor = (personId: string): "" | "present" | "absent" => {
    const row = recorded.get(personId);
    if (row) return row.present ? "present" : "absent";
    return personId === session.instructor_id ? "present" : "";
  };

  // Present first, then by belt from white to black, then by name. Calling the
  // roll by belt is how the class lines up, and grouping the present at the top
  // makes the list readable again once it has been saved.
  //
  // The order is computed on load, so tapping a state never makes a row jump
  // under the finger; it settles into the new order after "Salva appello".
  const members = ((memberRows ?? []) as Member[]).slice().sort((a, b) => {
    const presence =
      Number(stateFor(b.id) === "present") - Number(stateFor(a.id) === "present");
    if (presence !== 0) return presence;

    const belt = beltRank(a.current_belt) - beltRank(b.current_belt);
    if (belt !== 0) return belt;

    if (a.current_stripes !== b.current_stripes) {
      return a.current_stripes - b.current_stripes;
    }
    return a.full_name.localeCompare(b.full_name, "it");
  });

  const presentCount = [...recorded.values()].filter((row) => row.present).length;
  // How many of those presences the members declared themselves. Shown as a
  // line above the list, because confirming somebody else's claim is a
  // different act from calling the roll, and the instructor should know which
  // one they are doing before they save.
  const selfCount = [...recorded.values()].filter(
    (row) => row.present && row.checked_in_by === "self",
  ).length;
  // The instant this form was rendered, sent back on submit: a check-in that
  // lands while the roll call is open is not in the snapshot, and must not be
  // deleted by it. See saveRollCall.
  const loadedAt = new Date().toISOString();
  // Carries the week the list was on, so closing the roll call returns to it.
  const backHref = from ? `/attendance?${from}` : "/attendance";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 sm:gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href={backHref}
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-foreground/60 hover:text-foreground"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          {t.presenze.title}
        </Link>

        <h1
          className={`text-2xl font-bold tracking-tight sm:text-3xl ${
            cancelled ? "line-through text-foreground/50" : ""
          }`}
        >
          {session.course_name}
        </h1>

        <p className="text-sm text-foreground/65">
          {formatDayHeading(session.session_date, t)} ·{" "}
          {formatTime(session.start_time)}–{formatTime(session.end_time)} ·{" "}
          {t.rollCall.presentTotal(presentCount)}
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
      {cancelled ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {t.rollCall.cancelledNotice}
        </p>
      ) : null}
      {courseSuspended ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {t.rollCall.courseSuspendedNotice}
        </p>
      ) : null}

      <section className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:gap-4 sm:p-5">
        <h2 className="font-heading text-lg font-semibold">
          {t.rollCall.lessonSection}
        </h2>

        <form
          action={setSessionInstructor}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="session_id" value={session.id} />
          <input type="hidden" name="from" value={from ?? ""} />
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <label htmlFor="instructor_id" className="text-sm font-medium">
              {t.rollCall.instructor}
            </label>
            <select
              id="instructor_id"
              name="instructor_id"
              defaultValue={session.instructor_id ?? ""}
              className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent"
            >
              <option value="">{t.common.none}</option>
              {instructors.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-full border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            {t.common.save}
          </button>
        </form>

        {cancelled ? (
          <form action={restoreSession}>
            <input type="hidden" name="session_id" value={session.id} />
            <input type="hidden" name="from" value={from ?? ""} />
            <button
              type="submit"
              className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <PlayIcon className="h-4 w-4" />
              {t.rollCall.restoreLesson}
            </button>
          </form>
        ) : (
          <form action={cancelSession}>
            <input type="hidden" name="session_id" value={session.id} />
            <input type="hidden" name="from" value={from ?? ""} />
            <ConfirmSubmitButton
              message={t.rollCall.cancelConfirm}
              className="rounded-full border border-border px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
            >
              {t.rollCall.cancelLesson}
            </ConfirmSubmitButton>
          </form>
        )}
      </section>

      {/* One form and one save: on thirty members, a request per tap is worse
          than a button. */}
      <form action={saveRollCall} className="flex flex-col gap-3">
        <input type="hidden" name="session_id" value={session.id} />
        <input type="hidden" name="from" value={from ?? ""} />
        <input type="hidden" name="loaded_at" value={loadedAt} />

        {selfCount > 0 ? (
          <p className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground/70">
            <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {t.rollCall.selfCheckins(selfCount)}
          </p>
        ) : null}

        {/* A legend, because the icons replaced letters and `title` never
            appears on a phone, where this page is actually used. */}
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/55">
          {states.map((option) => (
            <li key={option.value || "none"} className="flex items-center gap-1.5">
              <option.icon className={`h-4 w-4 ${option.legendClass}`} />
              {option.title}
            </li>
          ))}
        </ul>

        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {members.map((member) => {
            const row = recorded.get(member.id);
            const current = stateFor(member.id);
            const isInstructor = member.id === session.instructor_id;

            return (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:p-4"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {member.full_name}
                    {row?.checked_in_by === "self" ? (
                      <span className="rounded-full bg-secondary/40 px-2 py-0.5 text-xs font-normal">
                        {t.rollCall.selfCheckinTag}
                      </span>
                    ) : null}
                    {isInstructor ? (
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-foreground/55">
                        {t.rollCall.instructorTag}
                      </span>
                    ) : null}
                  </span>
                  <Belt
                    belt={member.current_belt}
                    stripes={member.current_stripes}
                    className="mt-0.5"
                  />
                </div>

                {/* Three states, not two: "not recorded" means no row at all,
                    which is different information from an explicit absence.
                    It stays neutral grey — an empty state is not an outcome,
                    and a third colour would imply it were one. */}
                <div className="flex shrink-0 items-center gap-1">
                  {states.map((option) => (
                    <label
                      key={option.value || "none"}
                      title={option.title}
                      className="cursor-pointer"
                    >
                      <input
                        type="radio"
                        name={`state_${member.id}`}
                        value={option.value}
                        defaultChecked={current === option.value}
                        className="peer sr-only"
                      />
                      {/* The colour is carried by the icon and a tinted ring,
                          not by a filled button: three saturated circles per
                          row, on thirty rows, is a wall of colour. Only the
                          chosen one is coloured in. */}
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground/35 transition-colors peer-checked:border-current peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${option.checkedClass}`}
                      >
                        <option.icon className="h-5 w-5" />
                        <span className="sr-only">{option.title}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </li>
            );
          })}

          {members.length === 0 ? (
            <li className="px-3 py-3 text-sm text-foreground/60 sm:p-4">
              {t.rollCall.noMembers}
            </li>
          ) : null}
        </ul>

        {members.length > 0 ? (
          <button
            type="submit"
            className="sticky bottom-24 self-center rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background shadow-lg transition-opacity hover:opacity-90 sm:bottom-6"
          >
            {t.rollCall.saveRollCall}
          </button>
        ) : null}
      </form>
    </div>
  );
}
