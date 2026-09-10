import { ComingSoon } from "@/components/coming-soon";
import { CalendarCheckIcon } from "@/components/icons";
import { requireAdmin } from "@/utils/supabase/require-admin";

export default async function PresenzePage() {
  await requireAdmin("/presenze");

  return (
    <ComingSoon
      icon={CalendarCheckIcon}
      title="Presenze"
      description="Presente/assente per persona e data, con chi ha condotto la lezione — da cui deriva il conteggio ore automatico di ciascuno."
      detail="In arrivo: il login funziona, manca ancora il collegamento dei dati reali (tabelle e policy RLS)."
    />
  );
}
