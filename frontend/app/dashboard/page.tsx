import type { Metadata } from "next";
import Link from "next/link";

import { AlertCircleIcon, QrCodeIcon } from "@/components/icons";
import { parsePeriod } from "@/utils/attendance-series";
import { isPortalOnly } from "@/utils/members";
import { activeRoles, getOrCreateProfile } from "@/utils/supabase/profile";
import { requireAdmin } from "@/utils/supabase/require-admin";
import { requireGymSettings } from "@/utils/supabase/gym";
import { todayIn } from "@/utils/dates";
import { getDictionary } from "@/utils/i18n/server";
import { MemberDashboard } from "./member-dashboard";
import { PlatformDashboard } from "./platform-dashboard";
import { StaffDashboard } from "./staff-dashboard";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.dashboard.title };
}

// Which of the two dashboards to draw, in the URL like every other bit of view
// state in this app — the same `v` the calendar uses for its grid. A link to
// somebody's own figures is then just a URL, and a reload keeps the view.
const MINE = "mia";

// `periodo` and `da` belong to the staff view's attendance chart: week or month,
// and a day inside the one to show. Read like the calendar's `da`.
type Search = { v?: string; periodo?: string; da?: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { v, periodo, da } = await searchParams;
  const { supabase, userId, email, access } = await requireAdmin("/dashboard");
  const { locale, t } = await getDictionary();

  // The superadmin has no gym, so none of the views below applies: theirs is
  // the platform's, in counts only.
  if (access.isPlatformAdmin) {
    return (
      <div className="flex w-full flex-col gap-6 sm:gap-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.dashboard.title}</h1>
          <p className="text-sm leading-relaxed text-foreground/65">{t.platformDashboard.lead}</p>
        </header>
        <PlatformDashboard supabase={supabase} t={t} />
      </div>
    );
  }

  const gym = await requireGymSettings();

  // The same predicate that opens Corsi and the roll call: instructors,
  // maestri and admin. Everybody else sees their own figures and nothing
  // about anybody else — which is not a matter of hiding cards, but of the
  // queries never being run. RLS would refuse them anyway: an allievo cannot
  // read member_overview or another member's attendance.
  const isStaff = access.canManageClasses;

  // Staff train too. A maestro or an instructor holds a belt, collects hours
  // and turns up to lessons like everybody else, and until now the gym-wide
  // view was the only thing this route would draw for them — their own figures
  // were visible nowhere. They can switch; the gym stays the default, because
  // it is what they open the dashboard for.
  //
  // A member sees no control: there is nothing to switch to, and offering the
  // choice would hint at a view they cannot open.
  // A portal-only admin is the exception to that: they run the portal and do
  // not train, so they hold no belt and collect no hours. There is nothing for
  // a personal view to draw, so the control is not offered and `v=mia` is
  // ignored — a white belt from the column default and a row of zeroes is not
  // "their own figures", it is a rank nobody gave them.
  const profile = await getOrCreateProfile(supabase, userId, email);
  const portalOnly =
    isStaff && profile ? isPortalOnly(await activeRoles(supabase, profile.id)) : false;

  const showingMine = !portalOnly && (!isStaff || v === MINE);
  const today = todayIn(gym.timezone);

  return (
    <div className="flex w-full flex-col gap-6 sm:gap-10">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t.dashboard.title}
          </h1>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* The QR lives in /gym, which only those who manage users can open
                (404 for the rest), so the shortcut is offered to the same
                people. It is gym data: the personal view does not show it. */}
            {!showingMine && access.canManageUsers ? (
              <Link
                href="/gym#qr"
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                <QrCodeIcon className="h-4 w-4" />
                {t.dashboard.checkinQr}
              </Link>
            ) : null}
            {isStaff && !portalOnly ? (
              <ViewToggle
                showingMine={showingMine}
                gymHref="/dashboard"
                mineHref={`/dashboard?v=${MINE}`}
                gymLabel={t.dashboard.viewGym}
                mineLabel={t.dashboard.viewMine}
              />
            ) : null}
          </div>
        </div>
        <p className="text-sm leading-relaxed text-foreground/65">
          {showingMine ? t.dashboard.memberLead : t.dashboard.staffLead}
        </p>
      </header>

      {!showingMine ? (
        <StaffDashboard
          supabase={supabase}
          today={today}
          gym={gym}
          t={t}
          locale={locale}
          period={parsePeriod(periodo)}
          anchor={da && ISO_DATE.test(da) ? da : today}
        />
      ) : profile ? (
        <MemberDashboard supabase={supabase} profile={profile} today={today} gym={gym} t={t} />
      ) : (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {t.dashboard.profileUnavailable}
        </p>
      )}
    </div>
  );
}

// Two links, not a client-side toggle: switching view is a navigation and
// survives a reload, exactly like the calendar's list/grid control.
function ViewToggle({
  showingMine,
  gymHref,
  mineHref,
  gymLabel,
  mineLabel,
}: {
  showingMine: boolean;
  gymHref: string;
  mineHref: string;
  gymLabel: string;
  mineLabel: string;
}) {
  const base = "rounded-full px-3 py-1.5 text-xs font-medium transition-colors";
  const on = "bg-foreground text-background";
  const off = "text-foreground/60 hover:bg-muted";

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-border p-1">
      <Link
        href={gymHref}
        aria-current={showingMine ? undefined : "page"}
        className={`${base} ${showingMine ? off : on}`}
      >
        {gymLabel}
      </Link>
      <Link
        href={mineHref}
        aria-current={showingMine ? "page" : undefined}
        className={`${base} ${showingMine ? on : off}`}
      >
        {mineLabel}
      </Link>
    </div>
  );
}
