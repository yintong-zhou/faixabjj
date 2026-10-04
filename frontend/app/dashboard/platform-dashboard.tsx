import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AlertCircleIcon,
  BuildingIcon,
  CalendarCheckIcon,
  ChevronRightIcon,
} from "@/components/icons";
import { niceMax } from "@/utils/attendance-series";
import { formatDate } from "@/utils/dates";
import { logDbError } from "@/utils/log";
import type { Dictionary } from "@/utils/i18n/dictionaries/it";
import { AttendanceChart, type ChartDay } from "./attendance-chart";
import { Section, Stat } from "./stat";

// The window of the per-gym figures and the length of the weekly series. Fixed:
// the dashboard answers "is every gym using it, and how much", and a period
// picker would be a control for a question nobody has asked yet.
const DAYS = 30;
const WEEKS = 12;

// PostgREST returns bigint as a string, hence the `number | string`.
type Overview = {
  id: string;
  name: string;
  status: "active" | "suspended";
  active_people: number | string;
};

type Activity = {
  gym_id: string;
  lessons_held: number | string;
  presences: number | string;
  self_checkins: number | string;
  last_lesson: string | null;
  pending_requests: number | string;
};

type Week = { week_start: string; presences: number | string };

const percent = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 100);

/**
 * The platform superadmin's dashboard. Counts only: every figure comes from a
 * definer function that aggregates inside the database (20261004010000), so
 * not one member's row, name or presence ever reaches this page — the platform
 * is the gyms' data processor, not a reader of their records.
 */
export async function PlatformDashboard({
  supabase,
  t,
}: {
  supabase: SupabaseClient;
  t: Dictionary;
}) {
  const [overview, activity, weekly] = await Promise.all([
    supabase.rpc("gym_overview"),
    supabase.rpc("platform_gym_activity", { p_days: DAYS }),
    supabase.rpc("platform_weekly_presences", { p_weeks: WEEKS }),
  ]);

  // A dashboard of zeros reads as "nobody trained", which is a claim; a failed
  // load says so instead.
  if (overview.error || activity.error || weekly.error) {
    if (overview.error) logDbError("dashboard", "platform:gym_overview", overview.error);
    if (activity.error) logDbError("dashboard", "platform:gym_activity", activity.error);
    if (weekly.error) logDbError("dashboard", "platform:weekly_presences", weekly.error);
    return (
      <p className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
        <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
        {t.platformDashboard.loadFailed}
      </p>
    );
  }

  const activityById = new Map(
    ((activity.data ?? []) as Activity[]).map((row) => [row.gym_id, row]),
  );

  const gyms = ((overview.data ?? []) as Overview[])
    .map((gym) => {
      const row = activityById.get(gym.id);
      return {
        id: gym.id,
        name: gym.name,
        status: gym.status,
        people: Number(gym.active_people),
        presences: Number(row?.presences ?? 0),
        selfCheckins: Number(row?.self_checkins ?? 0),
        lessons: Number(row?.lessons_held ?? 0),
        lastLesson: row?.last_lesson ?? null,
        pending: Number(row?.pending_requests ?? 0),
      };
    })
    // Active gyms first, the busiest on top: the ones that need a look — idle
    // or suspended — collect at the bottom.
    .sort(
      (a, b) =>
        Number(b.status === "active") - Number(a.status === "active") ||
        b.presences - a.presences ||
        a.name.localeCompare(b.name),
    );

  const active = gyms.filter((g) => g.status === "active");
  const presences = gyms.reduce((sum, g) => sum + g.presences, 0);
  const selfCheckins = gyms.reduce((sum, g) => sum + g.selfCheckins, 0);

  // One bar per week. The chart was built for days; a week is the same shape —
  // a date, a total — with its own heading and tick.
  const weeks = ((weekly.data ?? []) as Week[]).map((w) => ({
    date: w.week_start,
    total: Number(w.presences),
  }));
  const chartDays: ChartDay[] = weeks.map((week, index) => ({
    date: week.date,
    total: week.total,
    isFuture: false,
    // Twelve narrow columns: every other one is labelled, the current week
    // always, as dd/mm of its Monday.
    tick:
      (weeks.length - 1 - index) % 2 === 0 ? formatDate(week.date).slice(0, 5) : null,
    heading: t.presenze.weekOf(formatDate(week.date)),
    value: t.dashboard.presentCount(week.total),
  }));
  const currentWeek = weeks.at(-1)?.date ?? "";

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Stat
          label={t.platformDashboard.gymsActive}
          value={active.length}
          hint={t.platformDashboard.suspendedCount(gyms.length - active.length)}
        />
        <Stat
          label={t.platformDashboard.activePeople}
          value={active.reduce((sum, g) => sum + g.people, 0)}
          hint={t.platformDashboard.inActiveGyms}
        />
        <Stat
          label={t.platformDashboard.presences}
          value={presences}
          hint={t.platformDashboard.checkinShare(percent(selfCheckins, presences))}
        />
        <Stat
          label={t.platformDashboard.lessons}
          value={gyms.reduce((sum, g) => sum + g.lessons, 0)}
          hint={t.platformDashboard.lessonsHint}
        />
      </div>

      <Section title={t.platformDashboard.weeklyTitle} icon={CalendarCheckIcon}>
        <AttendanceChart
          days={chartDays}
          max={niceMax(Math.max(0, ...weeks.map((w) => w.total)))}
          today={currentWeek}
          labels={{
            summary: t.platformDashboard.weeklySummary(WEEKS),
            hint: t.platformDashboard.weeklyHint,
          }}
        />
      </Section>

      <Section
        title={t.platformDashboard.byGymTitle}
        icon={BuildingIcon}
        action={
          <Link
            href="/gyms"
            className="flex items-center gap-1 text-sm font-medium text-accent hover:opacity-80"
          >
            {t.nav.gyms}
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        }
      >
        <p className="text-sm text-foreground/60">{t.platformDashboard.byGymLead}</p>

        {gyms.length === 0 ? (
          <p className="text-sm text-foreground/60">{t.platformDashboard.empty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {gyms.map((gym) => (
              <li key={gym.id} className="flex flex-col gap-2.5 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/gyms/${gym.id}`} className="font-medium hover:text-accent">
                    {gym.name}
                  </Link>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      gym.status === "active"
                        ? "bg-success/10 text-success"
                        : "bg-muted text-foreground/60"
                    }`}
                  >
                    {t.gyms.status[gym.status]}
                  </span>
                  {gym.status === "active" && gym.lessons === 0 ? (
                    <span className="flex items-center gap-1 text-xs text-foreground/60">
                      <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" />
                      {t.platformDashboard.idle}
                    </span>
                  ) : null}
                </div>

                <dl className="grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-6">
                  <Figure label={t.platformDashboard.colPeople} value={gym.people} />
                  <Figure label={t.platformDashboard.colPresences} value={gym.presences} />
                  <Figure label={t.platformDashboard.colLessons} value={gym.lessons} />
                  <Figure
                    label={t.platformDashboard.colCheckins}
                    value={gym.presences === 0 ? "—" : `${percent(gym.selfCheckins, gym.presences)}%`}
                  />
                  <Figure
                    label={t.platformDashboard.colLastLesson}
                    value={gym.lastLesson ? formatDate(gym.lastLesson) : t.platformDashboard.never}
                  />
                  <Figure label={t.platformDashboard.colPending} value={gym.pending} />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="truncate text-xs text-foreground/55">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}
