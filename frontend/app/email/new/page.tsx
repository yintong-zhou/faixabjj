import type { Metadata } from "next";
import Link from "next/link";

import { AlertCircleIcon } from "@/components/icons";
import { LOCALES, LOCALE_LABELS } from "@/utils/i18n/locales";
import { getDictionary } from "@/utils/i18n/server";
import { requirePlatformAdmin } from "@/utils/supabase/require-admin";

import { createTemplate } from "../actions";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: `${t.emailAdmin.create.title} · ${t.emailAdmin.title}` };
}

// Name and language of a new template; the content is written in the editor
// it opens, and only its first Save creates anything on notify-flow.
export default async function NewTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; name?: string }>;
}) {
  const { t } = await getDictionary();
  await requirePlatformAdmin("/email/new");
  const { error, name } = await searchParams;
  const c = t.emailAdmin.create;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-2">
        <Link href="/email" className="w-fit text-sm text-foreground/60 hover:text-foreground">
          ← {t.emailAdmin.editor.back}
        </Link>
        <h1 className="font-heading text-xl font-semibold sm:text-2xl">{c.title}</h1>
        <p className="text-sm text-foreground/60">{c.lead}</p>
        <p className="text-sm text-foreground/60">{c.notUsedYet}</p>
      </div>

      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <form action={createTemplate} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{c.name}</span>
          <input
            name="name"
            defaultValue={name ?? ""}
            required
            maxLength={64}
            pattern="[a-z0-9\-]{1,64}"
            autoComplete="off"
            className={`${field} font-mono`}
          />
          <span className="text-xs text-foreground/55">{c.nameHint}</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{c.locale}</span>
          <select name="locale" defaultValue="it" className={field}>
            {LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {LOCALE_LABELS[locale]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {c.submit}
        </button>
      </form>
    </div>
  );
}
