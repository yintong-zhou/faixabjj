import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Belt } from "@/components/belt";
import { StepBelt } from "@/components/step-belt";
import {
  CheckCircleIcon,
  MinusCircleIcon,
  XCircleIcon,
} from "@/components/icons";
import { getDictionary } from "@/utils/i18n/server";
import { LOCALE_TAG } from "@/utils/i18n/locales";
import { SITE_NAME, SITE_URL } from "@/utils/site";

// The landing page has its own title rather than inheriting the template:
// "Faixa BJJ — ..." reads better as a search result than "Home · Faixa BJJ".
//
// generateMetadata rather than a static object, because the title and
// description are now translated and the locale is only known per request.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();

  return {
    title: t.home.metaTitle,
    description: t.home.metaDescription,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      url: "/",
      title: t.home.metaTitle,
      description: t.home.ogDescription,
    },
  };
}

// The people in the roll-call demo. Proper names are not translated, like the
// language names in LOCALE_LABELS; everything else in the demo comes from the
// dictionary. The first row is the lesson's instructor, who counts as present
// in a real roll call too.
const DEMO_ROWS = [
  { name: "Rafael Souza", belt: "brown", stripes: 2, instructor: true },
  { name: "Giulia Conti", belt: "blue", stripes: 3, instructor: false },
  { name: "Lucas Ferreira", belt: "purple", stripes: 0, instructor: false },
  { name: "Marco Bianchi", belt: "white", stripes: 4, instructor: false },
];

const ADULT_LADDER = ["white", "blue", "purple", "brown", "black"];
const KID_LADDER = ["gray", "yellow", "orange", "green"];

