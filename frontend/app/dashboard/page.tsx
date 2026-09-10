import { ComingSoon } from "@/components/coming-soon";
import { DashboardIcon } from "@/components/icons";
import { requireAdmin } from "@/utils/supabase/require-admin";

export default async function DashboardPage() {
  await requireAdmin("/dashboard");

  return (
    <ComingSoon
      icon={DashboardIcon}
      title="Dashboard"
      description="Vista individuale, vista istruttore (i propri studenti) e vista gym-wide con le statistiche aggregate — incluse le segnalazioni di idoneità a grado/cintura."
      detail="In arrivo: il login funziona, manca ancora il collegamento dei dati reali (tabelle e policy RLS)."
    />
  );
}
