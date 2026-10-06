import type { Metadata } from "next";
import Link from "next/link";

import { AlertCircleIcon, FileTextIcon } from "@/components/icons";
import { formatDate } from "@/utils/dates";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { searchWords } from "@/utils/search";
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
const PAGE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";

type Search = { q?: string; level?: string; gym?: string; before?: string };

const short = (id: string | null) => (id ? id.slice(0, 8) : "—");

// The superadmin's log: ids only, no member is named (docs/claude/gyms.md).
export default async function LogsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { t } = await getDictionary();
  const { supabase } = await requirePlatformAdmin("/logs");
  const search = await searchParams;
  // Anything malformed in the URL is dropped, not sent to Postgres.
  const level = search.level === "error" || search.level === "event" ? search.level : "";
  const gym = search.gym && UUID.test(search.gym) ? search.gym : "";
  const before = search.before && /^\d{1,18}$/.test(search.before) ? search.before : "";
  const q = search.q ?? "";

  const since = new Date(new Date().getTime() - RETENTION_DAYS * 86_400_000).toISOString();
  let query = supabase
    .from("app_log")
    .select("id, created_at, level, scope, action, code, message, gym_id, actor_id, subject_id")
    .gte("created_at", since)
    .order("id", { ascending: false })
    // One more than shown: whether it comes back says if there is an older page.
    .limit(PAGE + 1);
  if (level) query = query.eq("level", level);
  if (gym) query = query.eq("gym_id", gym);
  // Every word somewhere in the row's text; searchWords strips PostgREST syntax.
  for (const word of searchWords(q)) {
    query = query.or(["scope", "action", "code", "message"].map((c) => `${c}.ilike.%${word}%`).join(","));
  }
  // Below the last id shown, not by offset: a row written in between neither
  // repeats nor shifts anything.
  if (before) query = query.lt("id", before);

  const [gymsResult, logResult] = await Promise.all([
    supabase.from("gym").select("id, name").order("name"),
    query,
  ]);

  const failed = logResult.error;
  if (failed) logDbError("logs", "app_log", failed);
  if (gymsResult.error) logDbError("logs", "gym", gymsResult.error);

  const fetched = (logResult.data ?? []) as LogRow[];
  const rows = fetched.slice(0, PAGE);
  const filtered = Boolean(level || gym || q);
  const olderHref =
    fetched.length > PAGE
      ? `/logs?${new URLSearchParams({ ...(q && { q }), ...(level && { level }), ...(gym && { gym }), before: String(rows[PAGE - 1].id) })}`
      : null;
  const newestHref = `/logs?${new URLSearchParams({ ...(q && { q }), ...(level && { level }), ...(gym && { gym }) })}`;

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

      <form method="get" className="flex flex-col gap-2 sm:flex-row">
        <input name="q" defaultValue={q} placeholder={t.logs.search} className={`${fieldClass} sm:flex-1`} />
        <select name="level" defaultValue={level} className={fieldClass}>
          <option value="">{t.logs.allLevels}</option>
          <option value="error">{t.logs.level.error}</option>
          <option value="event">{t.logs.level.event}</option>
        </select>
        <select name="gym" defaultValue={gym} className={fieldClass}>
          <option value="">{t.logs.allGyms}</option>
          {(gymsResult.data ?? []).map((g) => (
            <option key={g.id as string} value={g.id as string}>
              {g.name as string}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">
          {t.logs.filter}
        </button>
        {filtered ? (
          <Link href="/logs" className="rounded-lg px-4 py-2.5 text-center text-sm font-medium text-foreground/70 hover:bg-muted">
            {t.logs.reset}
          </Link>
        ) : null}
      </form>

      {failed ? (
        <p className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t.logs.loadFailed}</span>
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-foreground/60">{filtered ? t.logs.noMatch : t.logs.empty}</p>
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

      {before || olderHref ? (
        <nav className="flex justify-between gap-2 text-sm font-medium">
          {before ? (
            <Link href={newestHref} className="rounded-lg border border-border px-4 py-2 hover:bg-muted">
              {t.logs.newest}
            </Link>
          ) : (
            <span />
          )}
          {olderHref ? (
            <Link href={olderHref} className="rounded-lg border border-border px-4 py-2 hover:bg-muted">
              {t.logs.older}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
