import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { RowMenu } from "@/components/row-menu";
import { isAdminClientConfigured } from "@/utils/supabase/admin";
import { requireRegistryViewer } from "@/utils/supabase/require-admin";
import { BELT_LABELS, ROLE_LABELS } from "@/utils/supabase/profile";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  FilterIcon,
  KeyIcon,
  MailIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "@/components/icons";
import { daysSince, formatDays } from "@/utils/dates";
import { DEFAULT_PASSWORD } from "@/utils/default-password";
import {
  addPerson,
  inviteToPortal,
  revokeAccess,
  setTemporaryPassword,
} from "./actions";

const PAGE_SIZE = 20;

const menuItemClass =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-neutral-light/60";

const menuIconClass = "h-4 w-4 shrink-0";

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";

type Member = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string | null;
  joined_at: string;
  current_belt: string;
  current_stripes: number;
  rank_since: string;
  stripe_since: string | null;
  active_roles: string[];
  is_active: boolean;
  total_hours: number;
};

type Search = {
  q?: string;
  ruolo?: string;
  cintura?: string;
  attivi?: string;
  p?: string;
  ok?: string;
  error?: string;
};

// The filter state lives in the URL rather than in client state: the list is
// then shareable, survives a reload, and the page needs no client JS at all.
function queryString(search: Search, overrides: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const key of ["q", "ruolo", "cintura", "attivi", "p"] as const) {
    const value = overrides[key] ?? search[key];
    if (value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return params.toString();
}

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  // Staff only: an allievo or assistente gets a 404 here, not a redirect.
  const { supabase, access } = await requireRegistryViewer("/registro");

  const page = Math.max(1, Number.parseInt(search.p ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("member_overview")
    .select("*", { count: "exact" })
    .order("full_name");

  // Name only — searching by email was explicitly excluded. The strip keeps a
  // stray comma or parenthesis from breaking PostgREST's filter syntax.
  const term = (search.q ?? "").trim().replace(/[%,()\\]/g, "");
  if (term) {
    query = query.ilike("full_name", `%${term}%`);
  }
  if (search.ruolo) {
    query = query.contains("active_roles", [search.ruolo]);
  }
  if (search.cintura) {
    query = query.eq("current_belt", search.cintura);
  }
  if (search.attivi) {
    query = query.eq("is_active", true);
  }

  const { data, count, error: queryError } = await query.range(
    from,
    from + PAGE_SIZE - 1,
  );

  const members = (data ?? []) as Member[];
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentQuery = queryString(search);

  // `p` is paging, not filtering — it must not make the panel look active or
  // open itself on page 2 of an unfiltered list.
  const activeFilters = [
    search.q ? `"${search.q}"` : null,
    search.ruolo ? ROLE_LABELS[search.ruolo] ?? search.ruolo : null,
    search.cintura ? BELT_LABELS[search.cintura] ?? search.cintura : null,
    search.attivi ? "solo attivi" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="flex w-full flex-col gap-4 sm:gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Registro</h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          {access.canEditRegistry
            ? "Panoramica di tutti i membri della palestra. Da qui aggiungi una persona e gestisci i suoi accessi."
            : "Panoramica di tutti i membri della palestra. Con il tuo ruolo di istruttore la sezione è in sola lettura."}
        </p>
      </header>

      {search.ok ? (
        <p className="flex items-start gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {search.ok}
        </p>
      ) : null}
      {search.error ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {search.error}
        </p>
      ) : null}
      {queryError ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Non è stato possibile caricare il registro. Controlla che le
            migration del database siano state applicate.
          </span>
        </p>
      ) : null}

      {access.canEditRegistry ? (
        <details className="rounded-xl border border-border">
          <summary className="cursor-pointer px-4 py-3 font-heading text-base font-semibold sm:px-5 sm:py-4">
            <UserPlusIcon className="mr-2 inline-block h-4.5 w-4.5 align-[-0.2em] text-accent" />
            Aggiungi persona
          </summary>

          <form action={addPerson} className="flex flex-col gap-3 px-4 pb-4 sm:gap-4 sm:px-5 sm:pb-5">
            <input type="hidden" name="_query" value={currentQuery} />

            <p className="text-xs text-foreground/55">
              Viene creato anche l&apos;account, subito attivo e senza email di
              conferma. Password provvisoria:{" "}
              <code className="rounded bg-neutral-light/60 px-1.5 py-0.5 font-medium">
                {DEFAULT_PASSWORD}
              </code>{" "}
              — comunicala alla persona. Al primo accesso le verrà chiesto di
              sostituirla prima di poter usare il resto dell&apos;app.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="full_name" className="text-sm font-medium">
                  Nome e cognome
                </label>
                <input id="full_name" name="full_name" required className={fieldClass} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className={fieldClass}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="phone" className="text-sm font-medium">
                  Telefono
                </label>
                <input id="phone" name="phone" type="tel" className={fieldClass} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="birth_date" className="text-sm font-medium">
                  Data di nascita
                </label>
                <input
                  id="birth_date"
                  name="birth_date"
                  type="date"
                  className={fieldClass}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="current_belt" className="text-sm font-medium">
                  Cintura
                </label>
                <select
                  id="current_belt"
                  name="current_belt"
                  required
                  defaultValue=""
                  className={fieldClass}
                >
                  <option value="" disabled>
                    Seleziona…
                  </option>
                  {Object.entries(BELT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="current_stripes" className="text-sm font-medium">
                  Tacche
                </label>
                <select
                  id="current_stripes"
                  name="current_stripes"
                  defaultValue="0"
                  className={fieldClass}
                >
                  {[0, 1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="rank_since" className="text-sm font-medium">
                  Cambio cintura da{" "}
                  <span className="text-foreground/50">(oggi se vuoto)</span>
                </label>
                <input
                  id="rank_since"
                  name="rank_since"
                  type="date"
                  className={fieldClass}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="stripe_since" className="text-sm font-medium">
                  Ultima tacca <span className="text-foreground/50">(oggi se vuoto)</span>
                </label>
                <input
                  id="stripe_since"
                  name="stripe_since"
                  type="date"
                  className={fieldClass}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="joined_at" className="text-sm font-medium">
                  Iscritto dal
                </label>
                <input
                  id="joined_at"
                  name="joined_at"
                  type="date"
                  required
                  className={fieldClass}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="role" className="text-sm font-medium">
                Ruolo
              </label>
              <select
                id="role"
                name="role"
                required
                defaultValue=""
                className={fieldClass}
              >
                <option value="" disabled>
                  Seleziona…
                </option>
                <option value="student">Allievo</option>
                <option value="assistant">Assistente</option>
                <option value="instructor">Istruttore</option>
                <option value="head_coach">Maestro</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="notes" className="text-sm font-medium">
                Note
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={2}
                className={`${fieldClass} resize-y`}
              />
            </div>

            <button
              type="submit"
              className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Aggiungi al registro
            </button>
          </form>
        </details>
      ) : null}

      {/* Open only when something is filtering: an untouched list keeps the
          panel out of the way, a filtered one shows why it is short. */}
      <details open={activeFilters.length > 0} className="rounded-xl border border-border">
        <summary className="cursor-pointer px-4 py-3 font-heading text-base font-semibold sm:px-5 sm:py-4">
          <FilterIcon className="mr-2 inline-block h-4.5 w-4.5 align-[-0.2em] text-accent" />
          Filtri
          {activeFilters.length > 0 ? (
            <span className="font-body text-xs font-normal text-foreground/60">
              {" · "}
              {activeFilters.join(" · ")}
            </span>
          ) : null}
        </summary>

        <form
          method="get"
          action="/registro"
          className="flex flex-col gap-2.5 px-4 pb-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3 sm:px-5 sm:pb-5"
        >
          <div className="flex min-w-52 flex-1 flex-col gap-1.5">
            <label htmlFor="q" className="text-xs font-medium text-foreground/65">
              Nome
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={search.q ?? ""}
              placeholder="Cerca per nome"
              className={fieldClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ruolo" className="text-xs font-medium text-foreground/65">
              Ruolo
            </label>
            <select
              id="ruolo"
              name="ruolo"
              defaultValue={search.ruolo ?? ""}
              className={fieldClass}
            >
              <option value="">Tutti</option>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="cintura" className="text-xs font-medium text-foreground/65">
              Cintura
            </label>
            <select
              id="cintura"
              name="cintura"
              defaultValue={search.cintura ?? ""}
              className={fieldClass}
            >
              <option value="">Tutte</option>
              {Object.entries(BELT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 py-2.5 text-sm">
            <input
              type="checkbox"
              name="attivi"
              value="1"
              defaultChecked={Boolean(search.attivi)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Solo membri attivi
          </label>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Filtra
            </button>
            {activeFilters.length > 0 ? (
              <Link
                href="/registro"
                className="rounded-full border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-neutral-light/60"
              >
                Azzera
              </Link>
            ) : null}
          </div>
        </form>
      </details>

      <p className="text-sm text-foreground/60">
        {total === 0
          ? "Nessun membro trovato."
          : `${total} membr${total === 1 ? "o" : "i"} · pagina ${page} di ${lastPage}`}
      </p>

      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {members.map((member) => {
          const canInvite =
            !member.auth_user_id && member.email && isAdminClientConfigured();
          const canManageAccount = Boolean(member.auth_user_id);

          // items-center keeps the kebab vertically centred against the row,
          // whose height is set by the details block on the left.
          return (
            <li key={member.id} className="flex items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:p-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {member.full_name}
                  <span className="rounded-full bg-secondary/40 px-2 py-0.5 text-xs font-normal">
                    {BELT_LABELS[member.current_belt] ?? member.current_belt}
                    {member.current_stripes > 0 ? ` · ${member.current_stripes}` : ""}
                  </span>
                  {member.auth_user_id ? null : (
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-foreground/55">
                      senza account
                    </span>
                  )}
                </span>


                {/* Two counters, from two different dates: how long they have
                    trained at all (joined_at) and how long at the current rank
                    (rank_since) — the second is what promotion eligibility
                    actually hangs on. */}
                <span className="text-xs text-foreground/70">
                  {formatDays(daysSince(member.joined_at))} di BJJ
                  {" · "}
                  {formatDays(daysSince(member.rank_since))} con la cintura{" "}
                  {(BELT_LABELS[member.current_belt] ?? member.current_belt).toLowerCase()}
                </span>

                <span className="text-xs text-foreground/55">
                  {member.active_roles.length > 0
                    ? member.active_roles.map((r) => ROLE_LABELS[r] ?? r).join(", ")
                    : "Nessun ruolo attivo"}
                  {" · "}
                  {Number(member.total_hours).toFixed(1)} ore
                  {" · dal "}
                  {member.joined_at}
                </span>
              </div>

              {/* Every action sits behind the kebab so none of them — least of
                  all revoking access — can be hit by a stray tap while
                  scrolling the list. */}
              <RowMenu label={`Azioni per ${member.full_name}`}>
                <Link
                  href={`/registro/${member.id}?from=${encodeURIComponent(currentQuery)}`}
                  className={menuItemClass}
                >
                  <FileTextIcon className={menuIconClass} />
                  Dettagli
                </Link>

                {access.canEditRegistry && canInvite ? (
                    <form action={inviteToPortal}>
                      <input type="hidden" name="_query" value={currentQuery} />
                      <input type="hidden" name="email" value={member.email ?? ""} />
                      <input type="hidden" name="full_name" value={member.full_name} />
                      <button type="submit" className={menuItemClass}>
                        <MailIcon className={menuIconClass} />
                        Invita al portale
                      </button>
                    </form>
                  ) : null}

                {access.canEditRegistry && canManageAccount ? (
                    <>
                      {/* The provisional password is the shared default, not
                          a chosen one, so the menu shows no field: nothing here
                          has to be read back off the screen. */}
                      <form action={setTemporaryPassword}>
                        <input type="hidden" name="_query" value={currentQuery} />
                        <input
                          type="hidden"
                          name="user_id"
                          value={member.auth_user_id ?? ""}
                        />
                        <ConfirmSubmitButton
                          message={`Reimpostare la password di ${member.full_name} su quella provvisoria? La password attuale smetterà di funzionare.`}
                          className={menuItemClass}
                        >
                          <KeyIcon className={menuIconClass} />
                          Reimposta password
                        </ConfirmSubmitButton>
                      </form>

                      <form action={revokeAccess}>
                        <input type="hidden" name="_query" value={currentQuery} />
                        <input
                          type="hidden"
                          name="user_id"
                          value={member.auth_user_id ?? ""}
                        />
                        <ConfirmSubmitButton
                          message={`Revocare l'accesso a ${member.full_name}? La scheda resta nel registro, ma la persona non potrà più entrare nel portale.`}
                          className={`${menuItemClass} text-accent hover:bg-accent/10`}
                        >
                          <UserMinusIcon className={menuIconClass} />
                          Revoca accesso
                        </ConfirmSubmitButton>
                      </form>
                    </>
                  ) : null}
              </RowMenu>
            </li>
          );
        })}

        {members.length === 0 ? (
          <li className="px-3 py-3 text-sm text-foreground/60 sm:p-4">
            Nessun membro corrisponde ai filtri scelti.
          </li>
        ) : null}
      </ul>

      {lastPage > 1 ? (
        <nav className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link
              href={`/registro?${queryString(search, { p: String(page - 1) })}`}
              className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-light/60"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Precedente
            </Link>
          ) : (
            <span />
          )}

          {page < lastPage ? (
            <Link
              href={`/registro?${queryString(search, { p: String(page + 1) })}`}
              className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-light/60"
            >
              Successiva
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
