import Link from "next/link";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/icons";
import { formatDate } from "@/utils/dates";
import { getOrCreateProfile } from "@/utils/supabase/profile";
import { getAccess, requireAdmin } from "@/utils/supabase/require-admin";
import {
  WEEKDAY_LABELS,
  addDays,
  checkinState,
  formatDayHeading,
  formatDayNumber,
  formatMonthHeading,
  formatTime,
  monthGridRange,
  monthStart,
  shiftMonth,
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

// `v` is the view, `da` the anchor date, `g` the day opened inside the grid.
// All three live in the URL like every other bit of state in this app: the
// page needs no client JS, and a link to "the grid, October, that Tuesday" is
// just a URL.
type Search = { da?: string; v?: string; g?: string; ok?: string; error?: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const GRID = "griglia";

const DAY_MS = 86_400_000;

function daysBetween(from: string, until: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${until}T00:00:00Z`);
  const out: string[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

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
  const isGrid = search.v === GRID;
  const anchor = ISO_DATE.test(search.da ?? "") ? search.da! : today;

  // One anchor date, two readings: the week it falls in, or the month. That is
  // what makes toggling keep your place instead of jumping back to today.
  const { from, until } = isGrid
    ? monthGridRange(anchor)
    : { from: weekStart(anchor), until: addDays(weekStart(anchor), 6) };

  const { data, error: queryError } = await supabase
    .from("session_overview")
    .select("*")
    .gte("session_date", from)
    .lte("session_date", until)
    .order("session_date")
    .order("start_time");

  const sessions = (data ?? []) as Session[];

  // A member's own attendance for the range, so the page can tell "already
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

  const byDay = new Map<string, Session[]>();
  for (const session of sessions) {
    const list = byDay.get(session.session_date);
    if (list) list.push(session);
    else byDay.set(session.session_date, [session]);
  }

  const days = daysBetween(from, until);

  // The day whose lessons are listed under the grid. `g` when it is one of the
  // visible days, otherwise today if it is on screen — so opening the grid on
  // the current month already shows something useful.
  const openDay =
    search.g && days.includes(search.g)
      ? search.g
      : days.includes(today)
        ? today
        : null;
  const openSessions = openDay ? byDay.get(openDay) ?? [] : [];

  // Carried into every action and link so a check-in, or coming back from a
  // roll call, returns to the exact view you were looking at.
  const viewParams = new URLSearchParams();
  if (isGrid) viewParams.set("v", GRID);
  if (isGrid ? anchor !== today : weekStart(anchor) !== weekStart(today)) {
    viewParams.set("da", anchor);
  }
  const currentQuery = viewParams.toString();

  const href = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(currentQuery);
    for (const [key, value] of Object.entries(params)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    return query ? `/presenze?${query}` : "/presenze";
  };

  const anchorMonth = monthStart(anchor).slice(0, 7);
  const previous = isGrid ? shiftMonth(anchor, -1) : addDays(weekStart(anchor), -7);
  const next = isGrid ? shiftMonth(anchor, 1) : addDays(weekStart(anchor), 7);

  return (
    <div className="flex w-full flex-col gap-4 sm:gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Presenze</h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          {isStaff
            ? "Le lezioni in calendario. Apri una lezione per fare l'appello."
            : "Le lezioni in calendario. Fai il check-in quando sei in palestra: ogni presenza vale un'ora."}
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

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-base font-semibold sm:text-lg">
            {isGrid
              ? formatMonthHeading(anchor)
              : `Settimana del ${formatDate(weekStart(anchor))}`}
          </h2>
          <ViewToggle isGrid={isGrid} listHref={href({ v: null, g: null })} gridHref={href({ v: GRID })} />
        </div>

        <nav className="flex items-center justify-between gap-2">
          <Link
            href={href({ da: previous, g: null })}
            className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-light/60"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            {isGrid ? "Mese prima" : "Prima"}
          </Link>

          <Link
            href={isGrid ? `/presenze?v=${GRID}` : "/presenze"}
            className="rounded-full px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-neutral-light/60"
          >
            Oggi
          </Link>

          <Link
            href={href({ da: next, g: null })}
            className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-light/60"
          >
            {isGrid ? "Mese dopo" : "Dopo"}
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </nav>
      </div>

      {isGrid ? (
        <>
          {/* min-w on the scroller, not on the page: seven columns cannot get
              narrower than this and stay readable, so the grid scrolls inside
              its own box rather than making the whole page scroll sideways. */}
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="min-w-[34rem]">
              <div className="grid grid-cols-7 gap-1 pb-1">
                {WEEKDAY_LABELS.map((day) => (
                  <span
                    key={day.value}
                    className="px-1 text-center text-xs font-medium uppercase tracking-wide text-foreground/50"
                  >
                    {day.short}
                  </span>
                ))}
              </div>

              <div className="flex flex-col gap-1">
                {chunk(days, 7).map((week) => (
                  <div key={week[0]} className="grid grid-cols-7 gap-1">
                    {week.map((date) => (
                      <DayCell
                        key={date}
                        date={date}
                        sessions={byDay.get(date) ?? []}
                        inMonth={date.slice(0, 7) === anchorMonth}
                        isToday={date === today}
                        isOpen={date === openDay}
                        dayHref={`${href({ g: date })}#giorno`}
                        query={currentQuery}
                        ownAttendance={ownAttendance}
                        isStaff={isStaff}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {openDay ? (
            // The anchor is what makes opening a multi-lesson day feel like
            // something happened: the panel is usually below the fold on a
            // phone, and the links into it carry "#giorno".
            <section id="giorno" className="flex scroll-mt-20 flex-col gap-2">
              <h3 className="font-heading text-sm font-semibold text-foreground/70">
                {formatDayHeading(openDay)}
                {openDay === today ? " · oggi" : ""}
              </h3>

              {openSessions.length === 0 ? (
                <p className="rounded-xl border border-border px-3 py-3 text-sm text-foreground/60 sm:p-4">
                  Nessuna lezione in questo giorno.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                  {openSessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isStaff={isStaff}
                      // The grid is for seeing the picture; the check-in
                      // button lives in the list view, where a row has the
                      // width for it.
                      allowCheckin={false}
                      checkedIn={ownAttendance.get(session.id)}
                      now={now}
                      profileMissing={profileMissing}
                      query={currentQuery}
                    />
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </>
      ) : sessions.length === 0 ? (
        <p className="rounded-xl border border-border px-3 py-3 text-sm text-foreground/60 sm:p-4">
          Nessuna lezione in questa settimana.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {days
            .filter((date) => (byDay.get(date) ?? []).length > 0)
            .map((date) => (
              <section key={date} className="flex flex-col gap-2">
                <h2
                  className={`font-heading text-sm font-semibold ${
                    date === today ? "text-accent" : "text-foreground/70"
                  }`}
                >
                  {formatDayHeading(date)}
                  {date === today ? " · oggi" : ""}
                </h2>

                <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                  {(byDay.get(date) ?? []).map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isStaff={isStaff}
                      allowCheckin
                      checkedIn={ownAttendance.get(session.id)}
                      now={now}
                      profileMissing={profileMissing}
                      query={currentQuery}
                    />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}

// A segmented control built from two links, so switching view is a navigation
// and survives a reload like everything else on this page.
function ViewToggle({
  isGrid,
  listHref,
  gridHref,
}: {
  isGrid: boolean;
  listHref: string;
  gridHref: string;
}) {
  const base = "rounded-full px-3 py-1.5 text-xs font-medium transition-colors";
  const on = "bg-foreground text-background";
  const off = "text-foreground/60 hover:bg-neutral-light/60";

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-border p-1">
      <Link
        href={listHref}
        aria-current={isGrid ? undefined : "page"}
        className={`${base} ${isGrid ? off : on}`}
      >
        Lista
      </Link>
      <Link
        href={gridHref}
        aria-current={isGrid ? "page" : undefined}
        className={`${base} ${isGrid ? on : off}`}
      >
        Griglia
      </Link>
    </div>
  );
}

// One cell of the month grid.
//
// Where the cell leads depends on what is actually behind it. For staff, a day
// holding a single lesson opens that lesson's roll call directly — going
// through a day panel to click the only thing in it is a step that does
// nothing. A day with several lessons, and any day for a member, opens the
// panel instead, because there is a choice to make.
//
// The whole cell is the link rather than the entries inside it: the entries
// are a few pixels tall on a phone, and an anchor inside an anchor is not
// valid HTML anyway. A day with no lesson is not a link at all.
function DayCell({
  date,
  sessions,
  inMonth,
  isToday,
  isOpen,
  dayHref,
  query,
  ownAttendance,
  isStaff,
}: {
  date: string;
  sessions: Session[];
  inMonth: boolean;
  isToday: boolean;
  isOpen: boolean;
  dayHref: string;
  query: string;
  ownAttendance: Map<string, boolean>;
  isStaff: boolean;
}) {
  const single = isStaff && sessions.length === 1 ? sessions[0] : null;
  const href = single
    ? `/presenze/${single.id}?from=${encodeURIComponent(query)}`
    : dayHref;
  const shell = [
    "flex min-h-16 flex-col gap-1 rounded-lg border p-1 text-left sm:min-h-24 sm:p-1.5",
    isOpen ? "border-accent bg-accent/5" : "border-border",
    inMonth ? "" : "opacity-45",
  ].join(" ");

  const number = [
    "text-xs font-semibold",
    isToday
      ? "flex h-5 w-5 items-center justify-center rounded-full bg-accent text-background"
      : "px-0.5 text-foreground/70",
  ].join(" ");

  const body = (
    <>
      <span className={number}>{formatDayNumber(date)}</span>

      {/* Two renderings of the same lessons: the phone has no room for the
          course names, the desktop does. */}
      <span className="flex flex-wrap gap-1 sm:hidden">
        {sessions.slice(0, 4).map((session) => (
          <span
            key={session.id}
            className={`h-1.5 w-1.5 rounded-full ${
              session.status === "cancelled"
                ? "bg-foreground/25"
                : !isStaff && ownAttendance.get(session.id)
                  ? "bg-accent"
                  : "bg-foreground/45"
            }`}
          />
        ))}
      </span>

      <span className="hidden flex-col gap-0.5 sm:flex">
        {sessions.slice(0, 2).map((session) => (
          <span
            key={session.id}
            className={`truncate text-[0.7rem] leading-tight ${
              session.status === "cancelled"
                ? "text-foreground/40 line-through"
                : "text-foreground/75"
            }`}
          >
            {!isStaff && ownAttendance.get(session.id) ? "✓ " : ""}
            {formatTime(session.start_time)} {session.course_name}
          </span>
        ))}
        {sessions.length > 2 ? (
          <span className="text-[0.7rem] leading-tight text-foreground/50">
            +{sessions.length - 2}
          </span>
        ) : null}
      </span>
    </>
  );

  if (sessions.length === 0) {
    return <div className={shell}>{body}</div>;
  }

  return (
    <Link
      href={href}
      title={
        single
          ? `Appello: ${single.course_name}`
          : `${sessions.length} lezioni — apri il giorno`
      }
      className={`${shell} transition-colors hover:border-accent`}
    >
      {body}
    </Link>
  );
}

function SessionRow({
  session,
  isStaff,
  allowCheckin,
  checkedIn,
  now,
  profileMissing,
  query,
}: {
  session: Session;
  isStaff: boolean;
  allowCheckin: boolean;
  checkedIn: boolean | undefined;
  now: Date;
  profileMissing: boolean;
  query: string;
}) {
  const cancelled = session.status === "cancelled";
  const state = checkinState({
    opensAt: session.checkin_opens_at,
    closesAt: session.checkin_closes_at,
    status: session.status,
    now,
  });

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:p-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          className={`text-sm font-medium ${
            cancelled ? "line-through text-foreground/50" : ""
          }`}
        >
          {formatTime(session.start_time)} · {session.course_name}
        </span>
        <span className="text-xs text-foreground/55">
          {formatTime(session.start_time)}–{formatTime(session.end_time)}
          {" · "}
          {session.instructor_name ?? "nessun istruttore"}
          {cancelled ? " · lezione annullata" : ""}
        </span>
      </div>

      {isStaff ? (
        <Link
          href={`/presenze/${session.id}?from=${encodeURIComponent(query)}`}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-neutral-light/60"
        >
          {session.present_count > 0 ? `${session.present_count} presenti` : "Appello"}
          <ChevronRightIcon className="h-4 w-4" />
        </Link>
      ) : allowCheckin ? (
        <CheckinControl
          sessionId={session.id}
          state={state}
          checkedIn={checkedIn}
          disabled={profileMissing}
          query={query}
        />
      ) : (
        <CheckinBadge state={state} checkedIn={checkedIn} />
      )}
    </li>
  );
}

// The read-only half of CheckinControl, for the grid: it says where you stand
// without offering the button.
function CheckinBadge({
  state,
  checkedIn,
}: {
  state: ReturnType<typeof checkinState>;
  checkedIn: boolean | undefined;
}) {
  if (checkedIn === true) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent">
        <CheckCircleIcon className="h-4 w-4" />
        Presente
      </span>
    );
  }

  const muted = "shrink-0 text-xs text-foreground/50";
  if (checkedIn === false) return <span className={muted}>assente</span>;
  if (state === "cancelled") return <span className={muted}>annullata</span>;
  if (state === "open") return <span className={muted}>check-in aperto</span>;
  return null;
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
