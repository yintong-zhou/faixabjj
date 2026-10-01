import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

import { Belt } from "@/components/belt";
import {
  AlertCircleIcon,
  CalendarCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TrendingUpIcon,
  UsersIcon,
} from "@/components/icons";
import {
  attendanceSeries,
  niceMax,
  periodRange,
  shiftPeriod,
  type Period,
  type SeriesSession,
} from "@/utils/attendance-series";
import { formatDate } from "@/utils/dates";
import { logDbError } from "@/utils/log";
import { PORTAL_ONLY_ROLES } from "@/utils/members";
import { promotionStatus, type Criterion } from "@/utils/promotion";
import { ADULT_BELTS, BELT_ORDER, beltLabel } from "@/utils/supabase/profile";
import type { GymSettings } from "@/utils/supabase/gym";
import type { Dictionary } from "@/utils/i18n/dictionaries/it";
import type { Locale } from "@/utils/i18n/locales";
import {
  formatDayHeading,
  formatDayNumber,
  formatMonthHeading,
  formatTime,
  weekdayLabels,
} from "@/utils/schedule";
import { AttendanceChart, type ChartDay } from "./attendance-chart";
import { Section, Stat } from "./stat";

type Member = {
  id: string;
  full_name: string;
  auth_user_id: string | null;
  joined_at: string;
  current_belt: string;
  current_stripes: number;
  rank_since: string;
  stripe_since: string | null;
  birth_date: string | null;
  active_roles: string[];
  is_active: boolean;
};

type RankHours = {
  person_id: string;
  lessons_since_rank: number;
  lessons_since_stripe: number;
};

type TodaySession = {
  id: string;
  course_name: string;
  start_time: string;
  status: string;
  instructor_name: string | null;
  present_count: number;
};

