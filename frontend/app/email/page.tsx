import type { Metadata } from "next";
import Link from "next/link";

import { AlertCircleIcon, CheckCircleIcon, MailIcon, XCircleIcon } from "@/components/icons";
import { linkSecret } from "@/utils/auth-link-token";
import { APP_TEMPLATES, isAppTemplate, missingAppTemplates, templateStates } from "@/utils/email-templates";
import { LOCALES, LOCALE_SHORT } from "@/utils/i18n/locales";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { checkHealth, listTemplates, type TemplateSummary } from "@/utils/notify-admin";
import { NotifyError, notifyConfig } from "@/utils/notify-flow";
import { requirePlatformAdmin } from "@/utils/supabase/require-admin";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.emailAdmin.title };
}

type Count = { sent: number; failed: number };

const card = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5";
const th = "pb-2 text-left text-xs font-medium text-foreground/55";
const td = "border-t border-border py-2 pr-3 text-sm";

// The superadmin's notify-flow page: is the service reachable and are we
// configured, how much email went out in the last 7 days (counts only, from
// the definer functions of 20261019000000), and the templates — each opens
// the editor at /email/<name>/<locale>.
//
// One /v1 call per load (the template list), plus /health: the request budget
// is shared with every real email.
export default async function EmailPage() {
  const { t } = await getDictionary();
  const { supabase } = await requirePlatformAdmin("/email");
  const e = t.emailAdmin;

  const [healthy, list, byGym, byTemplate, gyms] = await Promise.all([
    checkHealth(),
    listTemplates().then(
      (templates): { templates: TemplateSummary[]; error: null } => ({ templates, error: null }),
      (error: unknown) => ({ templates: null, error }),
    ),
    supabase.rpc("platform_email_by_gym", { p_days: 7 }),
    supabase.rpc("platform_email_by_template", { p_days: 7 }),
    supabase.from("gym").select("id, name"),
  ]);

  if (list.error) {
    const { status, code } = list.error instanceof NotifyError ? list.error : { status: 0, code: "unexpected_error" };
    logDbError("email", "listTemplates", { code: `${status} ${code}` });
  }
  const statsError = byGym.error ?? byTemplate.error ?? gyms.error;
  if (statsError) logDbError("email", "stats", statsError);

  const config = notifyConfig();
  const keyRefused = list.error instanceof NotifyError && (list.error.status === 401 || list.error.status === 403);
  const states = list.templates ? templateStates(list.templates) : null;
  const missing = states ? missingAppTemplates(states) : null;

  const checks: { ok: boolean | null; label: string }[] = [
    { ok: Boolean(process.env.NOTIFY_FLOW_URL), label: e.connection.env("NOTIFY_FLOW_URL") },
    { ok: Boolean(process.env.NOTIFY_FLOW_API_KEY), label: e.connection.env("NOTIFY_FLOW_API_KEY") },
    { ok: Boolean(process.env.NOTIFY_FLOW_APP_NAME), label: e.connection.env("NOTIFY_FLOW_APP_NAME") },
    { ok: linkSecret() !== null, label: e.connection.env("AUTH_LINK_SECRET") },
    { ok: Boolean(process.env.NEXT_PUBLIC_SITE_URL), label: e.connection.env("NEXT_PUBLIC_SITE_URL") },
    { ok: healthy, label: healthy ? e.connection.health : e.connection.unreachable },
    {
      ok: config ? list.templates !== null : null,
      label: list.templates ? e.connection.key : keyRefused ? e.connection.keyRefused : e.connection.keyUnknown,
    },
    {
      ok: missing ? missing.length === 0 : null,
      label: !missing
        ? e.connection.templatesUnknown
        : missing.length === 0
          ? e.connection.templatesComplete
          : e.connection.templatesMissing(missing.map((m) => `${m.name} (${LOCALE_SHORT[m.locale]})`).join(", ")),
    },
  ];

  const gymNames = new Map((gyms.data ?? []).map((g) => [g.id as string, g.name as string]));
  const gymRows = ((byGym.data ?? []) as ({ gym_id: string | null } & Count)[]).map((r) => ({
    label: r.gym_id ? (gymNames.get(r.gym_id) ?? r.gym_id.slice(0, 8)) : e.stats.noGym,
    sent: Number(r.sent),
    failed: Number(r.failed),
  }));
  const templateRows = ((byTemplate.data ?? []) as ({ template: string } & Count)[]).map((r) => ({
    label: r.template,
    sent: Number(r.sent),
    failed: Number(r.failed),
  }));

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
          <MailIcon className="h-5 w-5 shrink-0 text-accent" />
          {e.title}
        </h1>
        <p className="text-sm text-foreground/60">{e.subtitle}</p>
      </div>

      <section className={card}>
        <h2 className="font-heading text-base font-semibold">{e.connection.title}</h2>
        <ul className="flex flex-col gap-1.5">
          {checks.map((check) => (
            <li key={check.label} className="flex items-start gap-2 text-sm">
              {check.ok === true ? (
                <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
              ) : check.ok === false ? (
                <XCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              ) : (
                <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-foreground/45" />
              )}
              {check.label}
            </li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-base font-semibold">{e.stats.title}</h2>
          <p className="text-xs text-foreground/55">{e.stats.note}</p>
        </div>
        {statsError ? (
          <p className="text-sm text-foreground/60">{e.stats.unavailable}</p>
        ) : gymRows.length === 0 ? (
          <p className="text-sm text-foreground/60">{e.stats.empty}</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            <CountTable title={e.stats.byGym} first={e.stats.gym} rows={gymRows} sent={e.stats.sent} failed={e.stats.failed} />
            <CountTable
              title={e.stats.byTemplate}
              first={e.stats.template}
              rows={templateRows}
              sent={e.stats.sent}
              failed={e.stats.failed}
            />
          </div>
        )}
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-base font-semibold">{e.templates.title}</h2>
          <Link
            href="/email/new"
            className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            {e.templates.new}
          </Link>
        </div>
        {!states ? (
          <p className="text-sm text-foreground/60">{e.templates.unavailable}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem]">
              <thead>
                <tr>
                  <th className={th}>{e.templates.name}</th>
                  <th className={th}>{e.templates.when}</th>
                  {LOCALES.map((locale) => (
                    <th key={locale} className={th}>
                      {LOCALE_SHORT[locale]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...states].map(([name, perLocale]) => (
                  <tr key={name}>
                    <td className={`${td} font-mono text-xs`}>{name}</td>
                    <td className={`${td} text-foreground/70`}>
                      {isAppTemplate(name) ? e.when[name] : e.notSentByApp}
                    </td>
                    {LOCALES.map((locale) => {
                      const state = perLocale[locale];
                      // A missing locale of a template the app doesn't send
                      // has nothing to open; it is created from /email/new.
                      const openable = state !== "missing" || Object.hasOwn(APP_TEMPLATES, name);
                      return (
                        <td key={locale} className={td}>
                          {openable ? (
                            <Link
                              href={`/email/${name}/${locale}`}
                              className={`hover:underline ${state === "missing" ? "text-accent" : ""}`}
                            >
                              {e.states[state]}
                            </Link>
                          ) : (
                            <span className="text-foreground/45">{e.states[state]}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CountTable({
  title,
  first,
  rows,
  sent,
  failed,
}: {
  title: string;
  first: string;
  rows: { label: string; sent: number; failed: number }[];
  sent: string;
  failed: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <table className="w-full">
        <thead>
          <tr>
            <th className={th}>{first}</th>
            <th className={`${th} text-right`}>{sent}</th>
            <th className={`${th} text-right`}>{failed}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className={td}>{row.label}</td>
              <td className={`${td} text-right tabular-nums`}>{row.sent}</td>
              <td className={`${td} text-right tabular-nums ${row.failed > 0 ? "text-accent" : ""}`}>{row.failed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
