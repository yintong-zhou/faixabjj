import type { Metadata } from "next";

import { AlertCircleIcon, FileTextIcon } from "@/components/icons";
import { formatDate } from "@/utils/dates";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { requirePlatformAdmin } from "@/utils/supabase/require-admin";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.logs.title };
}

type LogRow = {
  id: number;
  created_at: string;
  level: "error" | "event";
  scope: string;
  action: string;
  code: string | null;
  message: string | null;
  gym_id: string | null;
  actor_id: string | null;
  subject_id: string | null;
};

// Same window as prune_app_log() (20261006000000): rows the next insert would
// delete are not shown even if nothing has been written for days.
const RETENTION_DAYS = 7;
// PostgREST answers at most 1000 rows per request by default; the table holds
// up to 2000, so two ranged requests.
const PAGE = 1000;
const PAGES = [0, PAGE];

const short = (id: string | null) => (id ? id.slice(0, 8) : "—");

// The superadmin's log: ids only, no member is named (docs/claude/gyms.md).
export default async function LogsPage() {
  const { t } = await getDictionary();
  const { supabase } = await requirePlatformAdmin("/logs");

  const since = new Date(new Date().getTime() - RETENTION_DAYS * 86_400_000).toISOString();
  const [gymsResult, pages] = await Promise.all([
    supabase.from("gym").select("id, name"),
    Promise.all(
      PAGES.map((from) =>
        supabase
          .from("app_log")
          .select("id, created_at, level, scope, action, code, message, gym_id, actor_id, subject_id")
          .gte("created_at", since)
          .order("id", { ascending: false })
          .range(from, from + PAGE - 1),
      ),
    ),
  ]);

  const failed = pages.find((p) => p.error)?.error;
  if (failed) logDbError("logs", "app_log", failed);
  if (gymsResult.error) logDbError("logs", "gym", gymsResult.error);

  const rows = pages.flatMap((p) => (p.data ?? []) as LogRow[]);
  const gymNames = new Map((gymsResult.data ?? []).map((g) => [g.id as string, g.name as string]));
  // A deleted gym keeps its id in the log: show the id.
  const gymName = (id: string | null) => (id ? (gymNames.get(id) ?? short(id)) : "—");

  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:gap-5 sm:px-6 sm:py-7">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
          <FileTextIcon className="h-5 w-5 shrink-0 text-accent" />
          {t.logs.title}
        </h1>
        <p className="text-sm text-foreground/60">{t.logs.subtitle}</p>
      </div>

      {failed ? (
        <p className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t.logs.loadFailed}</span>
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-foreground/60">{t.logs.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs text-foreground/60">
              <tr>
                <th className="px-3 py-2 font-medium">{t.logs.columns.when}</th>
                <th className="px-3 py-2 font-medium">{t.logs.columns.level}</th>
                <th className="px-3 py-2 font-medium">{t.logs.columns.action}</th>
                <th className="px-3 py-2 font-medium">{t.logs.columns.error}</th>
                <th className="px-3 py-2 font-medium">{t.logs.columns.gym}</th>
                <th className="px-3 py-2 font-medium">{t.logs.columns.actor}</th>
                <th className="px-3 py-2 font-medium">{t.logs.columns.subject}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const iso = new Date(row.created_at).toISOString();
                return (
                  <tr key={row.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {formatDate(iso.slice(0, 10))} {iso.slice(11, 19)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.level === "error" ? "bg-danger/10 text-danger" : "bg-muted text-foreground/70"
                        }`}
                      >
                        {t.logs.level[row.level]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                      {row.scope} / {row.action}
                    </td>
                    <td className="min-w-64 px-3 py-2 font-mono text-xs">
                      {row.code || row.message ? `${row.code ?? ""} ${row.message ?? ""}`.trim() : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{gymName(row.gym_id)}</td>
                    <td className="px-3 py-2 font-mono text-xs" title={row.actor_id ?? undefined}>
                      {short(row.actor_id)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs" title={row.subject_id ?? undefined}>
                      {short(row.subject_id)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