export default async function Home() {
  const { locale, t } = await getDictionary();

  // Structured data, so a search engine can read what this is without
  // inferring it from the copy. Kept minimal and truthful: no invented ratings
  // or prices. It follows the page's language, like everything else on it.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: LOCALE_TAG[locale],
    url: SITE_URL,
    description: t.home.metaDescription,
    audience: {
      "@type": "Audience",
      audienceType: t.home.audience,
    },
  };

  return (
    <div className="flex flex-col gap-16 sm:gap-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
        <div className="flex flex-col gap-5 sm:gap-6 lg:col-span-7">
          {/* The logo is black artwork on transparency, so it needs a light
              plate to survive the dark theme. `bg-secondary` is fixed light in
              both themes on purpose — this is one of the few places where a
              brand colour is used as itself rather than as a role. */}
          <div className="w-fit rounded-lg border border-border bg-secondary p-3 sm:p-4">
            <Image
              src="/logo/faixabjj_logo-removebg-preview.png"
              alt={SITE_NAME}
              width={618}
              height={404}
              priority
              className="h-12 w-auto sm:h-16"
            />
          </div>

          <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-[-0.025em] sm:text-5xl lg:text-[3.5rem]">
            {t.home.title}
          </h1>

          {/* ~65 characters per line, per the brand guidelines. */}
          <p className="max-w-[62ch] text-base leading-relaxed text-foreground/70 sm:text-lg">
            {t.home.lead}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {/* This page is for people who are not signed in: the only honest
                action here is signing in, never a link into the app. */}
            <Link
              href="/login"
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {t.home.ctaPrimary}
            </Link>
            <Link
              href="#how-it-works"
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {t.home.ctaSecondary}
            </Link>
          </div>

          <p className="max-w-[62ch] text-sm leading-relaxed text-foreground/55">
            {t.home.noSignup}
          </p>
        </div>

        {/* The product itself rather than a metaphor for it: the roll call as
            an instructor sees it, built from the same pieces as the real page
            (app/attendance/[id]). The present marks tick in one row after the
            other — the page's only animation, played once, and shown already
            finished to anyone who asked for reduced motion. It is an
            illustration, so assistive technology gets the caption instead. */}
        <figure className="flex flex-col gap-3 lg:col-span-5">
          <div
            aria-hidden
            className="overflow-hidden rounded-xl border border-border bg-surface"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <span className="font-heading text-sm font-semibold">
                {t.home.demo.lesson}
              </span>
              <span className="text-xs text-foreground/55">{t.presenze.rollCall}</span>
            </div>

            <ul className="flex flex-col divide-y divide-border">
              {DEMO_ROWS.map((row, index) => (
                <li
                  key={row.name}
                  style={{ "--roll-delay": `${700 + index * 450}ms` } as CSSProperties}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                >
                  {/* The instructor tag sits beside the belt, not the name, so
                      the row keeps the marks on one line at this width. */}
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-medium">{row.name}</span>
                    <span className="flex items-center gap-2">
                      <Belt belt={row.belt} stripes={row.stripes} />
                      {row.instructor ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground/55">
                          {t.rollCall.instructorTag}
                        </span>
                      ) : null}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <span className="roll-demo__hour mr-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                      {t.home.demo.plusOneHour}
                    </span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground/35">
                      <MinusCircleIcon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="roll-demo__present flex h-8 w-8 items-center justify-center rounded-full border border-success bg-success/10 text-success">
                      <CheckCircleIcon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground/35">
                      <XCircleIcon className="h-[18px] w-[18px]" />
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-border px-4 py-3 text-sm text-foreground/70">
              {t.rollCall.presentTotal(DEMO_ROWS.length)}
            </div>
          </div>
          <figcaption className="text-sm text-foreground/55">{t.home.demo.caption}</figcaption>
        </figure>
      </section>

      <section className="flex flex-col gap-6 sm:gap-8">
        <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          {t.home.whatItDoes}
        </h2>
        <dl className="grid gap-x-12 gap-y-6 sm:grid-cols-2 sm:gap-y-8">
          {t.home.features.map((feature) => (
            <div key={feature.title} className="flex flex-col gap-1.5 border-t border-border pt-4">
              <dt className="font-heading text-base font-semibold">{feature.title}</dt>
              <dd className="max-w-[60ch] text-sm leading-relaxed text-foreground/65">
                {feature.description}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* The anchor is part of the URL, so it stays the same in every
          language: changing it would break links already shared. */}
      <section id="how-it-works" className="flex scroll-mt-20 flex-col gap-6 sm:gap-8">
        <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          {t.home.howItWorks}
        </h2>
        <ol className="grid gap-8 sm:grid-cols-3 sm:gap-10">
          {t.home.steps.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3">
              <StepBelt stripes={index + 1} />
              <h3 className="text-base font-semibold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-foreground/65">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="flex flex-col gap-3 lg:col-span-5">
          <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            {t.home.beltsTitle}
          </h2>
          <p className="max-w-[60ch] text-sm leading-relaxed text-foreground/65 sm:text-base">
            {t.home.beltsLead}
          </p>
          <p className="max-w-[60ch] text-sm leading-relaxed text-foreground/65 sm:text-base">
            {t.home.membersNote}
          </p>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-7">
          <div className="flex flex-col gap-2.5">
            <h3 className="text-sm font-semibold text-foreground/70">{t.home.adultsLabel}</h3>
            <ul className="flex flex-wrap gap-2">
              {ADULT_LADDER.map((belt) => (
                <li key={belt}>
                  <Belt belt={belt} stripes={0} size="md" />
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2.5">
            <h3 className="text-sm font-semibold text-foreground/70">{t.home.kidsLabel}</h3>
            <ul className="flex flex-wrap gap-2">
              {KID_LADDER.map((belt) => (
                <li key={belt}>
                  <Belt belt={belt} stripes={0} size="md" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8 sm:gap-5 sm:pt-10">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            {t.home.notDoingTitle}
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-foreground/60 sm:text-base">
            {t.home.notDoingLead}
          </p>
        </div>
        <ul className="grid gap-2 text-sm text-foreground/70 sm:grid-cols-2">
          {t.home.notDoing.map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <MinusCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-foreground/40" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* The page ends by splitting its two readers: a gym that might use the
          app goes to /demo, a member who already does goes to sign in. */}
      <section className="grid overflow-hidden rounded-xl border border-border bg-surface sm:grid-cols-2">
        <div className="flex flex-col items-start gap-3 p-5 sm:p-8">
          <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            {t.home.demoTitle}
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-foreground/65 sm:text-base">
            {t.home.demoLead}
          </p>
          <Link
            href="/demo"
            className="mt-auto rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t.home.demoCta}
          </Link>
        </div>
        <div className="flex flex-col items-start gap-3 border-t border-border p-5 sm:border-l sm:border-t-0 sm:p-8">
          <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            {t.home.alreadyMember}
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-foreground/65 sm:text-base">
            {t.home.alreadyMemberLead}
          </p>
          <Link
            href="/login"
            className="mt-auto rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t.nav.signIn}
          </Link>
        </div>
      </section>
    </div>
  );
}
