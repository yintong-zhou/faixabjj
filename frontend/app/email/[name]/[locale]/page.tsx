import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AlertCircleIcon, CheckCircleIcon } from "@/components/icons";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { APP_TEMPLATES, contentKey, isAppTemplate, isTemplateName, sampleValues } from "@/utils/email-templates";
import { LOCALES, LOCALE_SHORT, isLocale } from "@/utils/i18n/locales";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { getTemplate, type TemplateContent } from "@/utils/notify-admin";
import { NotifyError, notifyConfig } from "@/utils/notify-flow";
import { SITE_NAME, SITE_URL } from "@/utils/site";
import { requirePlatformAdmin } from "@/utils/supabase/require-admin";

import { refreshTestStatus, removeTemplate, sendTemplateTest } from "../../actions";
import { TemplateEditor } from "./template-editor";

type Params = { name: string; locale: string };
type Search = { ok?: string; error?: string; new?: string; test?: string; status?: string; code?: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { t } = await getDictionary();
  const { name } = await params;
  return { title: `${name} · ${t.emailAdmin.title}` };
}

// One template in one language: HTML and its live preview side by side, the
// plain text under them (written by hand), then the test send.
export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { t } = await getDictionary();
  const { name, locale } = await params;
  await requirePlatformAdmin(`/email/${name}/${locale}`);
  // From the address bar: checked before any call to notify-flow.
  if (!isTemplateName(name) || !isLocale(locale)) notFound();
  const search = await searchParams;
  const e = t.emailAdmin;

  let template: TemplateContent | null = null;
  let unavailable = false;
  try {
    template = await getTemplate(name, locale);
  } catch (error) {
    const { status, code } = error instanceof NotifyError ? error : { status: 0, code: "unexpected_error" };
    logDbError("email", "getTemplate", { code: `${status} ${code}` });
    unavailable = true;
  }

  const appTemplate = isAppTemplate(name);
  const isNew = search.new === "1" && !appTemplate && template === null;
  // A name nobody has and the app doesn't send exists only through /email/new.
  if (!unavailable && template === null && !appTemplate && !isNew) notFound();

  // Our own row is what Restore/Delete removes; a built-in shown as it is has
  // nothing to remove, and an app email with no built-in must never go.
  const ownRow = template !== null && !template.builtin;
  const removable = ownRow && !(appTemplate && !APP_TEMPLATES[name].builtin);
  const restores = appTemplate ? APP_TEMPLATES[name].builtin : false;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-2">
        <Link href="/email" className="w-fit text-sm text-foreground/60 hover:text-foreground">
          ← {e.editor.back}
        </Link>
        <h1 className="font-mono text-lg font-semibold sm:text-xl">{name}</h1>
        <p className="text-sm text-foreground/60">{appTemplate ? e.when[name] : e.notSentByApp}</p>
        <nav className="flex gap-1.5" aria-label={t.nav.language}>
          {LOCALES.map((l) => (
            <Link
              key={l}
              href={`/email/${name}/${l}${isNew ? "?new=1" : ""}`}
              aria-current={l === locale ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                l === locale ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"
              }`}
            >
              {LOCALE_SHORT[l]}
            </Link>
          ))}
        </nav>
      </div>

      {search.ok ? (
        <p className="flex items-start gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {search.ok}
        </p>
      ) : null}
      {search.error ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {search.error}
        </p>
      ) : null}

      {unavailable ? (
        <p className="text-sm text-foreground/60">{e.editor.unavailable}</p>
      ) : (
        <>
          {template === null ? (
            <p className="text-sm text-foreground/60">{isNew ? e.editor.isNew : e.editor.missing}</p>
          ) : null}

          <TemplateEditor
            key={contentKey(template)}
            name={name}
            locale={locale}
            isNew={isNew}
            initial={{ subject: template?.subject ?? "", html: template?.html ?? "", text: template?.text ?? "" }}
            allowed={appTemplate ? [...APP_TEMPLATES[name].variables] : null}
            samples={sampleValues(SITE_URL, notifyConfig()?.appName ?? SITE_NAME)}
            labels={{
              subject: e.editor.subject,
              html: e.editor.html,
              preview: e.editor.preview,
              previewTitle: e.editor.previewTitle,
              text: e.editor.text,
              textHint: e.editor.textHint,
              variables: e.editor.variables,
              allowed: appTemplate ? e.editor.allowed([...APP_TEMPLATES[name].variables].join(", ")) : null,
              unknownWarning: e.editor.unknownWarning("{list}"),
              save: e.editor.save,
            }}
          />

          {removable ? (
            <form action={removeTemplate} className="flex justify-end">
              <input type="hidden" name="name" value={name} />
              <input type="hidden" name="locale" value={locale} />
              <ConfirmSubmitButton
                message={restores ? e.editor.restoreConfirm : e.editor.deleteConfirm}
                className="rounded-full border border-border px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-muted"
              >
                {restores ? e.editor.restore : e.editor.delete}
              </ConfirmSubmitButton>
            </form>
          ) : null}

          {template !== null ? (
            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <h2 className="font-heading text-base font-semibold">{e.test.title}</h2>
              <p className="text-xs text-foreground/55">{e.test.hint}</p>
              <div className="flex flex-wrap items-center gap-2">
                <form action={sendTemplateTest}>
                  <input type="hidden" name="name" value={name} />
                  <input type="hidden" name="locale" value={locale} />
                  <button
                    type="submit"
                    className="rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    {e.test.send}
                  </button>
                </form>
                {search.test ? (
                  <form action={refreshTestStatus}>
                    <input type="hidden" name="name" value={name} />
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={search.test} />
                    <button
                      type="submit"
                      className="rounded-full px-3 py-2 text-sm font-medium text-foreground/70 hover:text-foreground"
                    >
                      {e.test.refresh}
                    </button>
                  </form>
                ) : null}
              </div>
              {search.test && search.status ? (
                <p className="text-sm">
                  {e.test.status(e.test.statuses[search.status] ?? e.test.statuses.unknown)}
                  {search.code ? <span className="ml-1.5 font-mono text-xs text-foreground/50">{search.code}</span> : null}
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
