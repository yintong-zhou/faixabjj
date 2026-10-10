import Link from "next/link";
import { AlertCircleIcon } from "@/components/icons";
import { PasswordInput } from "@/components/password-input";
import { getDictionary } from "@/utils/i18n/server";
import { accountForLink } from "@/utils/supabase/admin";
import { resetPassword } from "./actions";

// Reached from the link /forgot-password emails: ?token= is this app's own
// signed link (utils/auth-link-token.ts), checked here and again by the
// action. No session is involved — the link is the proof.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const { t } = await getDictionary();

  if (!(await accountForLink(token, "reset"))) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.reset.invalidTitle}
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          {t.reset.invalidLead}
        </p>
        <Link
          href="/forgot-password"
          className="w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {t.reset.requestNewLink}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 sm:gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.reset.title}
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">{t.reset.lead}</p>
      </div>

      <form action={resetPassword} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
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
          {t.reset.saveButton}
        </button>
      </form>
    </div>
  );
}
