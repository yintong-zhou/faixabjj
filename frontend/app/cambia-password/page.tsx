import { AlertCircleIcon } from "@/components/icons";
import { PasswordInput } from "@/components/password-input";
import { requireSession } from "@/utils/supabase/require-admin";
import { changePassword } from "./actions";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // requireSession, not requireAdmin: requireAdmin would redirect a user with a
  // pending change straight back to this page, forever.
  const { mustChangePassword } = await requireSession("/cambia-password");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 sm:gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {mustChangePassword ? "Scegli la tua password" : "Cambia password"}
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          {mustChangePassword
            ? "Il tuo account è stato creato con una password provvisoria, uguale per tutti. Scegline una tua per continuare: fino ad allora il resto dell’app resta chiuso."
            : "Imposta una nuova password per il tuo account."}
        </p>
      </div>

      <form action={changePassword} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Nuova password
          </label>
          <PasswordInput
            id="password"
            name="password"
            required
            autoComplete="new-password"
          />
          <p className="text-xs text-foreground/55">
            Almeno 8 caratteri, e diversa da quella provvisoria.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm_password" className="text-sm font-medium">
            Conferma password
          </label>
          <PasswordInput
            id="confirm_password"
            name="confirm_password"
            required
            autoComplete="new-password"
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
          Salva e continua
        </button>
      </form>
    </div>
  );
}
