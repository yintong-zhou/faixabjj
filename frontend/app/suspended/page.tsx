import type { Metadata } from "next";
import { cookies } from "next/headers";
import { cache } from "react";

import { PauseIcon } from "@/components/icons";
import { getDictionary } from "@/utils/i18n/server";
import { getAccess } from "@/utils/supabase/require-admin";
import { createClient } from "@/utils/supabase/server";

// requireAdmin sends here both a suspended gym's members and an account that
// belongs to no gym at all; the page tells them apart by asking again. Cached:
// the metadata and the page ask once per request between them. Signed out,
// the page stays what it always was.
const inNoGym = cache(async (): Promise<boolean> => {
  const supabase = createClient(await cookies());
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return false;
  const access = await getAccess(supabase);
  return access.gymStatus === null && !access.isPlatformAdmin;
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: (await inNoGym()) ? t.suspended.noGymTitle : t.suspended.title };
}

// Where requireAdmin sends every member of a suspended gym, and any account
// that is in no gym and is not the superadmin. Deliberately not
// behind requireAdmin itself (it would redirect here forever) and reachable
// with a password change pending: the only thing left to do is sign out.
export default async function SuspendedPage() {
  const { t } = await getDictionary();
  const noGym = await inNoGym();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10 sm:py-14">
      <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
        <PauseIcon className="h-5 w-5 shrink-0 text-accent" />
        {noGym ? t.suspended.noGymTitle : t.suspended.title}
      </h1>
      <p className="text-sm leading-relaxed text-foreground/70">
        {noGym ? t.suspended.noGymBody : t.suspended.body}
      </p>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          {t.nav.signOut}
        </button>
      </form>
    </div>
  );
}