export async function StaffDashboard({
  supabase,
  today,
  gym,
  t,
  locale,
  period,
  anchor,
}: {
  supabase: SupabaseClient;
  today: string;
  gym: GymSettings;
  t: Dictionary;
  locale: Locale;
  // What the attendance chart shows: a calendar week or month, and any day
  // inside it. Both come from the URL (`periodo`, `da`), like every other bit
  // of view state here.
  period: Period;
  anchor: string;
}) {
  const range = periodRange(period, anchor);

  const [
    { data: memberRows, error: memberError },
    { data: chartRows, error: chartError },
    { data: todayRows, error: todayError },
    { data: rankRows, error: rankError },
    { data: criteriaRows, error: criteriaError },
  ] = await Promise.all([
      supabase
        .from("member_overview")
        .select(
          "id, full_name, auth_user_id, joined_at, current_belt, current_stripes, rank_since, stripe_since, birth_date, active_roles, is_active",
        )
        // Whoever only runs the portal is not a student of the gym and would
        // skew every count on this page.
        .not("active_roles", "eq", PORTAL_ONLY_ROLES),
      // Only what the chart needs, and only for the period it shows.
      supabase
        .from("session_overview")
        .select("session_date, status, present_count")
        .gte("session_date", range.from)
        .lte("session_date", range.until),
      supabase
        .from("session_overview")
        .select("id, course_name, start_time, status, instructor_name, present_count")
        .eq("session_date", today)
        .order("start_time"),
      supabase
        .from("person_rank_hours")
        .select("person_id, lessons_since_rank, lessons_since_stripe"),
      supabase
        .from("promotion_criteria")
        .select("belt, stripe, min_hours, min_time_at_rank_days, min_age_years"),
    ]);

  // A failed query and an empty gym render identically here — every card just
  // says 0 — so a broken view or a missing grant used to look like a school
  // with no students. The page still degrades to zeros rather than erroring,
  // because a dashboard is not worth a 500, but the reason is now in the log.
  for (const [where, error] of [
    ["member_overview", memberError],
    ["session_overview:chart", chartError],
    ["session_overview:today", todayError],
    ["person_rank_hours", rankError],
    ["promotion_criteria", criteriaError],
  ] as const) {
    if (error) logDbError("dashboard", where, error);
  }

  const members = (memberRows ?? []) as Member[];
  const todaySessions = (todayRows ?? []) as TodaySession[];

  const active = members.filter((m) => m.is_active);
  const withoutAccount = members.filter((m) => !m.auth_user_id);

  // Same computation the Registro's summary line runs, over the same rows
  // (active members only) — this count and the one on the Registro must
  // always agree, because the card links straight at it.
  const criteria = ((criteriaRows ?? []) as Criterion[]).map((row) => ({
    ...row,
    min_hours: Number(row.min_hours),
    min_time_at_rank_days: Number(row.min_time_at_rank_days),
  }));
  const rankById = new Map(
    ((rankRows ?? []) as RankHours[]).map((row) => [row.person_id, row]),
  );
  const eligibleCount = active.filter((m) => {
    const counted = rankById.get(m.id);
    const status = promotionStatus(
      {
        current_belt: m.current_belt,
        current_stripes: m.current_stripes,
        rank_since: m.rank_since,
        stripe_since: m.stripe_since ?? m.rank_since,
        joined_at: m.joined_at,
        birth_date: m.birth_date,
        lessons_since_rank: Number(counted?.lessons_since_rank ?? 0),
        lessons_since_stripe: Number(counted?.lessons_since_stripe ?? 0),
      },
      criteria,
      { ...gym, today },
    );
    return status.eligible;
  }).length;

  // The chart: one bar per day of the period. The strings are composed here, in
  // the reader's language, so the client component holds no dictionary.
  const series = attendanceSeries((chartRows ?? []) as SeriesSession[], range, today);
  const weekdays = weekdayLabels(t);
  const chartDays: ChartDay[] = series.map((day, index) => {
    const dayOfMonth = Number(formatDayNumber(day.date));
    return {
      date: day.date,
      total: day.total,
      isFuture: day.isFuture,
      // A week labels every column with its weekday; a month has 31 narrow
      // ones, so only the 1st and the multiples of 5 are numbered.
      tick:
        period === "week"
          ? weekdays[index].short
          : dayOfMonth === 1 || dayOfMonth % 5 === 0
            ? String(dayOfMonth)
            : null,
      heading: formatDayHeading(day.date, t),
      value: day.isFuture
        ? t.dashboard.dayToCome
        : day.lessons === 0
          ? t.dashboard.noLessonThatDay
          : t.dashboard.presentCount(day.total),
    };
  });
  const axisMax = niceMax(Math.max(0, ...series.map((day) => day.total)));

  const periodHeading =
    period === "week"
      ? t.presenze.weekOf(formatDate(range.from))
      : formatMonthHeading(anchor, locale);

  // The anchor travels with the toggle, so switching week/month keeps your
  // place; it is left out when it is simply today.
  const href = (target: Period, da: string | null) => {
    const query = new URLSearchParams();
    if (target === "week") query.set("periodo", "settimana");
    if (da) query.set("da", da);
    const text = query.toString();
    return text ? `/dashboard?${text}` : "/dashboard";
  };
  const keepAnchor = anchor === today ? null : anchor;

  // Drawn with no stripes: the row stands for the belt, not for any one
  // member's degree at it.
  // The five adult belts are always drawn, so the chart keeps the same shape
  // from one week to the next and an empty rank reads as "nobody here" rather
  // than as a missing row. The twelve children's belts appear only once
  // somebody holds one: a gym with no children's course would otherwise open
  // its dashboard to twelve empty bars every day.
  const beltCounts = BELT_ORDER.map((belt) => ({
    belt,
    members: active.filter((m) => m.current_belt === belt),
  })).filter(
    (b) =>
      b.members.length > 0 ||
      (ADULT_BELTS as readonly string[]).includes(b.belt),
  );
  const mostBelts = Math.max(1, ...beltCounts.map((b) => b.members.length));
  const unknownBelts = active.filter(
    (m) => !BELT_ORDER.includes(m.current_belt as (typeof BELT_ORDER)[number]),
  );

  return (
    <>
      <Section
        title={t.dashboard.students}
        icon={UsersIcon}
        action={
          <Link
            href="/members"
            className="flex items-center gap-1 text-sm font-medium text-accent hover:opacity-80"
          >
            {t.nav.registro}
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Stat
            label={t.dashboard.activeMembers}
            value={active.length}
            hint={t.dashboard.ofTotal(members.length)}
          />
          <Stat
            label={t.dashboard.withoutAccount}
            value={withoutAccount.length}
            hint={t.dashboard.neverInvited}
          />
        </div>

        {/* The queue lives inside the Registro as a filter, so the card links
            to that filtered list rather than to a page of its own. */}
        <Link href="/members?idonei=1" className="block">
          <Stat
            label={t.promotions.queueTitle}
            value={t.promotions.eligibleCount(eligibleCount)}
          />
        </Link>
      </Section>

      <Section
        title={t.dashboard.attendanceTitle}
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
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-heading text-base font-semibold">{periodHeading}</h3>
            <PeriodToggle
              period={period}
              weekHref={href("week", keepAnchor)}
              monthHref={href("month", keepAnchor)}
              weekLabel={t.dashboard.periodWeek}
              monthLabel={t.dashboard.periodMonth}
            />
          </div>

          <nav className="flex items-center justify-between gap-2">
            <Link
              href={href(period, shiftPeriod(period, anchor, -1))}
              className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              {period === "week" ? t.presenze.previousWeek : t.presenze.previousMonth}
            </Link>

            <Link
              href={href(period, null)}
              className="rounded-full px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted"
            >
              {t.common.today}
            </Link>

            <Link
              href={href(period, shiftPeriod(period, anchor, 1))}
              className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              {period === "week" ? t.presenze.nextWeek : t.presenze.nextMonth}
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
          </nav>

          {/* Keyed by the period: moving to another week or month starts from
              a clean selection instead of carrying a stale day across. */}
          <AttendanceChart
            key={`${period}-${range.from}`}
            days={chartDays}
            max={axisMax}
            today={today}
            labels={{
              summary: t.dashboard.chartSummary(periodHeading),
              hint: t.dashboard.chartHint,
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-xs uppercase tracking-wide text-foreground/55">
            {t.dashboard.todayHeading}
          </h3>
          {todaySessions.length === 0 ? (
            <p className="rounded-xl border border-border px-3 py-3 text-sm text-foreground/60 sm:p-4">
              {t.dashboard.noLessonsToday}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {todaySessions.map((session) => (
                <li
                  key={session.id}
                  className="flex items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:p-4"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={`text-sm font-medium ${
                        session.status === "cancelled"
                          ? "line-through text-foreground/50"
                          : ""
                      }`}
                    >
                      {formatTime(session.start_time)} · {session.course_name}
                    </span>
                    <span className="text-xs text-foreground/55">
                      {session.instructor_name ?? t.dashboard.noInstructor}
                    </span>
                  </div>
                  <Link
                    href={`/attendance/${session.id}`}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    {session.present_count > 0
                      ? t.dashboard.presentCount(session.present_count)
                      : t.dashboard.rollCall}
                    <ChevronRightIcon className="h-4 w-4" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section title={t.dashboard.belts} icon={TrendingUpIcon}>
        <p className="text-sm text-foreground/60">
          {t.dashboard.beltSpread(active.length)}
        </p>

        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {beltCounts.map(({ belt, members: atBelt }) => (
            <li key={belt}>
              {/* The whole row is the link, not the number inside it: the count
                  is a few characters wide and the belt image is the part a
                  thumb aims at. `attivi=1` travels with the belt because this
                  chart counts active members only — without it the list would
                  answer with a different number than the row that opened it. */}
              <Link
                href={`/members?cintura=${belt}&attivi=1`}
                className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted sm:px-4"
              >
                <Belt belt={belt} stripes={0} className="shrink-0" />

                <span className="w-16 shrink-0 text-sm font-medium sm:w-20">
                  {beltLabel(belt, t)}
                </span>

                {/* A bar rather than a chart library: one number per row, and a
                    dependency would not earn its place here. */}
                <span
                  className="h-2 min-w-0.5 rounded-full bg-accent/70"
                  style={{ width: `${(atBelt.length / mostBelts) * 100}%` }}
                  aria-hidden="true"
                />

                <span className="ml-auto shrink-0 text-sm tabular-nums text-foreground/70">
                  {atBelt.length}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {unknownBelts.length > 0 ? (
          <p className="flex items-start gap-2 text-xs text-foreground/55">
            <AlertCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t.dashboard.unknownBelts(unknownBelts.length)}
          </p>
        ) : null}
      </Section>
    </>
  );
}

// Two links, not a client-side toggle: switching period is a navigation and
// survives a reload, like the calendar's list/grid control.
function PeriodToggle({
  period,
  weekHref,
  monthHref,
  weekLabel,
  monthLabel,
}: {
  period: Period;
  weekHref: string;
  monthHref: string;
  weekLabel: string;
  monthLabel: string;
}) {
  const base = "rounded-full px-3 py-1.5 text-xs font-medium transition-colors";
  const on = "bg-foreground text-background";
  const off = "text-foreground/60 hover:bg-muted";

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-border p-1">
      <Link
        href={weekHref}
        aria-current={period === "week" ? "page" : undefined}
        className={`${base} ${period === "week" ? on : off}`}
      >
        {weekLabel}
      </Link>
      <Link
        href={monthHref}
        aria-current={period === "month" ? "page" : undefined}
        className={`${base} ${period === "month" ? on : off}`}
      >
        {monthLabel}
      </Link>
    </div>
  );
}
