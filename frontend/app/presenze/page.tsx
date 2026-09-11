import { ComingSoon } from "@/components/coming-soon";
import { CalendarCheckIcon } from "@/components/icons";
import { requireRegistryViewer } from "@/utils/supabase/require-admin";

export default async function PresenzePage() {
  // Staff only: an allievo or assistente gets a 404 here, not a redirect.
  const { access } = await requireRegistryViewer("/presenze");

  return (
    <ComingSoon
      icon={CalendarCheckIcon}
      title="Presenze"
      description="Presente/assente per persona e data, con chi ha condotto la lezione — da cui deriva il conteggio ore automatico di ciascuno."
      detail={
        access.canEditRegistry
          ? "In arrivo: il login funziona, manca ancora il collegamento dei dati reali (tabelle e policy RLS)."
          : "In arrivo. Con il tuo ruolo di istruttore questa sezione sarà in sola lettura."
      }
    />
  );
}
