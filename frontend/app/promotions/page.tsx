import Link from "next/link";

import { Belt } from "@/components/belt";
import { AlertCircleIcon, CheckCircleIcon, TrendingUpIcon } from "@/components/icons";
import { beltLabel } from "@/utils/supabase/profile";
import { formatDays } from "@/utils/dates";
import { formatHours } from "@/utils/hours";
import { getDictionary } from "@/utils/i18n/server";
import { PORTAL_ONLY_ROLES } from "@/utils/members";
import {
  promotionStatus,
  type Criterion,
  type PromotionInput,
  type PromotionStatus,
} from "@/utils/promotion";
import { requireRegistryViewer } from "@/utils/supabase/require-admin";

import { updateCriterion } from "./actions";

const PATH = "/promotions";

type MemberRow = PromotionInput & {
  id: string;
  full_name: string;
};

type RankHours = {
  person_id: string;
  lessons_since_rank: number;
  lessons_since_stripe: number;
};

export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { t } = await getDictionary();
  const { supabase, access } = await requireRegistryViewer(PATH);

  // Three small queries rather than one view: the eligibility rule lives in
  // TypeScript, where it is unit-tested, so the database is not asked to know
  // who is eligible. A gym is a few hundred rows; this is one round trip each.
  const [{ data: memberRows }, { data: rankRows }, { data: criteriaRows }] =
    await Promise.all([
      supabase
        .from("member_overview")
        .select(
          "id, full_name, current_belt, current_stripes, rank_since, stripe_since, joined_at, birth_date",
        )
        .eq("is_active", true)
        // A portal-only admin runs the portal and does not train here.
        .not("active_roles", "eq", PORTAL_ONLY_ROLES)
        .order("full_name"),
      supabase
        .from("person_rank_hours")
        .select("person_id, lessons_since_rank, lessons_since_stripe"),
      supabase
        .from("promotion_criteria")
        .select("belt, stripe, min_hours, min_time_at_rank_days, min_age_years, notes")
        .order("belt")
        .order("stripe"),
    ]);

  // numeric and bigint columns can come back from PostgREST as strings, which
  // would let a string silently win a `<` comparison in promotionStatus() —
  // coerce here, the one place criteria rows enter the app.
  const criteria = (
    (criteriaRows ?? []) as (Criterion & { notes: string | null })[]
  ).map((row) => ({
    ...row,
    min_hours: Number(row.min_hours),
    min_time_at_rank_days: Number(row.min_time_at_rank_days),
  }));
  const hoursById = new Map(
    ((rankRows ?? []) as RankHours[]).map((row) => [row.person_id, row]),
  );

  const evaluated = ((memberRows ?? []) as Omit<
    MemberRow,
    "lessons_since_rank" | "lessons_since_stripe"
  >[]).map((member) => {
    const counted = hoursById.get(member.id);
    const status = promotionStatus(
      {
        ...member,
        lessons_since_rank: Number(counted?.lessons_since_rank ?? 0),
        lessons_since_stripe: Number(counted?.lessons_since_stripe ?? 0),
      },
      criteria,
    );
    return { ...member, status };
  });

  const eligible = evaluated.filter((row) => row.status.eligible);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">{t.promotions.title}</h1>
        <p className="text-sm text-foreground/65">{t.promotions.queueIntro}</p>
      </header>

      {params.ok ? (
        <p className="flex items-start gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {params.ok}
        </p>
      ) : null}
      {params.error ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {params.error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <TrendingUpIcon className="h-4 w-4" />
          {t.promotions.queueTitle}
        </h2>

        {eligible.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 text-sm text-foreground/60">
            {t.promotions.queueEmpty}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {eligible.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 px-3 py-3 sm:p-4"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <Link href={`/members/${row.id}`} className="hover:underline">
                      {row.full_name}
                    </Link>
                    <Belt belt={row.current_belt} stripes={row.current_stripes} />
                  </span>
                  <span className="text-xs text-foreground/70">
                    {t.promotions.proposedStep}
                    {": "}
                    {stepLabel(row.status, t)}
                  </span>
                  <span
                    className="text-xs text-foreground/55"
                    title={t.promotions.hoursNote}
                  >
                    {formatHours(row.status.currentHours, t)}
                    {" · "}
                    {formatDays(row.status.currentDays, t)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {access.canEditRegistry ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">
            {t.promotions.criteriaTitle}
          </h2>
          <p className="text-sm text-foreground/65">{t.promotions.criteriaIntro}</p>

          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {criteria.map((criterion) => (
              <li key={`${criterion.belt}-${criterion.stripe}`} className="p-3 sm:p-4">
                <form
                  action={updateCriterion}
                  className="flex flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="belt" value={criterion.belt} />
                  <input type="hidden" name="stripe" value={criterion.stripe} />

                  <span className="flex min-w-[9rem] items-center gap-2 text-sm font-medium">
                    <Belt belt={criterion.belt} stripes={criterion.stripe} />
                  </span>

                  <label className="flex flex-col gap-1 text-xs text-foreground/65">
                    {t.promotions.minHours}
                    <input
                      type="number"
                      name="min_hours"
                      min={0}
                      step="0.5"
                      defaultValue={criterion.min_hours}
                      required
                      className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-foreground/65">
                    {t.promotions.minDays}
                    <input
                      type="number"
                      name="min_time_at_rank_days"
                      min={0}
                      step="1"
                      defaultValue={criterion.min_time_at_rank_days}
                      required
                      className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-foreground/65">
                    {t.promotions.minAge}
                    <input
                      type="number"
                      name="min_age_years"
                      min={0}
                      max={99}
                      step="1"
                      defaultValue={criterion.min_age_years ?? ""}
                      className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </label>

                  <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-foreground/65">
                    {t.promotions.criterionNotes}
                    <input
                      type="text"
                      name="notes"
                      defaultValue={criterion.notes ?? ""}
                      className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </label>

                  <button
                    type="submit"
                    className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
                  >
                    {t.promotions.save}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

// A stripe reads "3ª tacca", a belt reads "Cintura blu" — the belt name comes
// from the dictionary like everywhere else, never from the enum value.
function stepLabel(
  status: PromotionStatus,
  t: Awaited<ReturnType<typeof getDictionary>>["t"],
): string {
  if (!status.next) return "—";
  return status.next.stripe === 0
    ? t.promotions.beltStep(beltLabel(status.next.belt, t))
    : t.promotions.stripeStep(status.next.stripe);
}
