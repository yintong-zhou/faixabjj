import Link from "next/link";
import { AlertCircleIcon } from "@/components/icons";
import { getDictionary } from "@/utils/i18n/server";
import { accountForLink } from "@/utils/supabase/admin";
import { confirmEmailChange } from "./actions";

// Reached from the link /account emails to the new address. Opening it
// changes nothing: the change waits for the button, because mail scanners
// open every link in a message on their own.
export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string; failed?: string }>;
}) {
  const { token, done, failed } = await searchParams;
  const { t } = await getDictionary();

  if (done === "1") {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.confirmEmail.doneTitle}
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">{t.confirmEmail.doneLead}</p>
        <Link
          href="/login"
          className="mt-4 w-fit text-sm font-medium text-accent hover:opacity-80"
        >
          {t.auth.backToLogin}
        </Link>
      </div>
    );
  }

  const account = await accountForLink(token, "email");

  if (!account?.link.e) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.confirmEmail.invalidTitle}
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          {t.confirmEmail.invalidLead}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 sm:gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.confirmEmail.title}
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          {t.confirmEmail.lead(account.link.e)}
        </p>
      </div>

      <form action={confirmEmailChange} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />

        {failed === "1" ? (
          <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
            <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {t.confirmEmail.failed}
          </p>
        ) : null}

        <button
          type="submit"
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {t.confirmEmail.button}
        </button>
      </form>
    </div>
  );
}
