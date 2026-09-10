import { ComingSoon } from "@/components/coming-soon";
import { UsersIcon } from "@/components/icons";
import { requireAdmin } from "@/utils/supabase/require-admin";

export default async function RegistroPage() {
  await requireAdmin("/registro");

  return (
    <ComingSoon
      icon={UsersIcon}
      title="Registro"
      description="Un profilo unico per ogni persona — studente e, quando serve, anche assistente o istruttore — con storico dei ruoli assegnati e del grado attuale."
      detail="In arrivo: il login funziona, manca ancora il collegamento dei dati reali (tabelle e policy RLS)."
    />
  );
}
