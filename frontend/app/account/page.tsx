import Link from "next/link";
import { PasswordInput } from "@/components/password-input";
import { requireAdmin, canManageUsers } from "@/utils/supabase/require-admin";
import {
  BELT_LABELS,
  ROLE_LABELS,
  getOrCreateProfile,
} from "@/utils/supabase/profile";
import { updatePassword, updateProfile } from "./actions";

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const { supabase, userId, email } = await requireAdmin("/account");
  const profile = await getOrCreateProfile(supabase, userId, email);
  const isManager = await canManageUsers(supabase);

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-xl pt-6">
        <p className="rounded-lg bg-accent/10 px-3.5 py-2.5 text-sm text-accent">
          Il tuo profilo non è disponibile. Se il problema persiste, controlla
          che le migration del database siano state applicate.
        </p>
      </div>
    );
  }

  const { data: roles } = await supabase
    .from("assigned_role")
    .select("role, start_date")
    .eq("person_id", profile.id)
    .is("end_date", null)
    .order("start_date");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 pt-6 sm:pt-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Il mio account
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          Gestisci i tuoi dati personali e le credenziali di accesso.
        </p>
      </header>

      {ok ? (
        <p className="rounded-lg bg-secondary/30 px-3.5 py-2.5 text-sm">{ok}</p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-accent/10 px-3.5 py-2.5 text-sm text-accent">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-4 rounded-xl border border-border p-5">
        <h2 className="font-heading text-lg font-semibold">Dati personali</h2>

        <form action={updateProfile} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="full_name" className="text-sm font-medium">
              Nome e cognome
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
              Email
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
              Cambiando indirizzo riceverai una email di conferma: il nuovo
              indirizzo diventa attivo solo dopo averla aperta.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="phone" className="text-sm font-medium">
                Telefono
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
                Data di nascita
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
              Note
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
            Salva modifiche
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border p-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-semibold">Grado e ruoli</h2>
          <p className="text-xs text-foreground/55">
            Cintura, tacche e ruoli non sono modificabili da qui: la promozione
            resta una decisione dell&apos;istruttore.
          </p>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-foreground/55">
              Cintura
            </dt>
            <dd className="text-sm font-medium">
              {BELT_LABELS[profile.current_belt] ?? profile.current_belt}
              {profile.current_stripes > 0
                ? ` · ${profile.current_stripes} tacc${profile.current_stripes === 1 ? "a" : "he"}`
                : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-foreground/55">
              Cambio cintura da
            </dt>
            <dd className="text-sm font-medium">{profile.rank_since}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-foreground/55">
              Ultima tacca
            </dt>
            <dd className="text-sm font-medium">{profile.stripe_since ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-foreground/55">
              Iscritto dal
            </dt>
            <dd className="text-sm font-medium">{profile.joined_at}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-foreground/55">
              Ruoli attivi
            </dt>
            <dd className="text-sm font-medium">
              {roles && roles.length > 0
                ? roles
                    .map((r) => ROLE_LABELS[r.role as string] ?? r.role)
                    .join(", ")
                : "Nessuno"}
            </dd>
          </div>
        </dl>

        {isManager ? (
          <Link
            href="/registro"
            className="self-start text-sm font-medium text-accent hover:opacity-80"
          >
            Gestisci i membri dal Registro →
          </Link>
        ) : null}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border p-5">
        <h2 className="font-heading text-lg font-semibold">Password</h2>

        <form action={updatePassword} className="flex flex-col gap-4">
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
            <p className="text-xs text-foreground/55">Almeno 8 caratteri.</p>
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

          <button
            type="submit"
            className="mt-1 self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Aggiorna password
          </button>
        </form>
      </section>
    </div>
  );
}
