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
import {
  LESSONS_PER_WEEK,
  clockHours,
  estimatedHours,
  formatHours,
  hoursFor,
} from "@/utils/hours";
import type { Profile } from "@/utils/supabase/profile";
import type { Dictionary } from "@/utils/i18n/dictionaries/it";
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
  t,
}: {
  supabase: SupabaseClient;
  profile: Profile;
  today: string;
  t: Dictionary;
}) {
  const since = addDays(today, -WINDOW_DAYS);

  const [{ data: hoursRow }, { data: pastRows }, { data: nextRows }, { data: rankRow }] =
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
      supabase
        .from("person_rank_hours")
        .select("lessons_since_rank")
        .eq("person_id", profile.id)
        .maybeSingle(),
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

  // Hours at the current belt, composed exactly as promotionStatus() composes
  // them: the counted lessons plus the estimated opening balance, anchored at
  // the later of the join date and the belt date — the estimate is not
  // attendance and must not be credited to a grade held before they joined.
  // Showing only the counted part here would put two different meanings under
  // one label, since the figure eligibility is judged on includes the estimate.
  // This page still says nothing about thresholds, distance or eligibility:
  // only the composition of this one number changes.
  const rankAnchor =
    profile.joined_at > profile.rank_since ? profile.joined_at : profile.rank_since;
  const hoursAtRank = clockHours(
    Number(rankRow?.lessons_since_rank ?? 0) + estimatedHours(rankAnchor, { today }),
  );

  return (
    <>
      <Section title={t.dashboard.yourRank} icon={TrendingUpIcon}>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
          <Belt
            belt={profile.current_belt}
            stripes={profile.current_stripes}
            size="lg"
          />
          <dl className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-foreground/55">
                {t.dashboard.atThisBelt}
              </dt>
              <dd className="text-sm font-medium">
                {formatDays(daysSince(profile.rank_since), t)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-foreground/55">
                {t.dashboard.sinceLastStripe}
              </dt>
              <dd className="text-sm font-medium">
                {formatDays(daysSince(profile.stripe_since), t)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-foreground/55">
                {t.promotions.atCurrentRank}
              </dt>
              <dd className="text-sm font-medium" title={t.promotions.hoursNote}>
                {formatHours(hoursAtRank, t)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-foreground/55">
                {t.account.joinedOn}
              </dt>
              <dd className="text-sm font-medium">{formatDate(profile.joined_at)}</dd>
            </div>
          </dl>
        </div>

        {/* Visible, not only a `title`: this app is used on a phone, where a
            tooltip never appears — the same reason the roll call replaced its
            tooltips with a legend. A unit explained nowhere visible is a unit
            the reader has to guess. */}
        <p className="text-xs leading-relaxed text-foreground/55">
          {t.promotions.hoursNote}
        </p>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-foreground/55">
          <AlertCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t.dashboard.promotionNote}
        </p>
      </Section>

      <Section
        title={t.dashboard.yourTraining}
        icon={CalendarCheckIcon}
        action={
          <Link
            href="/attendance"
            className="flex items-center gap-1 text-sm font-medium text-accent hover:opacity-80"
          >
            {t.nav.presenze}
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <Stat
            label={t.dashboard.totalHours}
            value={hours.total.toFixed(1)}
            hint={
              hours.isPartlyEstimated
                ? t.dashboard.openingBalanceIncluded
                : t.dashboard.recordedHours
            }
          />
          <Stat
            label={t.dashboard.lastDays(RECENT_DAYS)}
            value={recentCount}
            hint={t.dashboard.lessonsDone}
          />
          <Stat
            label={t.dashboard.average}
            value={perWeek.toFixed(1)}
            hint={t.dashboard.lessonsPerWeek}
          />
          <Stat
            label={t.dashboard.lastTime}
            value={lastAttended ? formatDate(lastAttended.session_date) : t.common.dash}
            hint={
              lastAttended
                ? lastAttended.course_name
                : t.dashboard.noneInWindow(WINDOW_DAYS)
            }
          />
        </div>

        {hours.isPartlyEstimated ? (
          <p className="text-xs leading-relaxed text-foreground/55">
            {t.dashboard.memberEstimateNote(LESSONS_PER_WEEK)}
          </p>
        ) : null}
      </Section>

      <Section title={t.dashboard.nextLessons} icon={CalendarCheckIcon}>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-border px-3 py-3 text-sm text-foreground/60 sm:p-4">
            {t.dashboard.noUpcoming}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {upcoming.map((session) => (
              <li key={session.id} className="flex flex-col gap-0.5 px-3 py-3 sm:p-4">
                <span className="text-sm font-medium">
                  {formatTime(session.start_time)} · {session.course_name}
                </span>
                <span className="text-xs text-foreground/55">
                  {formatDayHeading(session.session_date, t)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-foreground/55">
          {t.dashboard.checkinHint}
        </p>
      </Section>
    </>
  );
}
