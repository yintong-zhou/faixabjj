import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

import { Belt } from "@/components/belt";
import {
  AlertCircleIcon,
  CalendarCheckIcon,
  ChevronRightIcon,
  TrendingUpIcon,
} from "@/components/icons";
import { daysSince, formatDate, formatDays } from "@/utils/dates";
import { LESSONS_PER_WEEK, formatHours, hoursFor } from "@/utils/hours";
import type { Profile } from "@/utils/supabase/profile";
import { addDays, formatDayHeading, formatTime } from "@/utils/schedule";
import { Section, Stat } from "./stat";

// How far back the "recent training" figures look. Bounded on purpose: a
// member who has trained for years would otherwise pull their whole history
// into a page that only wants to say "how have the last few weeks gone".
const WINDOW_DAYS = 90;
const RECENT_DAYS = 28;

type Session = {
  id: string;
  course_name: string;
  session_date: string;
  start_time: string;
  status: string;
};

export async function MemberDashboard({
  supabase,
  profile,
  today,
}: {
  supabase: SupabaseClient;
  profile: Profile;
  today: string;
}) {
  const since = addDays(today, -WINDOW_DAYS);

  const [{ data: hoursRow }, { data: pastRows }, { data: nextRows }] =
    await Promise.all([
      supabase
        .from("person_hours")
        .select("total_hours")
        .eq("person_id", profile.id)
        .maybeSingle(),
      supabase
        .from("session_overview")
        .select("id, course_name, session_date, start_time, status")
        .gte("session_date", since)
        .lte("session_date", today)
        .order("session_date", { ascending: false }),
      supabase
        .from("session_overview")
        .select("id, course_name, session_date, start_time, status")
        .gt("session_date", today)
        .neq("status", "cancelled")
        .order("session_date")
        .order("start_time")
        .limit(3),
    ]);

  const past = (pastRows ?? []) as Session[];
  const upcoming = (nextRows ?? []) as Session[];

  // RLS already limits attendance to this member's own rows, so no person
  // filter is needed here — but one is passed anyway, because relying on a
  // policy to scope a query makes the query wrong the day the policy changes.
  const { data: attendanceRows } = past.length
    ? await supabase
        .from("attendance")
        .select("session_id, present")
        .eq("person_id", profile.id)
        .in(
          "session_id",
          past.map((s) => s.id),
        )
    : { data: [] };

  const presentSessionIds = new Set(
    ((attendanceRows ?? []) as { session_id: string; present: boolean }[])
      .filter((row) => row.present)
      .map((row) => row.session_id),
  );

  const attended = past.filter((s) => presentSessionIds.has(s.id));
  const recentCount = attended.filter(
    (s) => s.session_date >= addDays(today, -RECENT_DAYS),
  ).length;
  const lastAttended = attended[0] ?? null;

  const hours = hoursFor(profile.joined_at, hoursRow?.total_hours);
  const perWeek = recentCount / (RECENT_DAYS / 7);

  return (
    <>
      <Section title="Il tuo grado" icon={TrendingUpIcon}>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
          <Belt
            belt={profile.current_belt}
            stripes={profile.current_stripes}
            size="lg"
          />
          <dl className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-foreground/55">
                Con questa cintura
              </dt>
              <dd className="text-sm font-medium">
                {formatDays(daysSince(profile.rank_since))}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-foreground/55">
                Dall&apos;ultima tacca
              </dt>
              <dd className="text-sm font-medium">
                {formatDays(daysSince(profile.stripe_since))}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-foreground/55">
                Iscritto dal
              </dt>
              <dd className="text-sm font-medium">{formatDate(profile.joined_at)}</dd>
            </div>
          </dl>
        </div>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-foreground/55">
          <AlertCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Cintura e tacche le assegna il tuo istruttore: qui vedi solo lo stato
          attuale, la promozione non è mai automatica.
        </p>
      </Section>

      <Section
        title="Il tuo allenamento"
        icon={CalendarCheckIcon}
        action={
          <Link
            href="/presenze"
            className="flex items-center gap-1 text-sm font-medium text-accent hover:opacity-80"
          >
            Presenze
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <Stat
            label="Ore totali"
            value={formatHours(hours.total).replace(" ore", "")}
            hint={hours.isPartlyEstimated ? "saldo iniziale incluso" : "ore registrate"}
          />
          <Stat
            label={`Ultimi ${RECENT_DAYS} gg`}
            value={recentCount}
            hint="lezioni fatte"
          />
          <Stat
            label="Media"
            value={perWeek.toFixed(1)}
            hint="lezioni a settimana"
          />
          <Stat
            label="Ultima volta"
            value={lastAttended ? formatDate(lastAttended.session_date) : "—"}
            hint={lastAttended ? lastAttended.course_name : `nessuna negli ultimi ${WINDOW_DAYS} gg`}
          />
        </div>

        {hours.isPartlyEstimated ? (
          <p className="text-xs leading-relaxed text-foreground/55">
            Il totale include un saldo di partenza, stimato a {LESSONS_PER_WEEK}{" "}
            lezioni a settimana per il periodo prima del tracciamento. Da lì in
            poi cresce solo con il tuo check-in o con l&apos;appello
            dell&apos;istruttore.
          </p>
        ) : null}
      </Section>

      <Section title="Prossime lezioni" icon={CalendarCheckIcon}>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-border px-3 py-3 text-sm text-foreground/60 sm:p-4">
            Nessuna lezione in calendario nei prossimi giorni.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {upcoming.map((session) => (
              <li key={session.id} className="flex flex-col gap-0.5 px-3 py-3 sm:p-4">
                <span className="text-sm font-medium">
                  {formatTime(session.start_time)} · {session.course_name}
                </span>
                <span className="text-xs text-foreground/55">
                  {formatDayHeading(session.session_date)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-foreground/55">
          Il check-in si fa da Presenze, quando sei in palestra e la finestra è
          aperta.
        </p>
      </Section>
    </>
  );
}
