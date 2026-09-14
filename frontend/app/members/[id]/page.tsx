import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Belt } from "@/components/belt";
import { roleLabel } from "@/utils/supabase/profile";
import { getDictionary } from "@/utils/i18n/server";
import { requireRegistryViewer } from "@/utils/supabase/require-admin";
import { daysSince, formatDate, formatDays } from "@/utils/dates";
import { LESSONS_PER_WEEK, TRACKING_STARTED_ON, formatHours, hoursFor } from "@/utils/hours";
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

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-foreground/55">{label}</dt>
      <dd className="text-sm font-medium break-words">{children ?? value}</dd>
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
  const { t } = await getDictionary();
  // Same gate as the list: staff only, 404 for everyone else.
  const { supabase, access } = await requireRegistryViewer(`/members/${id}`);

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

  // The detail page breaks the total open: on a record that decides a
  // promotion, "18 ore" is not enough — you need to know how much of it the
  // gym actually saw.
  const training = hoursFor(member.joined_at, hours?.total_hours);

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
  const backHref = from ? `/members?${from}` : "/members";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 sm:gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href={backHref}
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-foreground/60 hover:text-foreground"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          {t.registro.backToRegistry}
        </Link>

        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {member.full_name}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <Belt
            belt={member.current_belt}
            stripes={member.current_stripes}
            size="md"
          />
          {member.auth_user_id ? null : (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-foreground/55">
              {t.registro.noAccount}
            </span>
          )}
        </div>

        {access.canEditRegistry ? null : (
          <p className="text-sm text-foreground/60">
            {t.registro.detailReadOnly}
          </p>
        )}
      </header>

      <section className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:gap-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <UserIcon className="h-4.5 w-4.5 shrink-0 text-accent" />
          {t.registro.personalSection}
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <Field label={t.auth.email} value={member.email ?? t.common.dash} />
          <Field label={t.account.phone} value={member.phone ?? t.common.dash} />
          <Field label={t.account.birthDate} value={formatDate(member.birth_date)} />
          <Field label={t.account.joinedOn} value={formatDate(member.joined_at)} />
        </dl>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:gap-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <TrendingUpIcon className="h-4.5 w-4.5 shrink-0 text-accent" />
          {t.registro.pathSection}
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {/* Colour and stripes are one thing on a belt, so they are one
              field: the belt drawn, rather than a name and a number to
              recombine mentally. */}
          <Field label={t.account.belt}>
            <Belt
              belt={member.current_belt}
              stripes={member.current_stripes}
              size="md"
              className="mt-0.5"
            />
          </Field>
          <Field label={t.account.beltSince} value={formatDate(member.rank_since)} />
          <Field label={t.account.stripeSince} value={formatDate(member.stripe_since)} />
          <Field
            label={t.registro.trainingTime}
            value={formatDays(daysSince(member.joined_at), t)}
          />
          <Field
            label={t.registro.beltTime}
            value={formatDays(daysSince(member.rank_since), t)}
          />
          <Field
            label={t.registro.stripeTime}
            value={formatDays(daysSince(member.stripe_since), t)}
          />
          <Field label={t.registro.totalHours} value={formatHours(training.total, t)} />
          <Field
            label={t.registro.recordedHours}
            value={formatHours(training.recorded, t)}
          />
          <Field
            label={t.registro.openingHours}
            value={formatHours(training.estimated, t)}
          />
        </dl>

        {training.isPartlyEstimated ? (
          <p className="text-xs leading-relaxed text-foreground/55">
            {t.registro.openingBalanceExplained(
              formatDate(TRACKING_STARTED_ON),
              LESSONS_PER_WEEK,
            )}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border p-4 sm:gap-3 sm:p-5">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <FileTextIcon className="h-4.5 w-4.5 shrink-0 text-accent" />
          {t.registro.notesSection}
        </h2>
        <p className="text-sm whitespace-pre-wrap text-foreground/80">
          {member.notes ?? t.common.dash}
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:gap-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <UsersIcon className="h-4.5 w-4.5 shrink-0 text-accent" />
          {t.registro.rolesSection}
        </h2>

        {roles.length === 0 ? (
          <p className="text-sm text-foreground/60">{t.registro.noRoles}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {roles.map((role) => (
              <li
                key={`${role.role}-${role.start_date}`}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="text-sm font-medium">
                  {roleLabel(role.role, t)}
                </span>
                <span className="text-xs text-foreground/55">
                  {role.end_date
                    ? t.registro.roleRange(
                        formatDate(role.start_date),
                        formatDate(role.end_date),
                      )
                    : t.registro.roleOpen(formatDate(role.start_date))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
