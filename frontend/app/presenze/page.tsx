import Link from "next/link";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/icons";
import { getOrCreateProfile } from "@/utils/supabase/profile";
import { getAccess, requireAdmin } from "@/utils/supabase/require-admin";
import {
  addDays,
  checkinState,
  formatDayHeading,
  formatTime,
  weekStart,
} from "@/utils/schedule";
import { checkIn, undoCheckIn } from "./actions";

type Session = {
  id: string;
  course_id: string;
  course_name: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
  instructor_name: string | null;
  checkin_opens_at: string;
  checkin_closes_at: string;
  present_count: number;
};

type Search = { da?: string; ok?: string; error?: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function PresenzePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  // requireAdmin, not requireRegistryViewer: this is the one previously
  // staff-only section a student reaches, because check-in has to live where
  // the lessons are listed. What differs by role is what the page renders.
  const { supabase, userId, email } = await requireAdmin("/presenze");
  const access = await getAccess(supabase);
  const isStaff = access.canManageClasses;

  const today = new Date().toISOString().slice(0, 10);
  const from = weekStart(ISO_DATE.test(search.da ?? "") ? search.da! : today);
  const until = addDays(from, 6);

  const { data, error: queryError } = await supabase
    .from("session_overview")
    .select("*")
    .gte("session_date", from)
    .lte("session_date", until)
    .order("session_date")
    .order("start_time");

  const sessions = (data ?? []) as Session[];

  // A member's own attendance for the week, so the page can tell "already
  // checked in" from "not yet". Staff read the counts from the view instead.
  let profileMissing = false;
  const ownAttendance = new Map<string, boolean>();
  if (!isStaff) {
    const profile = await getOrCreateProfile(supabase, userId, email);
    if (!profile) {
      profileMissing = true;
    } else if (sessions.length > 0) {
      const { data: rows } = await supabase
        .from("attendance")
        .select("session_id, present")
        .eq("person_id", profile.id)
        .in(
          "session_id",
          sessions.map((session) => session.id),
        );

      for (const row of (rows ?? []) as { session_id: string; present: boolean }[]) {
        ownAttendance.set(row.session_id, row.present);
      }
    }
  }

  const now = new Date();
  const currentQuery = new URLSearchParams(from === weekStart(today) ? {} : { da: from })
    .toString();

  const days = Array.from({ length: 7 }, (_, index) => addDays(from, index)).map(
    (date) => ({
      date,
      sessions: sessions.filter((session) => session.session_date === date),
    }),
  );

  return (
    <div className="flex w-full flex-col gap-4 sm:gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Presenze</h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          {isStaff
            ? "Le lezioni della settimana. Apri una lezione per fare l'appello."
            : "Le lezioni della settimana. Fai il check-in quando sei in palestra: ogni presenza vale un'ora."}
        </p>
      </header>

      {search.ok ? (
        <p className="flex items-start gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {search.ok}
        </p>
      ) : null}
      {search.error ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {search.error}
        </p>
      ) : null}
      {queryError ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Non è stato possibile caricare il calendario. Controlla che le
            migration del database siano state applicate.
          </span>
        </p>
      ) : null}
      {profileMissing ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          Il tuo profilo non è disponibile, quindi il check-in è disattivato.
        </p>
      ) : null}

      <nav className="flex items-center justify-between gap-2">
        <Link
          href={`/presenze?da=${addDays(from, -7)}`}
          className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-light/60"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Prima
        </Link>

        <Link
          href="/presenze"
          className="rounded-full px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-neutral-light/60"
        >
          Oggi
        </Link>

        <Link
          href={`/presenze?da=${addDays(from, 7)}`}
          className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-light/60"
        >
          Dopo
          <ChevronRightIcon className="h-4 w-4" />
        </Link>
      </nav>

      {sessions.length === 0 ? (
        <p className="rounded-xl border border-border px-3 py-3 text-sm text-foreground/60 sm:p-4">
          Nessuna lezione in questa settimana.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {days
            .filter((day) => day.sessions.length > 0)
            .map((day) => (
              <section key={day.date} className="flex flex-col gap-2">
                <h2
                  className={`font-heading text-sm font-semibold ${
                    day.date === today ? "text-accent" : "text-foreground/70"
                  }`}
                >
                  {formatDayHeading(day.date)}
                  {day.date === today ? " · oggi" : ""}
                </h2>

                <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                  {day.sessions.map((session) => {
                    const cancelled = session.status === "cancelled";
                    const state = checkinState({
                      opensAt: session.checkin_opens_at,
                      closesAt: session.checkin_closes_at,
                      status: session.status,
                      now,
                    });
                    const checkedIn = ownAttendance.get(session.id);

                    return (
                      <li
                        key={session.id}
                        className="flex items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:p-4"
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span
                            className={`text-sm font-medium ${
                              cancelled ? "line-through text-foreground/50" : ""
                            }`}
                          >
                            {formatTime(session.start_time)} · {session.course_name}
                          </span>
                          <span className="text-xs text-foreground/55">
                            {formatTime(session.start_time)}–
                            {formatTime(session.end_time)}
                            {" · "}
                            {session.instructor_name ?? "nessun istruttore"}
                            {cancelled ? " · lezione annullata" : ""}
                          </span>
                        </div>

                        {isStaff ? (
                          <Link
                            href={`/presenze/${session.id}?from=${encodeURIComponent(currentQuery)}`}
                            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-neutral-light/60"
                          >
                            {session.present_count > 0
                              ? `${session.present_count} presenti`
                              : "Appello"}
                            <ChevronRightIcon className="h-4 w-4" />
                          </Link>
                        ) : (
                          <CheckinControl
                            sessionId={session.id}
                            state={state}
                            checkedIn={checkedIn}
                            disabled={profileMissing}
                            query={currentQuery}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}

// What a member sees on the right of a row. `checkedIn === false` means the
// staff recorded them absent — not something they can overturn themselves.
function CheckinControl({
  sessionId,
  state,
  checkedIn,
  disabled,
  query,
}: {
  sessionId: string;
  state: ReturnType<typeof checkinState>;
  checkedIn: boolean | undefined;
  disabled: boolean;
  query: string;
}) {
  const muted = "shrink-0 text-xs text-foreground/50";

  if (checkedIn === false) {
    return <span className={muted}>assente</span>;
  }

  if (checkedIn === true) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex items-center gap-1 text-xs font-medium text-accent">
          <CheckCircleIcon className="h-4 w-4" />
          Presente
        </span>
        {state === "open" ? (
          <form action={undoCheckIn}>
            <input type="hidden" name="_query" value={query} />
            <input type="hidden" name="session_id" value={sessionId} />
            <button
              type="submit"
              className="rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:bg-neutral-light/60"
            >
              Annulla
            </button>
          </form>
        ) : null}
      </div>
    );
  }

  if (state === "cancelled") {
    return <span className={muted}>annullata</span>;
  }
  if (state === "too_early") {
    return <span className={muted}>check-in non ancora aperto</span>;
  }
  if (state === "closed") {
    return <span className={muted}>check-in chiuso</span>;
  }

  return (
    <form action={checkIn} className="shrink-0">
      <input type="hidden" name="_query" value={query} />
      <input type="hidden" name="session_id" value={sessionId} />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        Check-in
      </button>
    </form>
  );
}
