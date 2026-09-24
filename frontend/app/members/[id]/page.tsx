import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Belt } from "@/components/belt";
import { beltLabel, roleLabel } from "@/utils/supabase/profile";
import { getDictionary } from "@/utils/i18n/server";
import { requireRegistryViewer } from "@/utils/supabase/require-admin";
import { daysSince, formatDate, formatDays } from "@/utils/dates";
import { LESSONS_PER_WEEK, TRACKING_STARTED_ON, formatHours, hoursFor } from "@/utils/hours";
import { isPortalOnly } from "@/utils/members";
import { promotionStatus, type Criterion } from "@/utils/promotion";
import { correctRankDates } from "../actions";
import { PromotePanel } from "./promote-panel";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  PencilIcon,
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

type PromotionRow = {
  id: string;
  from_belt: string;
  from_stripes: number;
  to_belt: string;
  to_stripes: number;
  promoted_on: string;
  notes: string | null;
  // The signer, embedded in the same round trip rather than fetched after.
  // `promotion` has two foreign keys into `person`, so the relationship has to
  // be named by its constraint or PostgREST cannot tell them apart. Null when
  // the signer's registry row has since been removed (`on delete set null`).
  //
  // Typed as either shape: PostgREST returns a single object for this to-one
  // embed, but without generated database types supabase-js cannot know the
  // cardinality and infers an array. `promoterName()` collapses the two rather
  // than casting through `unknown`, which would silence a real mismatch too.
  promoted_by: { full_name: string } | { full_name: string }[] | null;
};

