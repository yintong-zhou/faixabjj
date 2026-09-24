import type { Metadata, Viewport } from "next";
import { Sora, Work_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { InlineScript } from "@/components/inline-script";
import { CookieNotice } from "@/components/cookie-notice";
import { NavShell } from "@/components/nav-shell";
import { createClient } from "@/utils/supabase/server";
import { getAccess } from "@/utils/supabase/require-admin";
import { getGymSettings } from "@/utils/supabase/gym";
import { SITE_NAME, SITE_URL } from "@/utils/site";
import { getDictionary } from "@/utils/i18n/server";
import { LOCALE_TAG } from "@/utils/i18n/locales";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getDictionary();

  return {
    // Absolute base for every relative URL below. Without it Open Graph tags
    // and canonical links resolve to nothing and crawlers drop them.
    metadataBase: new URL(SITE_URL),
    // Interior pages set only their own title; the template adds the brand.
    title: {
      default: t.home.metaTitle,
      template: `%s · ${SITE_NAME}`,
    },
    description: t.home.metaDescription,
    applicationName: SITE_NAME,
    keywords: t.home.keywords,
    category: "sports",
    // Named on the iOS home screen, and asked to open without browser chrome —
    // the counterpart of app/manifest.ts, which Safari does not read for this.
    appleWebApp: {
      capable: true,
      title: SITE_NAME,
      statusBarStyle: "default",
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      // The page is served in whichever language this request resolved to, so
      // the tag has to say that one rather than a language the reader may not
      // be getting.
      locale: LOCALE_TAG[locale].replace("-", "_"),
      url: "/",
      images: [
        {
          url: "/logo/faixabjj_logo.png",
          width: 618,
          height: 404,
          alt: SITE_NAME,
        },
      ],
    },
    twitter: {
      card: "summary",
      title: SITE_NAME,
      description: t.home.metaDescription,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" },
    },
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // One colour per theme: a single dark value painted the browser chrome dark
  // even for somebody reading the light theme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#16181d" },
  ],
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The reader's language, from their saved choice or their browser. Resolved
  // once here and handed down, so no component below has to read the cookie.
  const { locale, t } = await getDictionary();
  const supabase = createClient(await cookies());
  const { data: claimsData } = await supabase.auth.getClaims();
  const isLoggedIn = !!claimsData?.claims;
  // Drives which nav items the shell renders. Students and assistants never
  // see Registro/Presenze; the pages enforce it too, this only hides the links.
  // Presenze is shown to everyone — that is where check-in lives.
  const access = isLoggedIn ? await getAccess(supabase) : null;
  const canViewRegistry = access?.canViewRegistry ?? false;
  const canManageClasses = access?.canManageClasses ?? false;
  const isPlatformAdmin = access?.isPlatformAdmin ?? false;
  // The gym's own name next to the product's logo — never instead of it.
  const gymName = isLoggedIn && !isPlatformAdmin ? (await getGymSettings())?.name ?? null : null;

  return (
    <html
      // The real language of the document, not a fixed "it": it is what a
      // screen reader picks its voice from and what a translation tool reads.
      lang={LOCALE_TAG[locale]}
      className={`${sora.variable} ${workSans.variable} h-full antialiased`}
      // The blocking script below sets `data-theme` on this element before
      // React hydrates, on purpose — the server render never knows the
      // stored theme, so this attribute is expected to differ and should
      // not be reconciled as a hydration error.
      suppressHydrationWarning
    >
      <head>
        {/* Runs before paint so a stored theme choice applies immediately,
            with no flash of the system-default theme first. Wrapped in
            InlineScript because React warns in development about any <script>
            a render produces. */}
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NavShell
          isLoggedIn={isLoggedIn}
          canViewRegistry={canViewRegistry}
          canManageClasses={canManageClasses}
          isPlatformAdmin={isPlatformAdmin}
          gymName={gymName}
          locale={locale}
          labels={{
            home: t.nav.home,
            dashboard: t.nav.dashboard,
            presenze: t.nav.presenze,
            corsi: t.nav.corsi,
            registro: t.nav.registro,
            account: t.nav.account,
            gyms: t.nav.gyms,
            signIn: t.nav.signIn,
            signOut: t.nav.signOut,
            language: t.nav.language,
            privacy: t.nav.privacy,
            themeToLight: t.nav.theme.toLight,
            themeToDark: t.nav.theme.toDark,
          }}
        >
          {children}
        </NavShell>

        {/* Informative, not a consent gate: this app sets only cookies it
            cannot work without, plus the chosen language. It blocks nothing
            and takes no focus — see components/cookie-notice.tsx. */}
        <CookieNotice
          text={t.cookieNotice.text}
          more={t.cookieNotice.more}
          accept={t.cookieNotice.accept}
        />
      </body>
    </html>
  );
}
