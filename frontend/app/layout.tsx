import type { Metadata, Viewport } from "next";
import { Sora, Work_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { NavShell } from "@/components/nav-shell";
import { createClient } from "@/utils/supabase/server";
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
  title: "FAIXABJJ",
  description:
    "Traccia ore di lezione, gradi e passaggi di cintura in una scuola di Brazilian Jiu-Jitsu, con un registro unico per studenti e istruttori.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16181d",
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = createClient(await cookies());
  const { data: claimsData } = await supabase.auth.getClaims();
  const isLoggedIn = !!claimsData?.claims;

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
        <NavShell isLoggedIn={isLoggedIn}>{children}</NavShell>
      </body>
    </html>
  );
}
