import Link from "next/link";
import { notFound } from "next/navigation";
import { BELT_LABELS, ROLE_LABELS } from "@/utils/supabase/profile";
import { requireRegistryViewer } from "@/utils/supabase/require-admin";
import { daysSince, formatDays } from "@/utils/dates";
import {
  ChevronLeftIcon,
  FileTextIcon,
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";

type Member = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  joined_at: string;
  current_belt: string;
  current_stripes: number;
  rank_since: string;
  stripe_since: string | null;
  notes: string | null;
};

type RoleRow = {
  role: string;
  start_date: string;
  end_date: string | null;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-foreground/55">{label}</dt>
      <dd className="text-sm font-medium break-words">{value}</dd>
    </div>
  );
}

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  // Same gate as the list: staff only, 404 for everyone else.
  const { supabase, access } = await requireRegistryViewer(`/registro/${id}`);

  // Read from `person`, not from `member_overview`: a single record needs no
  // pre-joined roles array, and the table carries `notes`, which the list view
  // leaves out. Same RLS applies either way, so nothing is loosened by it.
  const { data } = await supabase
    .from("person")
    .select(
      "id, auth_user_id, full_name, email, phone, birth_date, joined_at, current_belt, current_stripes, rank_since, stripe_since, notes",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    notFound();
  }

  const member = data as Member;

  const { data: hours } = await supabase
    .from("person_hours")
    .select("total_hours")
    .eq("person_id", member.id)
    .maybeSingle();

  const totalHours = Number(hours?.total_hours ?? 0);

  // The full history, closed assignments included — the registry is meant to
  // show that a person's role changed over time, not just what it is today.
  const { data: roleRows } = await supabase
    .from("assigned_role")
    .select("role, start_date, end_date")
    .eq("person_id", member.id)
    .order("start_date", { ascending: false });

  const roles = (roleRows ?? []) as RoleRow[];
  // Carries the list's filters and page back, so closing the detail view
  // returns to exactly the list you opened it from.
  const backHref = from ? `/registro?${from}` : "/registro";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 sm:gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href={backHref}
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-foreground/60 hover:text-foreground"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Registro
        </Link>

        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {member.full_name}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-secondary/40 px-2.5 py-0.5 text-xs font-medium">
            {BELT_LABELS[member.current_belt] ?? member.current_belt}
            {member.current_stripes > 0
              ? ` · ${member.current_stripes} tacc${member.current_stripes === 1 ? "a" : "he"}`
              : ""}
          </span>
          {member.auth_user_id ? null : (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-foreground/55">
              senza account
            </span>
          )}
        </div>

        {access.canEditRegistry ? null : (
          <p className="text-sm text-foreground/60">
            Sola lettura: con il tuo ruolo di istruttore la scheda non è
            modificabile.
          </p>
        )}
      </header>

      <section className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:gap-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <UserIcon className="h-4.5 w-4.5 shrink-0 text-accent" />
          Anagrafica
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <Field label="Email" value={member.email ?? "—"} />
          <Field label="Telefono" value={member.phone ?? "—"} />
          <Field label="Data di nascita" value={member.birth_date ?? "—"} />
          <Field label="Iscritto dal" value={member.joined_at} />
        </dl>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:gap-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <TrendingUpIcon className="h-4.5 w-4.5 shrink-0 text-accent" />
          Percorso
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <Field
            label="Cintura"
            value={BELT_LABELS[member.current_belt] ?? member.current_belt}
          />
          <Field label="Tacche" value={String(member.current_stripes)} />
          <Field label="Cambio cintura da" value={member.rank_since} />
          <Field label="Ultima tacca" value={member.stripe_since ?? "—"} />
          <Field
            label="Da quanto fa BJJ"
            value={formatDays(daysSince(member.joined_at))}
          />
          <Field
            label="Da quanto ha questa cintura"
            value={formatDays(daysSince(member.rank_since))}
          />
          <Field
            label="Dall'ultima tacca"
            value={formatDays(daysSince(member.stripe_since))}
          />
          <Field
            label="Ore totali"
            value={`${totalHours.toFixed(1)} ore`}
          />
        </dl>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border p-4 sm:gap-3 sm:p-5">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <FileTextIcon className="h-4.5 w-4.5 shrink-0 text-accent" />
          Note
        </h2>
        <p className="text-sm whitespace-pre-wrap text-foreground/80">
          {member.notes ?? "—"}
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:gap-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <UsersIcon className="h-4.5 w-4.5 shrink-0 text-accent" />
          Ruoli
        </h2>

        {roles.length === 0 ? (
          <p className="text-sm text-foreground/60">Nessun ruolo assegnato.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {roles.map((role) => (
              <li
                key={`${role.role}-${role.start_date}`}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="text-sm font-medium">
                  {ROLE_LABELS[role.role] ?? role.role}
                </span>
                <span className="text-xs text-foreground/55">
                  {role.end_date
                    ? `dal ${role.start_date} al ${role.end_date}`
                    : `dal ${role.start_date} · attivo`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
