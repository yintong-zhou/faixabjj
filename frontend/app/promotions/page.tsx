import Link from "next/link";

import { Belt } from "@/components/belt";
import { TrendingUpIcon } from "@/components/icons";
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

export default async function PromotionsPage() {
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

  const criteria = (criteriaRows ?? []) as (Criterion & { notes: string | null })[];
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
