import { requireClassManager } from "@/utils/supabase/require-admin";

export default async function CorsiPage() {
  await requireClassManager("/corsi");

  return <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Corsi</h1>;
}
