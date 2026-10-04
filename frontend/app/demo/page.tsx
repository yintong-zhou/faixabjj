import type { Metadata } from "next";

import { MailIcon } from "@/components/icons";
import { StepBelt } from "@/components/step-belt";
import { getDictionary } from "@/utils/i18n/server";
import { mailtoHref } from "@/utils/mailto";
import { DEMO_EMAIL } from "@/utils/site";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return {
    title: t.demo.metaTitle,
    description: t.demo.metaDescription,
    alternates: { canonical: "/demo" },
    openGraph: { type: "website", url: "/demo", title: t.demo.title, description: t.demo.metaDescription },
  };
}

// Public, like /privacy: absent from PROTECTED_PREFIXES and from VISITOR_ONLY,
// so whoever has the link reads it signed in or not.
//
// A demo is asked for by email, not through a form: a form would need a
// service to deliver it, and an email reaches a person who can answer. The
// page shows the message the button opens, so nobody has to wonder what to
// write — the blanks in brackets are what helps prepare the demo.
export default async function DemoPage() {
  const { t } = await getDictionary();

  // The same lines become the preview below and the body of the mailto link,
  // so what the reader sees is exactly what their mail app opens.
  const bodyLines = t.demo.body.map((line) =>
    line.blank ? `${line.text} [${line.blank}]` : line.text,
  );
  const href = mailtoHref(DEMO_EMAIL, t.demo.subject, bodyLines);

  return (
    <div className="flex flex-col gap-14 sm:gap-20">
      <section className="grid gap-10 lg:grid-cols-12 lg:items-start lg:gap-12">
        <div className="flex flex-col gap-5 sm:gap-6 lg:col-span-5 lg:pt-4">
          <h1 className="text-balance text-3xl font-bold leading-[1.08] tracking-[-0.02em] sm:text-5xl">
            {t.demo.title}
          </h1>
          <p className="max-w-[60ch] text-base leading-relaxed text-foreground/70">{t.demo.lead}</p>

          <a
            href={href}
            className="flex w-fit items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <MailIcon className="h-4 w-4" />
            {t.demo.writeEmail}
          </a>

          {/* For a computer with no mail app set up, where the button opens
              nothing: the address, whole, ready to select and copy. */}
          <p className="text-sm text-foreground/65">
            {t.demo.orWriteTo}{" "}
            <a
              href={`mailto:${DEMO_EMAIL}`}
              className="select-all font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-accent"
            >
              {DEMO_EMAIL}
            </a>
          </p>

          <p className="text-sm text-foreground/55">{t.demo.noCommitment}</p>
        </div>

        {/* The message itself, laid out like a mail app's compose window: the
            page's one strong element. The parts to fill in carry the accent
            and a dashed underline, so they read as blanks at a glance. */}
        <figure className="flex flex-col gap-3 lg:col-span-7">
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <dl className="divide-y divide-border border-b border-border text-sm">
              <div className="flex gap-3 px-4 py-2.5 sm:px-5">
                <dt className="w-16 shrink-0 text-foreground/55">{t.demo.draftTo}</dt>
                <dd className="min-w-0 [overflow-wrap:anywhere]">{DEMO_EMAIL}</dd>
              </div>
              <div className="flex gap-3 px-4 py-2.5 sm:px-5">
                <dt className="w-16 shrink-0 text-foreground/55">{t.demo.draftSubject}</dt>
                <dd className="min-w-0 font-medium">{t.demo.subject}</dd>
              </div>
            </dl>

            <div className="flex flex-col px-4 py-4 text-sm leading-7 sm:px-5 sm:py-5 sm:text-base sm:leading-8">
              {t.demo.body.map((line, index) =>
                line.text === "" ? (
                  <span key={index} aria-hidden className="h-3" />
                ) : (
                  <p key={index}>
                    {line.text}
                    {line.blank ? (
                      <>
                        {" "}
                        <span className="text-accent underline decoration-dashed decoration-accent/60 underline-offset-4">
                          [{line.blank}]
                        </span>
                      </>
                    ) : null}
                  </p>
                ),
              )}
            </div>
          </div>
          <figcaption className="text-sm text-foreground/55">{t.demo.draftCaption}</figcaption>
        </figure>
      </section>

      <section className="flex flex-col gap-6 border-t border-border pt-10 sm:gap-8 sm:pt-12">
        <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          {t.demo.nextTitle}
        </h2>
        <ol className="grid gap-8 sm:grid-cols-3 sm:gap-10">
          {t.demo.steps.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3">
              <StepBelt stripes={index + 1} />
              <h3 className="text-base font-semibold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-foreground/65">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