function promoterName(row: PromotionRow): string | null {
  const promoter = Array.isArray(row.promoted_by) ? row.promoted_by[0] : row.promoted_by;
  return promoter?.full_name ?? null;
}

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
  searchParams: Promise<{ from?: string; ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { from, ok, error } = await searchParams;
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

  // A portal-only admin runs the app and does not train: no belt, no dates, no
  // hours, no promotion. Their `person` row still carries the rank columns'
  // defaults, which is precisely why none of that block may be drawn — it would
  // show a white belt nobody was ever given and invite a promotion for it.
  // Only the *active* roles decide: a closed admin assignment says nothing
  // about somebody who trains today.
  const portalOnly = isPortalOnly(
    roles.filter((r) => !r.end_date).map((r) => r.role),
  );

  // Counted lessons since the current belt/stripe, and the configured
  // thresholds — the same two queries the Registro runs, just for one person
  // rather than the whole gym, so the panel can default to the next grade
  // instead of making the coach type it from scratch.
  const [{ data: rankHours }, { data: criteriaRows }, { data: promotionRows }] =
    await Promise.all([
      supabase
        .from("person_rank_hours")
        .select("lessons_since_rank, lessons_since_stripe")
        .eq("person_id", member.id)
        .maybeSingle(),
      supabase
        .from("promotion_criteria")
        .select("belt, stripe, min_hours, min_time_at_rank_days, min_age_years")
        .order("belt")
        .order("stripe"),
      supabase
        .from("promotion")
        .select(
          "id, from_belt, from_stripes, to_belt, to_stripes, promoted_on, notes, promoted_by:person!promotion_promoted_by_fkey(full_name)",
        )
        .eq("person_id", id)
        .order("promoted_on", { ascending: false }),
    ]);

  // numeric/bigint columns can come back from PostgREST as strings, which
  // would let a string silently win a `<` comparison in promotionStatus() —
  // same coercion as the Registro, the one place criteria rows enter the app.
  const criteria = ((criteriaRows ?? []) as Criterion[]).map((row) => ({
    ...row,
    min_hours: Number(row.min_hours),
    min_time_at_rank_days: Number(row.min_time_at_rank_days),
  }));

  const status = promotionStatus(
    {
      current_belt: member.current_belt,
      current_stripes: member.current_stripes,
      rank_since: member.rank_since,
      stripe_since: member.stripe_since ?? member.rank_since,
      joined_at: member.joined_at,
      birth_date: member.birth_date,
      lessons_since_rank: Number(rankHours?.lessons_since_rank ?? 0),
      lessons_since_stripe: Number(rankHours?.lessons_since_stripe ?? 0),
    },
    criteria,
  );

  const promotions = (promotionRows ?? []) as PromotionRow[];
  const today = new Date().toISOString().slice(0, 10);

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
          {portalOnly ? null : (
            <Belt belt={member.current_belt} stripes={member.current_stripes} size="md" />
          )}
          {member.auth_user_id ? null : (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-foreground/55">
              {t.registro.noAccount}
            </span>
          )}
        </div>

        {access.canEditRegistry ? null : (
          <p className="text-sm text-foreground/60">{t.registro.detailReadOnly}</p>
        )}
      </header>

      {ok ? (
        <p className="flex items-start gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {ok}
        </p>
      ) : null}
      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

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

      {portalOnly ? null : (
        <>
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

          {/* Correcting the two dates, for a maestro or an admin only.
              `guard_person_auth_link` has always let a registry editor through —
              it freezes these columns against everybody else, which is what keeps
              promotion from becoming self-service — but there was nowhere in the
              app to do it from, so a date typed wrong on the join form could only
              be moved by recording a promotion that never happened.

              Collapsed, and inside the section whose figures it governs rather
              than as a panel of its own: it is a repair, reached deliberately,
              not something to meet while reading somebody's record. */}
          {access.canEditRegistry ? (
            <details className="group rounded-xl border border-border">
              <summary className="flex min-h-11 cursor-pointer select-none list-none items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
                <PencilIcon className="h-4 w-4 shrink-0 text-accent" />
                <span>{t.registro.correctDates}</span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-foreground/40 transition-transform group-open:rotate-90" />
              </summary>

              <form
                action={correctRankDates}
                className="flex flex-col gap-3 border-t border-border px-3 pb-4 pt-3 sm:flex-row sm:flex-wrap sm:items-end"
              >
                <input type="hidden" name="person_id" value={member.id} />
                {/* Carried so the back link at the top of this page still leads
                    to the list the member was opened from. */}
                <input type="hidden" name="_from" value={from ?? ""} />

                <label className="flex flex-col gap-1 text-xs text-foreground/65">
                  {t.account.beltSince}
                  {/* ISO on purpose: it is what the element accepts and posts
                      back. `max` blocks a future date in the browser; the action
                      checks it again, since a crafted POST is not bound by it. */}
                  <input
                    type="date"
                    name="rank_since"
                    defaultValue={member.rank_since}
                    max={today}
                    required
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm sm:w-44"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-foreground/65">
                  {t.account.stripeSince}
                  <input
                    type="date"
                    name="stripe_since"
                    // Falls back to the belt date when the column is empty, the
                    // same way promotionStatus() reads it: an empty date input
                    // posts nothing and `required` would block the form.
                    defaultValue={member.stripe_since ?? member.rank_since}
                    max={today}
                    required
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm sm:w-44"
                  />
                </label>

                <button
                  type="submit"
                  className="min-h-11 w-full rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 sm:min-h-0 sm:w-auto"
                >
                  {t.common.saveChanges}
                </button>

                <p className="text-xs leading-relaxed text-foreground/55 sm:w-full">
                  {t.registro.correctDatesNote}
                </p>
              </form>
            </details>
          ) : null}
        </section>

        {access.canEditRegistry ? (
          <PromotePanel
            personId={member.id}
            personName={member.full_name}
            status={status}
            today={today}
            t={t}
          />
        ) : null}

        <section className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:gap-4 sm:p-5">
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
            <TrendingUpIcon className="h-4.5 w-4.5 shrink-0 text-accent" />
            {t.promotions.history}
          </h2>

          {promotions.length === 0 ? (
            <p className="text-sm text-foreground/60">{t.promotions.historyEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {promotions.map((row) => {
                const promoter = promoterName(row);
                return (
                  <li
                    key={row.id}
                    className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {t.promotions.historyEntry(
                          t.belts.label(beltLabel(row.from_belt, t), row.from_stripes),
                          t.belts.label(beltLabel(row.to_belt, t), row.to_stripes),
                        )}
                      </span>
                      {promoter ? (
                        <span className="text-xs text-foreground/55">
                          {t.promotions.promotedBy(promoter)}
                        </span>
                      ) : null}
                      {/* The note was stored and never shown. A promotion the
                        instructor explained is exactly the entry somebody
                        re-reads years later. */}
                      {row.notes ? (
                        <span className="text-xs leading-relaxed text-foreground/70">
                          {row.notes}
                        </span>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs text-foreground/55">
                      {formatDate(row.promoted_on)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        </>
      )}

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
                <span className="text-sm font-medium">{roleLabel(role.role, t)}</span>
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
