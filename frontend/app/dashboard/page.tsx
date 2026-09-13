import type { Metadata } from "next";

import { AlertCircleIcon } from "@/components/icons";
import { getOrCreateProfile } from "@/utils/supabase/profile";
import { getAccess, requireAdmin } from "@/utils/supabase/require-admin";
import { MemberDashboard } from "./member-dashboard";
import { StaffDashboard } from "./staff-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { supabase, userId, email } = await requireAdmin("/dashboard");
  const access = await getAccess(supabase);

  // The same predicate that opens Corsi and the roll call: instructors,
  // maestri and admin. Everybody else sees their own figures and nothing
  // about anybody else — which is not a matter of hiding cards, but of the
  // queries never being run. RLS would refuse them anyway: an allievo cannot
  // read member_overview or another member's attendance.
  const isStaff = access.canManageClasses;

  const profile = isStaff ? null : await getOrCreateProfile(supabase, userId, email);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex w-full flex-col gap-6 sm:gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          {isStaff
            ? "Il quadro della palestra: allievi, lezioni del mese e distribuzione delle cinture."
            : "Il tuo percorso: grado, ore di lezione e prossimi allenamenti."}
        </p>
      </header>

      {isStaff ? (
        <StaffDashboard supabase={supabase} today={today} />
      ) : profile ? (
        <MemberDashboard supabase={supabase} profile={profile} today={today} />
      ) : (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          Il tuo profilo non è disponibile. Se il problema persiste, avvisa la
          segreteria della palestra.
        </p>
      )}
    </div>
  );
}
