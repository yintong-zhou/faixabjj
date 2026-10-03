import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PauseIcon } from "@/components/icons";
import { getDictionary } from "@/utils/i18n/server";
import { requireSession } from "@/utils/supabase/require-admin";

import { checkAgain } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.pending.title, robots: { index: false } };
}

// Where an account that signed up through an invite link waits for approval.
// requireSession, not requireAdmin: requireAdmin sends pending accounts here,
// and would send this page back to itself. No gym name: the account has no gym
// yet, so it cannot read one.
export default async function PendingPage() {
  const session = await requireSession("/pending");
  if (!session.pendingApproval) redirect("/dashboard");

  const { t } = await getDictionary();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10 sm:py-14">
      <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
        <PauseIcon className="h-5 w-5 shrink-0 text-accent" />
        {t.pending.title}
      </h1>
      <p className="text-sm leading-relaxed text-foreground/70">{t.pending.body}</p>
      <div className="flex flex-wrap gap-2">
        <form action={checkAgain}>
          <button
            type="submit"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            {t.pending.checkAgain}
          </button>
        </form>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            {t.nav.signOut}
          </button>
        </form>
      </div>
    </div>
  );
}
