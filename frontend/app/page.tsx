import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  CalendarCheckIcon,
  CheckCircleIcon,
  DashboardIcon,
  UsersIcon,
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

// The icons pair with the three feature entries in the dictionary, by position.
// They live here rather than in the dictionary because an icon is not a word.
const FEATURE_ICONS = [UsersIcon, CalendarCheckIcon, DashboardIcon];

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
    <div className="flex flex-col gap-12 sm:gap-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="flex flex-col gap-5 sm:gap-6">
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
            className="h-12 w-auto sm:h-20"
          />
        </div>

        <span className="w-fit rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
          {t.home.badge}
        </span>

        <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          {t.home.title}
        </h1>

        {/* ~65 characters per line, per the brand guidelines. */}
        <p className="max-w-prose text-base leading-relaxed text-foreground/70">
          {t.home.lead}
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/* Both buttons used to point at pages behind the login, which sent
              every visitor straight to a login form. This page is for people
              who are not signed in: the only honest action here is signing in. */}
          <Link
            href="/login"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            {t.home.ctaPrimary}
          </Link>
          <Link
            href="#how-it-works"
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            {t.home.ctaSecondary}
          </Link>
        </div>

        <p className="text-xs text-foreground/50">{t.home.noSignup}</p>
      </section>

      <section className="flex flex-col gap-4 sm:gap-6">
        <h2 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
          {t.home.whatItDoes}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          {t.home.features.map((feature, index) => {
            const Icon = FEATURE_ICONS[index] ?? UsersIcon;
            return (
              <article
                key={feature.title}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 sm:gap-3 sm:p-5"
              >
                <Icon className="h-6 w-6 text-accent" />
                <h3 className="text-base font-semibold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-foreground/65">
                  {feature.description}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {/* The anchor stays Italian: it is part of the URL, and changing it per
          language would break every link somebody has already shared. */}
      <section id="how-it-works" className="flex scroll-mt-20 flex-col gap-4 sm:gap-6">
        <h2 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
          {t.home.howItWorks}
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          {t.home.steps.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 sm:gap-3 sm:p-5"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 font-heading text-sm font-bold text-accent">
                {index + 1}
              </span>
              <h3 className="text-base font-semibold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-foreground/65">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:gap-5 sm:p-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
            {t.home.notDoingTitle}
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-foreground/60">
            {t.home.notDoingLead}
          </p>
        </div>
        <ul className="grid gap-2 text-sm text-foreground/70 sm:grid-cols-2">
          {t.home.notDoing.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col items-start gap-3 border-t border-border pt-8 sm:pt-10">
        <h2 className="flex items-center gap-2 font-heading text-xl font-bold tracking-tight sm:text-2xl">
          <CheckCircleIcon className="h-5 w-5 shrink-0 text-accent" />
          {t.home.alreadyMember}
        </h2>
        <p className="max-w-prose text-sm leading-relaxed text-foreground/65">
          {t.home.alreadyMemberLead}
        </p>
        <Link
          href="/login"
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {t.nav.signIn}
        </Link>
      </section>
    </div>
  );
}
