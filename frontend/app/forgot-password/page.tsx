import Link from "next/link";
import { requestPasswordReset } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  if (sent) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col gap-2 pt-6 sm:pt-16">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Controlla la tua email
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          Se l&apos;indirizzo è registrato, riceverai a breve un link per
          reimpostare la password.
        </p>
        <Link
          href="/login"
          className="mt-4 w-fit text-sm font-medium text-accent hover:opacity-80"
        >
          Torna al login
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-8 pt-6 sm:pt-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Password dimenticata
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          Inserisci la tua email: se l&apos;account esiste, ti mandiamo un
          link per reimpostare la password.
        </p>
      </div>

      <form action={requestPasswordReset} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
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

        <button
          type="submit"
          className="mt-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Invia link
        </button>
      </form>

      <Link href="/login" className="w-fit text-sm font-medium text-accent hover:opacity-80">
        Torna al login
      </Link>
    </div>
  );
}
