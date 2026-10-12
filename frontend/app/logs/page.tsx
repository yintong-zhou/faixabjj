import type { Metadata } from "next";
import Link from "next/link";

import { AlertCircleIcon, FileTextIcon } from "@/components/icons";
import { formatDate } from "@/utils/dates";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { subjectKind } from "@/utils/log-subject";
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

// when · level · action · error · gym · actor · subject. The error column
// takes the room the others leave, so a wide screen is used, not padded. The
// grid starts at lg: seven columns do not fit a 768px tablet, which gets the
// stacked cards instead.
const COLUMNS =
  "lg:grid lg:grid-cols-[9.5rem_4.5rem_minmax(9rem,13rem)_minmax(8rem,1fr)_minmax(6rem,10rem)_minmax(8rem,12rem)_minmax(8rem,12rem)]";

// UTC first, then every IANA zone the runtime knows (it does not list UTC).
const TIME_ZONES = ["UTC", ...Intl.supportedValuesOf("timeZone").filter((z) => z !== "UTC")];
const TIME_ZONE_SET = new Set(TIME_ZONES);

// "Europe/Rome (UTC+2)": the offset is today's, so it moves with daylight
// saving. Rebuilt at most once an hour — 418 formatters are ~50 ms, and an
// offset changes twice a year at most.
let zoneLabels: { hour: number; labels: Map<string, string> } | null = null;

function zoneLabel(zone: string): string {
  const hour = Math.floor(new Date().getTime() / 3_600_000);
  if (zoneLabels?.hour !== hour) {
    const now = new Date();
    const labels = new Map<string, string>();
    for (const z of TIME_ZONES) {
      const part = new Intl.DateTimeFormat("en-US", { timeZone: z, timeZoneName: "shortOffset" })
        .formatToParts(now)
        .find((p) => p.type === "timeZoneName")?.value;
      // "GMT+5:30" → "UTC+5:30"; plain "GMT" is "UTC+0".
      const offset = !part || part === "GMT" ? "UTC+0" : part.replace("GMT", "UTC");
      labels.set(z, `${z.replaceAll("_", " ")} (${offset})`);
    }
    zoneLabels = { hour, labels };
  }
  return zoneLabels.labels.get(zone) ?? zone;
}

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";

type Search = { q?: string; level?: string; gym?: string; tz?: string; before?: string };

const short = (id: string | null) => (id ? id.slice(0, 8) : "—");

// A name or a kind, and the short id when the label alone does not say which.
type Named = { label: string; detail?: string };

function NamedText({ who }: { who: Named }) {
  return (
    <>
      {who.label}
      {who.detail ? <span className="ml-1.5 font-mono text-xs text-foreground/50">{who.detail}</span> : null}
    </>
  );
}

