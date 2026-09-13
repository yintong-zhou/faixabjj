import { AlertCircleIcon } from "@/components/icons";
import { PasswordInput } from "@/components/password-input";
import { requireSession } from "@/utils/supabase/require-admin";
import { getDictionary } from "@/utils/i18n/server";
import { changePassword } from "./actions";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { t } = await getDictionary();
  // requireSession, not requireAdmin: requireAdmin would redirect a user with a
  // pending change straight back to this page, forever.
  const { mustChangePassword } = await requireSession("/cambia-password");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 sm:gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {mustChangePassword ? t.auth.changeTitleForced : t.auth.changeTitle}
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          {mustChangePassword ? t.auth.changeLeadForced : t.auth.changeLead}
        </p>
      </div>

      <form action={changePassword} className="flex flex-col gap-4">
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
            {t.auth.passwordHint}
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

        {error ? (
          <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
            <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="mt-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {t.auth.changeButton}
        </button>
      </form>
    </div>
  );
}
