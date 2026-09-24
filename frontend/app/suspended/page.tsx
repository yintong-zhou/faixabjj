import type { Metadata } from "next";

import { PauseIcon } from "@/components/icons";
import { getDictionary } from "@/utils/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.suspended.title };
}

// Where requireAdmin sends every member of a suspended gym. Deliberately not
// behind requireAdmin itself (it would redirect here forever) and reachable
// with a password change pending: the only thing left to do is sign out.
export default async function SuspendedPage() {
  const { t } = await getDictionary();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10 sm:py-14">
      <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
        <PauseIcon className="h-5 w-5 shrink-0 text-accent" />
        {t.suspended.title}
      </h1>
      <p className="text-sm leading-relaxed text-foreground/70">{t.suspended.body}</p>
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
