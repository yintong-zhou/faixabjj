import Link from "next/link";
import { AlertCircleIcon } from "@/components/icons";
import { PasswordInput } from "@/components/password-input";
import { getDictionary } from "@/utils/i18n/server";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const { t } = await getDictionary();

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 sm:gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.auth.signInTitle}
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          {t.auth.signInLead}
        </p>
      </div>

      <form action={login} className="flex flex-col gap-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            {t.auth.email}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium">
              {t.auth.password}
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-accent hover:opacity-80"
            >
              {t.auth.forgotLink}
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            required
            autoComplete="current-password"
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
          {t.auth.signInButton}
        </button>
      </form>
    </div>
  );
}
