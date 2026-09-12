import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  PlayIcon,
} from "@/components/icons";
import { BELT_LABELS } from "@/utils/supabase/profile";
import { requireClassManager } from "@/utils/supabase/require-admin";
import { formatDayHeading, formatTime } from "@/utils/schedule";
import {
  cancelSession,
  restoreSession,
  saveRollCall,
  setSessionInstructor,
} from "../actions";

const TECHNICAL_ROLES = ["instructor", "head_coach", "admin"];

type Session = {
  id: string;
  course_name: string;
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
  // Staff only. A student reaches the lesson list but never the roll call.
  const { supabase } = await requireClassManager(`/presenze/${id}`);

  const { data } = await supabase
    .from("session_overview")
    .select(
      "id, course_name, session_date, start_time, end_time, status, instructor_id, instructor_name",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    notFound();
  }

  const session = data as Session;
  const cancelled = session.status === "cancelled";

  const [{ data: memberRows }, { data: attendanceRows }, { data: instructorRows }] =
    await Promise.all([
      supabase
        .from("member_overview")
        .select("id, full_name, current_belt, active_roles")
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

  const members = (memberRows ?? []) as Member[];
  const instructors = (instructorRows ?? []) as { id: string; full_name: string }[];

  const recorded = new Map<string, AttendanceRow>();
  for (const row of (attendanceRows ?? []) as AttendanceRow[]) {
    recorded.set(row.person_id, row);
  }

  const presentCount = [...recorded.values()].filter((row) => row.present).length;
  // Carries the week the list was on, so closing the roll call returns to it.
  const backHref = from ? `/presenze?${from}` : "/presenze";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 sm:gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href={backHref}
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-foreground/60 hover:text-foreground"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Presenze
        </Link>

        <h1
          className={`text-2xl font-bold tracking-tight sm:text-3xl ${
            cancelled ? "line-through text-foreground/50" : ""
          }`}
        >
          {session.course_name}
        </h1>

        <p className="text-sm text-foreground/65">
          {formatDayHeading(session.session_date)} ·{" "}
          {formatTime(session.start_time)}–{formatTime(session.end_time)} ·{" "}
          {presentCount} present{presentCount === 1 ? "e" : "i"}
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
          Lezione annullata: il check-in è chiuso. Le presenze già registrate
          restano.
        </p>
      ) : null}

      <section className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:gap-4 sm:p-5">
        <h2 className="font-heading text-lg font-semibold">Lezione</h2>

        <form
          action={setSessionInstructor}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="session_id" value={session.id} />
          <input type="hidden" name="from" value={from ?? ""} />
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <label htmlFor="instructor_id" className="text-sm font-medium">
              Istruttore
            </label>
            <select
              id="instructor_id"
              name="instructor_id"
              defaultValue={session.instructor_id ?? ""}
              className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent"
            >
              <option value="">Nessuno</option>
              {instructors.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-full border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-neutral-light/60"
          >
            Salva
          </button>
        </form>

        {cancelled ? (
          <form action={restoreSession}>
            <input type="hidden" name="session_id" value={session.id} />
            <input type="hidden" name="from" value={from ?? ""} />
            <button
              type="submit"
              className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-light/60"
            >
              <PlayIcon className="h-4 w-4" />
              Ripristina lezione
            </button>
          </form>
        ) : (
          <form action={cancelSession}>
            <input type="hidden" name="session_id" value={session.id} />
            <input type="hidden" name="from" value={from ?? ""} />
            <ConfirmSubmitButton
              message="Annullare questa lezione? Il check-in si chiude, ma le presenze già registrate restano."
              className="rounded-full border border-border px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
            >
              Annulla lezione
            </ConfirmSubmitButton>
          </form>
        )}
      </section>

      {/* One form and one save: on thirty members, a request per tap is worse
          than a button. */}
      <form action={saveRollCall} className="flex flex-col gap-3">
        <input type="hidden" name="session_id" value={session.id} />
        <input type="hidden" name="from" value={from ?? ""} />

        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {members.map((member) => {
            const row = recorded.get(member.id);
            const current = row ? (row.present ? "present" : "absent") : "";

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
                        check-in
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-foreground/55">
                    {BELT_LABELS[member.current_belt] ?? member.current_belt}
                  </span>
                </div>

                {/* Three states, not two: "—" means no row at all, which is
                    different information from an explicit absence. */}
                <div className="flex shrink-0 items-center gap-1">
                  {[
                    { value: "", label: "—", title: "Non registrato" },
                    { value: "present", label: "P", title: "Presente" },
                    { value: "absent", label: "A", title: "Assente" },
                  ].map((option) => (
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
                      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-sm font-medium transition-colors peer-checked:bg-foreground peer-checked:text-background">
                        {option.label}
                      </span>
                    </label>
                  ))}
                </div>
              </li>
            );
          })}

          {members.length === 0 ? (
            <li className="px-3 py-3 text-sm text-foreground/60 sm:p-4">
              Nessun membro nel registro.
            </li>
          ) : null}
        </ul>

        {members.length > 0 ? (
          <button
            type="submit"
            className="sticky bottom-24 self-center rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background shadow-lg transition-opacity hover:opacity-90 sm:bottom-6"
          >
            Salva appello
          </button>
        ) : null}
      </form>
    </div>
  );
}
