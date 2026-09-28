import type { Metadata } from "next";
import Link from "next/link";

import { AlertCircleIcon, CheckCircleIcon } from "@/components/icons";
import { todayIn } from "@/utils/dates";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { addDays, checkinState, formatTime } from "@/utils/schedule";
import { requireGymSettings } from "@/utils/supabase/gym";
import { getOrCreateProfile } from "@/utils/supabase/profile";
import { requireAdmin } from "@/utils/supabase/require-admin";

import { CheckinButton, type CheckinButtonLabels } from "../attendance/checkin-button";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.checkin.title };
}

type OpenSession = {
  id: string;
  course_name: string;
  start_time: string;
  end_time: string;
  status: string;
  checkin_opens_at: string;
  checkin_closes_at: string;
};

// The address printed on the gym's QR code, the same for every gym: the gym is
// the signed-in member's own. It lists the lessons open for check-in right now
// and, when there is exactly one, checks in without a tap. The rules are
// check_in()'s, exactly as for the button in /attendance.
export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const { t } = await getDictionary();
  const { supabase, userId, email, access } = await requireAdmin("/check-in");
  const gym = await requireGymSettings();
  const today = todayIn(gym.timezone);
  const now = new Date();

  // Yesterday too: a late lesson's window can run past midnight.
  const { data, error: queryError } = await supabase
    .from("session_overview")
    .select("id, course_name, start_time, end_time, status, checkin_opens_at, checkin_closes_at")
    .in("session_date", [addDays(today, -1), today])
    .eq("course_active", true)
    .order("session_date")
    .order("start_time");
  if (queryError) logDbError("check-in", "sessions", queryError);

  const open = ((data ?? []) as OpenSession[]).filter(
    (s) =>
      checkinState({
        opensAt: s.checkin_opens_at,
        closesAt: s.checkin_closes_at,
        status: s.status,
        now,
      }) === "open",
  );

  // Staff take attendance with the roll call, as in /attendance.
  const isStaff = access.canManageClasses;

  const recorded = new Map<string, boolean>();
  let profileMissing = false;
  if (!isStaff && open.length > 0) {
    const profile = await getOrCreateProfile(supabase, userId, email);
    if (!profile) {
      profileMissing = true;
    } else {
      const { data: rows } = await supabase
        .from("attendance")
        .select("session_id, present")
        .eq("person_id", profile.id)
        .in(
          "session_id",
          open.map((s) => s.id),
        );
      for (const row of (rows ?? []) as { session_id: string; present: boolean }[]) {
        recorded.set(row.session_id, row.present);
      }
    }
  }

  const labels: CheckinButtonLabels = {
    checkIn: t.presenze.checkIn,
    locating: t.checkin.locating,
    sending: t.checkin.sending,
    retry: t.checkin.retry,
    geo: t.checkin.geo,
  };
  const needsLocation = gym.latitude !== null;
  // Automatic only on a fresh scan: after an answer (ok or error) the page
  // shows it and waits for a tap, instead of trying again by itself.
  const auto =
    !ok &&
    !error &&
    !isStaff &&
    !profileMissing &&
    open.length === 1 &&
    !recorded.has(open[0].id);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 sm:gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.checkin.title}</h1>
        <p className="text-sm leading-relaxed text-foreground/65">{t.checkin.lead}</p>
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
          {t.presenze.loadFailed}
        </p>
      ) : null}
      {profileMissing ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {t.presenze.profileMissing}
        </p>
      ) : null}

      {isStaff ? (
        <p className="rounded-xl border border-border px-3 py-3 text-sm text-foreground/70 sm:p-4">
          {t.checkin.staffUseRollCall}
        </p>
      ) : open.length === 0 ? (
        <p className="rounded-xl border border-border px-3 py-3 text-sm text-foreground/60 sm:p-4">
          {t.checkin.noOpenSession}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {open.map((session) => {
            const state = recorded.get(session.id);
            return (
              <li
                key={session.id}
                className="flex items-center justify-between gap-3 px-3 py-3 sm:p-4"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{session.course_name}</span>
                  <span className="text-xs text-foreground/55">
                    {formatTime(session.start_time)}–{formatTime(session.end_time)}
                  </span>
                </div>
                {state === true ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent">
                    <CheckCircleIcon className="h-4 w-4" />
                    {t.presenze.present}
                  </span>
                ) : state === false ? (
                  <span className="shrink-0 text-xs text-foreground/50">{t.presenze.absent}</span>
                ) : (
                  <CheckinButton
                    sessionId={session.id}
                    query=""
                    returnTo="/check-in"
                    needsLocation={needsLocation}
                    auto={auto}
                    disabled={profileMissing}
                    labels={labels}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href="/attendance"
        className="self-start text-sm font-medium text-accent hover:opacity-80"
      >
        {t.checkin.toCalendar} →
      </Link>
    </div>
  );
}
