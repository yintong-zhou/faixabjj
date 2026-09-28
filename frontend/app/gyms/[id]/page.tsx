import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  AlertCircleIcon,
  BuildingIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  KeyIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "@/components/icons";
import { RowMenu } from "@/components/row-menu";
import { formatDate, todayIn } from "@/utils/dates";
import { TemporaryPasswordNotice } from "@/components/temporary-password-notice";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { GYM_COLUMNS, toGymSettings, type GymRow } from "@/utils/supabase/gym";
import { requirePlatformAdmin } from "@/utils/supabase/require-admin";
import { readTemporaryPassword } from "@/utils/temporary-password-flash";
import {
  addManager,
  deleteGym,
  resetManagerPassword,
  revokeManager,
  setGymStatus,
  updateGym,
} from "../actions";
import { GymFields } from "../gym-fields";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.gyms.title };
}

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";
const menuItemClass =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted";
const menuIconClass = "h-4 w-4 shrink-0";
const sectionClass = "flex flex-col gap-4 rounded-xl border border-border p-4 sm:p-5";
const primaryButtonClass =
  "self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90";

type Manager = {
  person_id: string;
  full_name: string;
  email: string | null;
  auth_user_id: string | null;
  since: string | null;
};

export default async function GymDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; pw?: string }>;
}) {
  const { id } = await params;
  const { ok, error, pw } = await searchParams;
  const { t } = await getDictionary();
  const { supabase } = await requirePlatformAdmin(`/gyms/${id}`);
  const temporaryPassword = await readTemporaryPassword(pw);

  const { data: row, error: gymError } = await supabase
    .from("gym")
    .select(GYM_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (gymError) logDbError("gyms", "detail:gym", gymError);
  if (!row) notFound();
  const gym = toGymSettings(row as GymRow);

  const { data: managerRows, error: managersError } = await supabase.rpc("gym_managers", { p_gym_id: id });
  if (managersError) logDbError("gyms", "detail:gym_managers", managersError);
  const managers = (managerRows ?? []) as Manager[];
  const today = todayIn(gym.timezone);

  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:gap-5 sm:px-6 sm:py-7">
      <Link href="/gyms" className="flex w-fit items-center gap-1 text-sm font-medium text-accent hover:opacity-80">
        <ChevronLeftIcon className="h-4 w-4" />
        {t.gyms.back}
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
          <BuildingIcon className="h-5 w-5 shrink-0 text-accent" />
          {gym.name}
        </h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            gym.status === "active" ? "bg-success/10 text-success" : "bg-muted text-foreground/60"
          }`}
        >
          {t.gyms.status[gym.status]}
        </span>
      </div>

      {ok ? (
        <p className="flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ok}</span>
        </p>
      ) : null}
      <TemporaryPasswordNotice t={t} flash={temporaryPassword} />
      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      <section className={sectionClass}>
        <h2 className="font-heading text-lg font-semibold">{t.gyms.settings}</h2>
        <p className="flex items-start gap-2 text-xs text-foreground/60">
          <AlertCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t.gyms.settingsWarning}
        </p>
        <form action={updateGym} className="flex flex-col gap-3 sm:gap-4">
          <input type="hidden" name="id" value={gym.id} />
          <GymFields
            t={t}
            today={today}
            defaults={{
              name: gym.name,
              timezone: gym.timezone,
              trackingStartedOn: gym.trackingStartedOn,
              sessionLengthHours: gym.sessionLengthHours,
              lessonsPerWeek: gym.lessonsPerWeek,
              latitude: gym.latitude,
              longitude: gym.longitude,
            }}
          />
          <button type="submit" className={primaryButtonClass}>
            {t.gyms.save}
          </button>
        </form>
        <form action={setGymStatus}>
          <input type="hidden" name="id" value={gym.id} />
          <input type="hidden" name="_back" value="detail" />
          <input type="hidden" name="status" value={gym.status === "active" ? "suspended" : "active"} />
          <ConfirmSubmitButton
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            message={gym.status === "active" ? t.gyms.confirmSuspend(gym.name) : t.gyms.confirmReactivate(gym.name)}
          >
            {gym.status === "active" ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
            {gym.status === "active" ? t.gyms.suspend : t.gyms.reactivate}
          </ConfirmSubmitButton>
        </form>
      </section>

      <section className={sectionClass}>
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-semibold">{t.gyms.managers}</h2>
          <p className="text-xs text-foreground/60">{t.gyms.managersHelp}</p>
        </div>

        {managers.length === 0 ? (
          <p className="text-sm text-foreground/60">{t.gyms.noManagers}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {managers.map((m) => (
              <li key={m.person_id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{m.full_name}</span>
                  <span className="truncate text-xs text-foreground/60">
                    {m.email ?? ""}
                    {m.auth_user_id ? "" : ` · ${t.gyms.noAccount}`}
                  </span>
                  {m.since ? (
                    <span className="text-xs text-foreground/45">{t.gyms.managerSince(formatDate(m.since))}</span>
                  ) : null}
                </div>
                {m.auth_user_id ? (
                  <RowMenu label={t.gyms.managerMenu}>
                    <form action={resetManagerPassword}>
                      <input type="hidden" name="gym_id" value={gym.id} />
                      <input type="hidden" name="user_id" value={m.auth_user_id} />
                      <ConfirmSubmitButton className={menuItemClass} message={t.gyms.confirmReset(m.email ?? "")}>
                        <KeyIcon className={menuIconClass} />
                        {t.gyms.resetPassword}
                      </ConfirmSubmitButton>
                    </form>
                    <form action={revokeManager}>
                      <input type="hidden" name="gym_id" value={gym.id} />
                      <input type="hidden" name="user_id" value={m.auth_user_id} />
                      <ConfirmSubmitButton className={menuItemClass} message={t.gyms.confirmRevoke(m.email ?? "")}>
                        <UserMinusIcon className={menuIconClass} />
                        {t.gyms.revoke}
                      </ConfirmSubmitButton>
                    </form>
                  </RowMenu>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <form action={addManager} className="flex flex-col gap-3 border-t border-border pt-4">
          <input type="hidden" name="gym_id" value={gym.id} />
          <p className="text-xs text-foreground/55">{t.registro.temporaryPasswordNote}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="full_name" className="text-sm font-medium">{t.gyms.managerName}</label>
              <input id="full_name" name="full_name" required className={fieldClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium">{t.gyms.managerEmail}</label>
              <input id="email" name="email" type="email" required className={fieldClass} />
            </div>
          </div>
          <button type="submit" className="flex w-fit items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
            <UserPlusIcon className="h-4 w-4" />
            {t.gyms.addManager}
          </button>
        </form>
      </section>

      <section className={`${sectionClass} border-danger/40`}>
        <h2 className="font-heading text-lg font-semibold text-danger">{t.gyms.danger}</h2>
        <p className="text-xs text-foreground/60">{t.gyms.dangerHelp}</p>
        {gym.status !== "suspended" ? (
          <p className="text-sm text-foreground/70">{t.gyms.dangerNeedsSuspension}</p>
        ) : (
          <form action={deleteGym} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={gym.id} />
            <label htmlFor="confirm_name" className="text-sm font-medium">{t.gyms.confirmName(gym.name)}</label>
            <input id="confirm_name" name="confirm_name" required autoComplete="off" className={fieldClass} />
            <ConfirmSubmitButton
              className="flex w-fit items-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              message={t.gyms.confirmDelete(gym.name)}
            >
              <TrashIcon className="h-4 w-4" />
              {t.gyms.delete}
            </ConfirmSubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}
