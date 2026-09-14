import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

import { Belt } from "@/components/belt";
import {
  AlertCircleIcon,
  CalendarCheckIcon,
  ChevronRightIcon,
  TrendingUpIcon,
  UsersIcon,
} from "@/components/icons";
import { daysSince } from "@/utils/dates";
import { hoursFor } from "@/utils/hours";
import { PORTAL_ONLY_ROLES } from "@/utils/members";
import { BELT_ORDER, beltLabel } from "@/utils/supabase/profile";
import type { Dictionary } from "@/utils/i18n/dictionaries/it";
import { addDays, formatTime, monthStart, shiftMonth } from "@/utils/schedule";
import { Section, Stat } from "./stat";

const NEW_MEMBER_DAYS = 30;

type Member = {
  id: string;
  full_name: string;
  auth_user_id: string | null;
  joined_at: string;
  current_belt: string;
  current_stripes: number;
  rank_since: string;
  active_roles: string[];
  is_active: boolean;
  total_hours: number;
};

type Session = {
  id: string;
  course_name: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
  instructor_name: string | null;
  present_count: number;
};

export async function StaffDashboard({
  supabase,
  today,
  t,
}: {
  supabase: SupabaseClient;
  today: string;
  t: Dictionary;
}) {
  const from = monthStart(today);
  const until = addDays(shiftMonth(from, 1), -1);

  const [{ data: memberRows }, { data: sessionRows }, { count: activeCourses }] =
    await Promise.all([
      supabase
        .from("member_overview")
        .select(
          "id, full_name, auth_user_id, joined_at, current_belt, current_stripes, rank_since, active_roles, is_active, total_hours",
        )
        // Whoever only runs the portal is not a student of the gym and would
        // skew every count on this page.
        .not("active_roles", "eq", PORTAL_ONLY_ROLES),
      supabase
        .from("session_overview")
        .select(
          "id, course_name, session_date, start_time, end_time, status, instructor_name, present_count",
        )
        .gte("session_date", from)
        .lte("session_date", until)
        .order("session_date")
        .order("start_time"),
      supabase
        .from("course")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
    ]);

  const members = (memberRows ?? []) as Member[];
  const sessions = (sessionRows ?? []) as Session[];

  const active = members.filter((m) => m.is_active);
  const withoutAccount = members.filter((m) => !m.auth_user_id);
  const recent = members.filter((m) => (daysSince(m.joined_at) ?? 999) <= NEW_MEMBER_DAYS);

  // "Held" means the day has passed and the lesson was not called off — the
  // only sessions whose attendance says anything about turnout.
  const held = sessions.filter(
    (s) => s.status !== "cancelled" && s.session_date <= today,
  );
  const cancelled = sessions.filter((s) => s.status === "cancelled");
  const attendances = held.reduce((sum, s) => sum + (s.present_count ?? 0), 0);
  const averageTurnout = held.length > 0 ? attendances / held.length : 0;

  const todaySessions = sessions.filter((s) => s.session_date === today);

  // Drawn with no stripes: the row stands for the belt, not for any one
  // member's degree at it.
  const beltCounts = BELT_ORDER.map((belt) => ({
    belt,
    members: active.filter((m) => m.current_belt === belt),
  }));
  const mostBelts = Math.max(1, ...beltCounts.map((b) => b.members.length));
  const unknownBelts = active.filter(
    (m) => !BELT_ORDER.includes(m.current_belt as (typeof BELT_ORDER)[number]),
  );

  // Total hours across the gym, opening balances included, so the figure is
  // not "zero" for a school that has trained for years.
  const gymHours = members.reduce(
    (sum, m) => sum + hoursFor(m.joined_at, m.total_hours).total,
    0,
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <Stat
            label={t.dashboard.activeMembers}
            value={active.length}
            hint={t.dashboard.ofTotal(members.length)}
          />
          <Stat
            label={t.dashboard.newMembers(NEW_MEMBER_DAYS)}
            value={recent.length}
            hint={t.dashboard.recentlyJoined}
          />
          <Stat
            label={t.dashboard.withoutAccount}
            value={withoutAccount.length}
            hint={t.dashboard.neverInvited}
          />
          <Stat
            label={t.dashboard.gymHours}
            value={Math.round(gymHours)}
            hint={t.dashboard.openingBalancesIncluded}
          />
        </div>
      </Section>

      <Section
        title={t.dashboard.monthLessons}
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
            label={t.dashboard.scheduled}
            value={sessions.length}
            hint={t.dashboard.activeCourses(activeCourses ?? 0)}
          />
          <Stat
            label={t.dashboard.held}
            value={held.length}
            hint={t.dashboard.cancelledCount(cancelled.length)}
          />
          <Stat
            label={t.dashboard.attendances}
            value={attendances}
            hint={t.dashboard.recordedThisMonth}
          />
          <Stat
            label={t.dashboard.averagePerLesson}
            value={averageTurnout.toFixed(1)}
            hint={t.dashboard.studentsPresent}
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
            <li key={belt} className="flex items-center gap-3 px-3 py-3 sm:px-4">
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
