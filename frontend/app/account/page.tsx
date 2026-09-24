import Link from "next/link";
import { Belt } from "@/components/belt";
import { formatDate, todayIn } from "@/utils/dates";
import { getDictionary } from "@/utils/i18n/server";
import { formatHours, hoursFor } from "@/utils/hours";
import { isPortalOnly } from "@/utils/members";
import { PasswordInput } from "@/components/password-input";
import { requireAdmin } from "@/utils/supabase/require-admin";
import { requireGymSettings } from "@/utils/supabase/gym";
import {
  getOrCreateProfile,
  roleLabel,
} from "@/utils/supabase/profile";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  KeyIcon,
  TrendingUpIcon,
  UserIcon,
} from "@/components/icons";
import { updatePassword, updateProfile } from "./actions";

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const { t } = await getDictionary();

  // Used by every branch below — the superadmin's page included — so it is
  // built once, right after the dictionary it is the only thing it reads.
  const passwordSection = (
    <section className="flex flex-col gap-4 rounded-xl border border-border p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
        <KeyIcon className="h-4.5 w-4.5 shrink-0 text-accent" />
        {t.account.passwordSection}
      </h2>

      <form action={updatePassword} className="flex flex-col gap-3 sm:gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            {t.auth.newPassword}
          </label>
          <PasswordInput
            id="password"
            name="password"
            required
            autoComplete="new-password"
            showLabel={t.auth.showPassword}
            hideLabel={t.auth.hidePassword}
          />
          <p className="text-xs text-foreground/55">
            {t.account.passwordMinimum}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm_password" className="text-sm font-medium">
            {t.auth.confirmPassword}
          </label>
          <PasswordInput
            id="confirm_password"
            name="confirm_password"
            required
            autoComplete="new-password"
            showLabel={t.auth.showPassword}
            hideLabel={t.auth.hidePassword}
          />
        </div>

        <button
          type="submit"
          className="mt-1 self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {t.account.updatePassword}
        </button>
      </form>
    </section>
  );

  const { supabase, userId, email, access } = await requireAdmin("/account");

  // The platform superadmin has no person row: no gym, no belt, no hours. Their
  // account is an email and a password, and nothing else is drawn.
  if (access.isPlatformAdmin) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-5 sm:gap-5 sm:py-7">
        <h1 className="font-heading text-xl font-semibold sm:text-2xl">{t.nav.account}</h1>
        <p className="text-sm text-foreground/70">{email}</p>
        <p className="text-xs text-foreground/55">{t.account.platformAdmin}</p>
        {passwordSection}
      </div>
    );
  }

  const profile = await getOrCreateProfile(supabase, userId, email);

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-xl">
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {t.account.profileUnavailable}
          </span>
        </p>
      </div>
    );
  }

  const gym = await requireGymSettings();

  const { data: hours } = await supabase
    .from("person_hours")
    .select("total_hours")
    .eq("person_id", profile.id)
    .maybeSingle();

  const training = hoursFor(profile.joined_at, hours?.total_hours, {
    ...gym,
    today: todayIn(gym.timezone),
  });

  const { data: roles } = await supabase
    .from("assigned_role")
    .select("role, start_date")
    .eq("person_id", profile.id)
    .is("end_date", null)
    .order("start_date");

  // A portal-only admin runs the app and does not train, so they hold no belt.
  // `person.current_belt` is `not null default 'white'`, which is exactly why
  // none of the rank block may be drawn for them: it would show a white belt
  // nobody was ever given, and dates and hours that mean nothing.
  const portalOnly = isPortalOnly((roles ?? []).map((r) => r.role as string));
  const isManager = access.canManageUsers;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 sm:gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.account.title}
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          {t.account.lead}
        </p>
      </header>

      {ok ? (
        <p className="flex items-start gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {ok}
        </p>
      ) : null}
      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-4 rounded-xl border border-border p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <UserIcon className="h-4.5 w-4.5 shrink-0 text-accent" />
          {t.account.personalData}
        </h2>

        <form action={updateProfile} className="flex flex-col gap-3 sm:gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="full_name" className="text-sm font-medium">
              {t.account.fullName}
            </label>
            <input
              id="full_name"
              name="full_name"
              required
              defaultValue={profile.full_name}
              autoComplete="name"
              className={fieldClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              {t.auth.email}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={email ?? ""}
              autoComplete="email"
              className={fieldClass}
            />
            <p className="text-xs text-foreground/55">
              {t.account.emailChangeNote}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="phone" className="text-sm font-medium">
                {t.account.phone}
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={profile.phone ?? ""}
                autoComplete="tel"
                className={fieldClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="birth_date" className="text-sm font-medium">
                {t.account.birthDate}
              </label>
              <input
                id="birth_date"
                name="birth_date"
                type="date"
                defaultValue={profile.birth_date ?? ""}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="notes" className="text-sm font-medium">
              {t.account.notes}
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={profile.notes ?? ""}
              className={`${fieldClass} resize-y`}
            />
          </div>

          <button
            type="submit"
            className="mt-1 self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            {t.common.saveChanges}
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
            <TrendingUpIcon className="h-4.5 w-4.5 shrink-0 text-accent" />
            {portalOnly ? t.registro.rolesSection : t.account.rankAndRoles}
          </h2>
          {portalOnly ? null : (
            <p className="text-xs text-foreground/55">
              {t.account.rankReadOnly}
            </p>
          )}
          {!portalOnly && training.isPartlyEstimated ? (
            <p className="text-xs leading-relaxed text-foreground/55">
              {t.account.openingBalanceNote(gym.lessonsPerWeek)}
            </p>
          ) : null}
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {portalOnly ? null : (
            <>
            <div>
              <dt className="text-xs uppercase tracking-wide text-foreground/55">
                {t.account.belt}
              </dt>
              <dd className="text-sm font-medium">
                <Belt
                  belt={profile.current_belt}
                  stripes={profile.current_stripes}
                  size="md"
                  className="mt-0.5"
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-foreground/55">
                {t.account.beltSince}
              </dt>
              <dd className="text-sm font-medium">{formatDate(profile.rank_since)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-foreground/55">
                {t.account.stripeSince}
              </dt>
              <dd className="text-sm font-medium">{formatDate(profile.stripe_since)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-foreground/55">
                {t.account.joinedOn}
              </dt>
              <dd className="text-sm font-medium">{formatDate(profile.joined_at)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-foreground/55">
                {t.account.classHours}
              </dt>
              <dd className="text-sm font-medium">
                {formatHours(training.total, t)}
                {training.isPartlyEstimated ? (
                  <span className="font-normal text-foreground/55">
                    {" "}
                    {t.account.estimateSuffix}
                  </span>
                ) : null}
              </dd>
            </div>
            </>
          )}
          <div>
            <dt className="text-xs uppercase tracking-wide text-foreground/55">
              {t.account.activeRoles}
            </dt>
            <dd className="text-sm font-medium">
              {roles && roles.length > 0
                ? roles
                    .map((r) => roleLabel(r.role as string, t))
                    .join(", ")
                : t.common.none}
            </dd>
          </div>
        </dl>

        {isManager ? (
          <div className="flex flex-col gap-2">
            <Link
              href="/members"
              className="self-start text-sm font-medium text-accent hover:opacity-80"
            >
              {t.account.manageMembers}
            </Link>
            <Link
              href="/gym"
              className="self-start text-sm font-medium text-accent hover:opacity-80"
            >
              {t.account.myGym}
            </Link>
          </div>
        ) : null}
      </section>

      {passwordSection}
    </div>
  );
}
