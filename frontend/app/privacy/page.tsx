import type { Metadata } from "next";
import { AlertCircleIcon } from "@/components/icons";
import { formatDate } from "@/utils/dates";
import { getDictionary } from "@/utils/i18n/server";

// The date the text itself last changed. Hardcoded on purpose: "last updated"
// must mean the day somebody rewrote the notice, not the day the page was
// deployed — a build date would silently claim a review that never happened.
const UPDATED_ON = "2026-09-18";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return {
    title: t.privacy.title,
    description: t.privacy.lead,
    alternates: { canonical: "/privacy" },
  };
}

// Public: it has to be reachable without an account, which is also why it is
// absent from PROTECTED_PREFIXES and from VISITOR_ONLY — a signed-in member
// reading their own rights must not be bounced to the dashboard.
export default async function PrivacyPage() {
  const { t } = await getDictionary();

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 sm:gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.privacy.title}
        </h1>
        <p className="text-sm text-foreground/55">
          {t.privacy.updated(formatDate(UPDATED_ON))}
        </p>
        <p className="text-base leading-relaxed text-foreground/75">
          {t.privacy.lead}
        </p>
      </header>

      {/* The application has no controller yet. Saying so on the page is the
          honest form: a notice with placeholder names reads as complete to
          anybody who does not look closely. */}
      <aside className="flex flex-col gap-1.5 rounded-xl border border-accent/40 bg-accent/10 p-4">
        <p className="flex items-center gap-2 font-heading font-semibold text-accent">
          <AlertCircleIcon className="h-4 w-4 shrink-0" />
          {t.privacy.draftTitle}
        </p>
        <p className="text-sm leading-relaxed text-foreground/75">
          {t.privacy.draftBody}
        </p>
      </aside>

      {t.privacy.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-semibold">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p
              key={paragraph.slice(0, 40)}
              className="text-sm leading-relaxed text-foreground/75"
            >
              {paragraph}
            </p>
          ))}
        </section>
      ))}

      <section id="cookie" className="flex scroll-mt-20 flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">
          {t.privacy.cookieHeading}
        </h2>
        <p className="text-sm leading-relaxed text-foreground/75">
          {t.privacy.cookieIntro}
        </p>

        {/* Four columns do not fit a phone, so the table scrolls inside its own
            box rather than making the page scroll sideways. */}
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/55">
                <th className="py-2 pr-3 font-medium">{t.privacy.cookieTable.name}</th>
                <th className="py-2 pr-3 font-medium">{t.privacy.cookieTable.type}</th>
                <th className="py-2 pr-3 font-medium">
                  {t.privacy.cookieTable.purpose}
                </th>
                <th className="py-2 font-medium">{t.privacy.cookieTable.duration}</th>
              </tr>
            </thead>
            <tbody>
              {t.privacy.cookies.map((cookie) => (
                <tr key={cookie.name} className="border-b border-border align-top">
                  <td className="py-2.5 pr-3 font-mono text-xs">{cookie.name}</td>
                  <td className="py-2.5 pr-3 text-foreground/75">{cookie.type}</td>
                  <td className="py-2.5 pr-3 text-foreground/75">{cookie.purpose}</td>
                  <td className="py-2.5 text-foreground/75">{cookie.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-sm leading-relaxed text-foreground/75">
          {t.privacy.cookieRemoval}
        </p>
      </section>
    </article>
  );
}