// The superadmin's log: the table stores ids; a gym and a gym manager are shown
// by name (the superadmin already sees both), anyone else by kind. No member is
// ever named (docs/claude/gyms.md).
export default async function LogsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { t } = await getDictionary();
  const { supabase, userId } = await requirePlatformAdmin("/logs");
  const search = await searchParams;
  // Anything malformed in the URL is dropped, not sent to Postgres.
  const level = search.level === "error" || search.level === "event" ? search.level : "";
  const gym = search.gym && UUID.test(search.gym) ? search.gym : "";
  const before = search.before && /^\d{1,18}$/.test(search.before) ? search.before : "";
  const q = search.q ?? "";
  const tz = search.tz && TIME_ZONE_SET.has(search.tz) ? search.tz : "UTC";
  // sv-SE writes "2026-10-06 23:54:37": the date goes through formatDate() like
  // every date in the app, the time as it is.
  const clock = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  // What the links keep: the filters and the zone, but not the page.
  const keep = { ...(q && { q }), ...(level && { level }), ...(gym && { gym }), ...(tz !== "UTC" && { tz }) };

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
      ? `/logs?${new URLSearchParams({ ...keep, before: String(rows[PAGE - 1].id) })}`
      : null;
  const newestHref = `/logs?${new URLSearchParams(keep)}`;
  // Clearing the filters keeps the zone: it is a display choice, not a filter.
  const clearHref = tz === "UTC" ? "/logs" : `/logs?${new URLSearchParams({ tz })}`;

  const gymNames = new Map((gymsResult.data ?? []).map((g) => [g.id as string, g.name as string]));
  // A deleted gym keeps its id in the log: show the id.
  const gymName = (id: string | null) => (id ? (gymNames.get(id) ?? short(id)) : "—");

  // The managers of the gyms on this page, by account id and by person id:
  // gym_managers() is the superadmin's own window on them, name included.
  const gymIds = [...new Set(rows.map((r) => r.gym_id).filter((id): id is string => Boolean(id)))];
  const managerResults = await Promise.all(gymIds.map((id) => supabase.rpc("gym_managers", { p_gym_id: id })));
  const managers = new Map<string, string>();
  for (const result of managerResults) {
    if (result.error) logDbError("logs", "gym_managers", result.error);
    for (const m of (result.data ?? []) as { person_id: string; full_name: string; auth_user_id: string | null }[]) {
      managers.set(m.person_id, m.full_name);
      if (m.auth_user_id) managers.set(m.auth_user_id, m.full_name);
    }
  }

  const actorOf = (row: LogRow): Named => {
    const name = row.actor_id ? managers.get(row.actor_id) : undefined;
    if (name) return { label: name, detail: t.logs.who.manager };
    // Gym actions can only be the platform's; the rest is some other staff.
    if (row.actor_id === userId || row.scope === "gyms") return { label: t.logs.who.platform };
    return { label: t.logs.who.staff, detail: short(row.actor_id) };
  };
  const subjectOf = (row: LogRow): Named => {
    if (!row.subject_id) return { label: "—" };
    const name = managers.get(row.subject_id);
    if (name) return { label: name, detail: t.logs.who.manager };
    const kind = subjectKind(row.scope, row.action);
    if (kind === "gym") {
      const gymLabel = gymNames.get(row.subject_id);
      return gymLabel ? { label: gymLabel } : { label: t.logs.subject.gymDeleted, detail: short(row.subject_id) };
    }
    return { label: t.logs.subject[kind], detail: short(row.subject_id) };
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
          <FileTextIcon className="h-5 w-5 shrink-0 text-accent" />
          {t.logs.title}
        </h1>
        <p className="text-sm text-foreground/60">{t.logs.subtitle(zoneLabel(tz))}</p>
      </div>

      <form method="get" className="flex flex-col gap-2 md:flex-row">
        <input name="q" defaultValue={q} placeholder={t.logs.search} className={`${fieldClass} md:flex-1`} />
        <select name="level" defaultValue={level} className={fieldClass}>
          <option value="">{t.logs.allLevels}</option>
          <option value="error">{t.logs.level.error}</option>
          <option value="event">{t.logs.level.event}</option>
        </select>
        <select name="gym" defaultValue={gym} className={`${fieldClass} md:max-w-56`}>
          <option value="">{t.logs.allGyms}</option>
          {(gymsResult.data ?? []).map((g) => (
            <option key={g.id as string} value={g.id as string}>
              {g.name as string}
            </option>
          ))}
        </select>
        <select name="tz" defaultValue={tz} aria-label={t.logs.timeZone} className={`${fieldClass} md:max-w-48`}>
          {TIME_ZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zoneLabel(zone)}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted md:flex-none"
          >
            {t.logs.filter}
          </button>
          {filtered ? (
            <Link
              href={clearHref}
              className="flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-medium text-foreground/70 hover:bg-muted md:flex-none"
            >
              {t.logs.reset}
            </Link>
          ) : null}
        </div>
      </form>

      {failed ? (
        <p className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t.logs.loadFailed}</span>
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-foreground/60">{filtered ? t.logs.noMatch : t.logs.empty}</p>
      ) : (
        // One markup for both sizes: a stacked card on a phone, a row of the
        // COLUMNS grid from md up. No horizontal scroll at any width; the error
        // column takes whatever the others leave. ARIA roles because the
        // elements are not a <table>.
        <div role="table" className="overflow-hidden rounded-xl border border-border text-sm">
          <div
            role="row"
            className={`${COLUMNS} hidden gap-x-3 bg-muted px-4 py-2 text-xs font-medium text-foreground/60`}
          >
            <span role="columnheader">{t.logs.columns.when}</span>
            <span role="columnheader">{t.logs.columns.level}</span>
            <span role="columnheader">{t.logs.columns.action}</span>
            <span role="columnheader">{t.logs.columns.error}</span>
            <span role="columnheader">{t.logs.columns.gym}</span>
            <span role="columnheader">{t.logs.columns.actor}</span>
            <span role="columnheader">{t.logs.columns.subject}</span>
          </div>
          <div role="rowgroup" className="divide-y divide-border">
            {rows.map((row) => {
              const stamp = clock.format(new Date(row.created_at));
              return (
                <div
                  key={row.id}
                  role="row"
                  className={`${COLUMNS} flex flex-col gap-1.5 px-3 py-3 sm:px-4 lg:items-baseline lg:gap-x-3 lg:py-2.5`}
                >
                  {/* On a phone the time and the level share the first line. */}
                  <div className="flex items-center justify-between gap-2 lg:contents">
                    <span role="cell" className="whitespace-nowrap tabular-nums">
                      {formatDate(stamp.slice(0, 10))} {stamp.slice(11, 19)}
                    </span>
                    <span role="cell" className="lg:justify-self-start">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.level === "error" ? "bg-danger/10 text-danger" : "bg-muted text-foreground/70"
                        }`}
                      >
                        {t.logs.level[row.level]}
                      </span>
                    </span>
                  </div>
                  <span role="cell" className="break-words font-mono text-xs">
                    {row.scope} / {row.action}
                  </span>
                  <span role="cell" className="break-words font-mono text-xs">
                    {row.code || row.message ? `${row.code ?? ""} ${row.message ?? ""}`.trim() : "—"}
                  </span>
                  {/* On a phone the gym and the two ids sit on one muted line,
                      each with its column name; from md up they are plain cells. */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/60 lg:contents lg:text-sm lg:text-foreground">
                    <span role="cell" className="break-words" title={gymName(row.gym_id)}>
                      <span className="lg:hidden">{t.logs.columns.gym}: </span>
                      {gymName(row.gym_id)}
                    </span>
                    <span role="cell" className="break-words" title={row.actor_id ?? undefined}>
                      <span className="lg:hidden">{t.logs.columns.actor}: </span>
                      <NamedText who={actorOf(row)} />
                    </span>
                    <span role="cell" className="break-words" title={row.subject_id ?? undefined}>
                      <span className="lg:hidden">{t.logs.columns.subject}: </span>
                      <NamedText who={subjectOf(row)} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {before || olderHref ? (
        <nav className="flex justify-between gap-2 pb-2 text-sm font-medium">
          {before ? (
            <Link href={newestHref} className="flex-1 rounded-lg border border-border px-4 py-2.5 text-center hover:bg-muted sm:flex-none">
              {t.logs.newest}
            </Link>
          ) : (
            <span />
          )}
          {olderHref ? (
            <Link href={olderHref} className="flex-1 rounded-lg border border-border px-4 py-2.5 text-center hover:bg-muted sm:flex-none">
              {t.logs.older}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
