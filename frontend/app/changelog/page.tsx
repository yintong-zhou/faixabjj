import type { Metadata } from "next";
import { Belt } from "@/components/belt";
import { CHANGELOG, LAST_UPDATED, groupByMonth } from "@/utils/changelog";
import { formatDate } from "@/utils/dates";
import { LOCALE_TAG } from "@/utils/i18n/locales";
import { getDictionary } from "@/utils/i18n/server";
import { formatMonthHeading } from "@/utils/schedule";
import { SITE_NAME, SITE_URL } from "@/utils/site";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return {
    title: t.changelog.metaTitle,
    description: t.changelog.metaDescription,
    alternates: { canonical: "/changelog" },
    openGraph: {
      type: "website",
      url: "/changelog",
      title: t.changelog.metaTitle,
      description: t.changelog.metaDescription,
    },
  };
}

// Public, like /privacy and /demo: in PUBLIC_PATHS, not in PROTECTED_PREFIXES
// or VISITOR_ONLY, so a signed-in member can read it too.
//
// The belt that runs down the left side is the page's one moment of motion:
// the track fills and each novelty's stripe is taped on as it scrolls into
// view (`.changelog*` in globals.css). The belt then fades out under "the next
// stripe is on its way", so a visitor sees that the list is still growing.
export default async function ChangelogPage() {
  const { locale, t } = await getDictionary();
  const months = groupByMonth(CHANGELOG);

  // What a search engine reads: a list of dated entries, in the order shown.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t.changelog.metaTitle,
    description: t.changelog.metaDescription,
    url: `${SITE_URL}/changelog`,
    inLanguage: LOCALE_TAG[locale],
    dateModified: LAST_UPDATED,
    about: { "@type": "SoftwareApplication", name: SITE_NAME },
    mainEntity: {
      "@type": "ItemList",
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: CHANGELOG.map((entry, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "CreativeWork",
          name: t.changelog.entries[entry.id].title,
          description: t.changelog.entries[entry.id].body,
          datePublished: entry.date,
        },
      })),
    },
  };

  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-10 sm:gap-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="flex flex-col gap-3">
        <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-[-0.025em] sm:text-5xl">
          {t.changelog.title}
        </h1>
        <p className="max-w-[62ch] text-base leading-relaxed text-foreground/70 sm:text-lg">
          {t.changelog.lead}
        </p>
        <p className="text-sm text-foreground/55">
          {t.changelog.updated(formatDate(LAST_UPDATED))}
        </p>
      </header>

      <ol role="list" aria-label={t.changelog.listLabel} className="changelog">
        {months.map(({ month, entries }) => (
          <li key={month} className="changelog__month">
            <h2 className="mb-5 font-heading text-xl font-bold tracking-tight">
              {formatMonthHeading(month, locale)}
            </h2>
            <ol role="list">
              {entries.map((entry) => {
                const text = t.changelog.entries[entry.id];
                return (
                  <li key={entry.id} className="changelog__entry">
                    <span aria-hidden className="changelog__tape" />
                    <time
                      dateTime={entry.date}
                      className="text-sm tabular-nums text-foreground/55"
                    >
                      {formatDate(entry.date)}
                    </time>
                    <h3 className="mt-0.5 font-heading text-lg font-semibold leading-snug">
                      {text.title}
                    </h3>
                    <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-foreground/75 sm:text-base">
                      {text.body}
                    </p>
                    {entry.belt && (
                      <Belt
                        belt={entry.belt.belt}
                        stripes={entry.belt.stripes}
                        size="md"
                        className="mt-3"
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </li>
        ))}

        <li className="changelog__next">
          <h2 className="font-heading text-lg font-semibold leading-snug">
            {t.changelog.upcoming.title}
          </h2>
          <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-foreground/75 sm:text-base">
            {t.changelog.upcoming.body}
          </p>
        </li>
      </ol>
    </article>
  );
}
