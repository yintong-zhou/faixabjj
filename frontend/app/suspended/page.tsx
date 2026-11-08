import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { PauseIcon } from "@/components/icons";
import { getDictionary } from "@/utils/i18n/server";
import { getAccess } from "@/utils/supabase/require-admin";
import { createClient } from "@/utils/supabase/server";

// requireAdmin sends here both a suspended gym's members and an account that
// belongs to no gym at all. The page never assumes which: it asks again and
// only says "suspended" when the database says so. Anything else (a signed-out
// visitor, an active gym, a failed lookup) must never see that message —
// a student of a working gym read it after an idle pause. Cached: the metadata
// and the page ask once per request between them.
type State = "signedOut" | "suspended" | "noGym" | "fine" | "unavailable";

const gymState = cache(async (): Promise<State> => {
  const supabase = createClient(await cookies());
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return "signedOut";
  const access = await getAccess(supabase);
  if (access.unavailable) return "unavailable";
  if (access.gymStatus === "suspended") return "suspended";
  if (access.gymStatus === null && !access.isPlatformAdmin) return "noGym";
  return "fine";
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: (await gymState()) === "suspended" ? t.suspended.title : t.suspended.noGymTitle };
}

// Where requireAdmin sends every member of a suspended gym, and any account
// that is in no gym and is not the superadmin. Deliberately not
// behind requireAdmin itself (it would redirect here forever) and reachable
// with a password change pending: the only thing left to do is sign out.
export default async function SuspendedPage() {
  const state = await gymState();

  if (state === "signedOut") redirect("/login");
  // Nothing to explain: the gym is active, so the dashboard (or, with a
  // password change pending, the proxy's redirect) takes over.
  if (state === "fine") redirect("/dashboard");
  if (state === "unavailable") throw new Error("current_access unavailable");

  const { t } = await getDictionary();
  const suspended = state === "suspended";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10 sm:py-14">
      <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
        <PauseIcon className="h-5 w-5 shrink-0 text-accent" />
        {suspended ? t.suspended.title : t.suspended.noGymTitle}
      </h1>
      <p className="text-sm leading-relaxed text-foreground/70">
        {suspended ? t.suspended.body : t.suspended.noGymBody}
      </p>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted bg-surface raised-button"
        >
          {t.nav.signOut}
        </button>
      </form>
    </div>
  );
}
