import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  AlertCircleIcon,
  BuildingIcon,
  CheckCircleIcon,
  FileTextIcon,
  PauseIcon,
  PlayIcon,
} from "@/components/icons";
import { RowMenu } from "@/components/row-menu";
import { formatDate } from "@/utils/dates";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { requirePlatformAdmin } from "@/utils/supabase/require-admin";
import { setGymStatus } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.gyms.title };
}

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";
const menuItemClass =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted";
const menuIconClass = "h-4 w-4 shrink-0";

type Overview = {
  id: string;
  name: string;
  status: "active" | "suspended";
  created_at: string;
  active_people: number | string;
  courses: number | string;
  managers: number | string;
};

type Search = { q?: string; stato?: string; ok?: string; error?: string };

// A list of gyms, not of people: the superadmin never sees a gym's members,
// only its aggregates (gym_overview(), a definer function that answers nobody
// else). Filters live in the URL like the Registro's; a few dozen gyms need no
// pagination.
export default async function GymsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { q, stato, ok, error } = await searchParams;
  const { t } = await getDictionary();
  const { supabase } = await requirePlatformAdmin("/gyms");

  const { data, error: overviewError } = await supabase.rpc("gym_overview");
  if (overviewError) logDbError("gyms", "gym_overview", overviewError);
  const needle = (q ?? "").trim().toLowerCase();
  const gyms = ((data ?? []) as Overview[]).filter(
    (g) =>
      (!needle || g.name.toLowerCase().includes(needle)) &&
      (stato !== "active" && stato !== "suspended" ? true : g.status === stato),
  );

  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:gap-5 sm:px-6 sm:py-7">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
          <BuildingIcon className="h-5 w-5 shrink-0 text-accent" />
          {t.gyms.title}
        </h1>
        <p className="text-sm text-foreground/60">{t.gyms.subtitle}</p>
      </div>

      {ok ? (
        <p className="flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ok}</span>
        </p>
      ) : null}
      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/gyms/new"
          className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          {t.gyms.newGym}
        </Link>
      </div>

      <form method="get" className="flex flex-col gap-2 sm:flex-row">
        <input name="q" defaultValue={q ?? ""} placeholder={t.gyms.search} className={`${fieldClass} sm:flex-1`} />
        <select name="stato" defaultValue={stato ?? ""} className={fieldClass}>
          <option value="">{t.gyms.allStatuses}</option>
          <option value="active">{t.gyms.status.active}</option>
          <option value="suspended">{t.gyms.status.suspended}</option>
        </select>
        <button type="submit" className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">
          {t.gyms.filter}
        </button>
      </form>

      {gyms.length === 0 ? (
        <p className="text-sm text-foreground/60">{t.gyms.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {gyms.map((gym) => (
            <li key={gym.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/gyms/${gym.id}`} className="truncate font-medium hover:text-accent">
                    {gym.name}
                  </Link>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      gym.status === "active" ? "bg-success/10 text-success" : "bg-muted text-foreground/60"
                    }`}
                  >
                    {t.gyms.status[gym.status]}
                  </span>
                </div>
                <p className="text-xs text-foreground/60">
                  {t.gyms.counts(Number(gym.active_people), Number(gym.courses), Number(gym.managers))}
                </p>
                <p className="text-xs text-foreground/45">
                  {t.gyms.createdOn(formatDate(gym.created_at.slice(0, 10)))}
                </p>
              </div>

              <RowMenu label={t.gyms.rowMenu}>
                <Link href={`/gyms/${gym.id}`} className={menuItemClass}>
                  <FileTextIcon className={menuIconClass} />
                  {t.gyms.details}
                </Link>
                <form action={setGymStatus}>
                  <input type="hidden" name="id" value={gym.id} />
                  <input type="hidden" name="status" value={gym.status === "active" ? "suspended" : "active"} />
                  <ConfirmSubmitButton
                    className={menuItemClass}
                    message={gym.status === "active" ? t.gyms.confirmSuspend(gym.name) : t.gyms.confirmReactivate(gym.name)}
                  >
                    {gym.status === "active" ? (
                      <PauseIcon className={menuIconClass} />
                    ) : (
                      <PlayIcon className={menuIconClass} />
                    )}
                    {gym.status === "active" ? t.gyms.suspend : t.gyms.reactivate}
                  </ConfirmSubmitButton>
                </form>
              </RowMenu>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
