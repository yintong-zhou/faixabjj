import type { Metadata, Viewport } from "next";
import { Sora, Work_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { NavShell } from "@/components/nav-shell";
import { createClient } from "@/utils/supabase/server";
import { getAccess } from "@/utils/supabase/require-admin";
import { SITE_NAME, SITE_URL } from "@/utils/site";
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

export const metadata: Metadata = {
  // Absolute base for every relative URL below. Without it Open Graph tags
  // and canonical links resolve to nothing and crawlers drop them.
  metadataBase: new URL(SITE_URL),
  // Interior pages set only their own title; the template adds the brand.
  title: {
    default: "FAIXABJJ - ore, gradi e cinture per palestre di BJJ",
    template: "%s · FAIXABJJ",
  },
  description:
    "Traccia ore di lezione, gradi e passaggi di cintura in una scuola di Brazilian Jiu-Jitsu, con un registro unico per allievi e istruttori.",
  applicationName: SITE_NAME,
  keywords: [
    "Brazilian Jiu-Jitsu",
    "BJJ",
    "gestione palestra BJJ",
    "registro presenze BJJ",
    "conteggio ore allenamento",
    "gradi e cinture",
    "promozione cintura BJJ",
  ],
  category: "sports",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "it_IT",
    url: "/",
    images: [
      {
        url: "/logo/faixabjj_logo.png",
        width: 618,
        height: 404,
        alt: "FAIXA BJJ",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "FAIXABJJ",
    description:
      "Ore, gradi e cinture per una scuola di Brazilian Jiu-Jitsu, in un registro unico.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  formatDetection: { telephone: false, email: false, address: false },
};

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
  const supabase = createClient(await cookies());
  const { data: claimsData } = await supabase.auth.getClaims();
  const isLoggedIn = !!claimsData?.claims;
  // Drives which nav items the shell renders. Students and assistants never
  // see Registro/Presenze; the pages enforce it too, this only hides the links.
  // Presenze is shown to everyone — that is where check-in lives.
  const access = isLoggedIn ? await getAccess(supabase) : null;
  const canViewRegistry = access?.canViewRegistry ?? false;
  const canManageClasses = access?.canManageClasses ?? false;

  return (
    <html
      lang="it"
      className={`${sora.variable} ${workSans.variable} h-full antialiased`}
      // The blocking script below sets `data-theme` on this element before
      // React hydrates, on purpose — the server render never knows the
      // stored theme, so this attribute is expected to differ and should
      // not be reconciled as a hydration error.
      suppressHydrationWarning
    >
      <head>
        {/* Runs before paint so a stored theme choice applies immediately,
            with no flash of the system-default theme first. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NavShell
          isLoggedIn={isLoggedIn}
          canViewRegistry={canViewRegistry}
          canManageClasses={canManageClasses}
        >
          {children}
        </NavShell>
      </body>
    </html>
  );
}
