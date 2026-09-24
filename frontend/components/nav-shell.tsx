"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  BuildingIcon,
  CalendarCheckIcon,
  CalendarPlusIcon,
  DashboardIcon,
  HomeIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Locale } from "@/utils/i18n/locales";
import { SITE_NAME } from "@/utils/site";

// Every word this component renders. It is a Client Component — it needs the
// pathname to mark the active tab — and a client component cannot read the
// locale cookie, so the server passes the translated strings in.
export type NavLabels = {
  home: string;
  dashboard: string;
  presenze: string;
  corsi: string;
  registro: string;
  account: string;
  gyms: string;
  signIn: string;
  signOut: string;
  language: string;
  privacy: string;
  themeToLight: string;
  themeToDark: string;
};

const HOME_ITEM = { href: "/", key: "home", icon: HomeIcon } as const;
const PRESENZE_ITEM = {
  href: "/attendance",
  key: "presenze",
  icon: CalendarCheckIcon,
} as const;
const CORSI_ITEM = { href: "/courses", key: "corsi", icon: CalendarPlusIcon } as const;
const REGISTRO_ITEM = { href: "/members", key: "registro", icon: UsersIcon } as const;
const DASHBOARD_ITEM = {
  href: "/dashboard",
  key: "dashboard",
  icon: DashboardIcon,
} as const;
const ACCOUNT_ITEM = { href: "/account", key: "account", icon: UserIcon } as const;
const GYMS_ITEM = { href: "/gyms", key: "gyms", icon: BuildingIcon } as const;

// Only so the list below has a type wide enough to hold every item: an array
// literal of two entries infers those two `href` strings and rejects the third.
type NavItem =
  | typeof HOME_ITEM
  | typeof DASHBOARD_ITEM
  | typeof PRESENZE_ITEM
  | typeof CORSI_ITEM
  | typeof REGISTRO_ITEM
  | typeof ACCOUNT_ITEM
  | typeof GYMS_ITEM;

// Hiding a link is a convenience, never the access control: /members, /courses
// and /attendance each verify the privilege themselves, and the RLS policies
// verify it again in the database.
function navItemsFor(
  isLoggedIn: boolean,
  canViewRegistry: boolean,
  canManageClasses: boolean,
  isPlatformAdmin: boolean,
) {
  if (!isLoggedIn) {
    // Home is the whole menu for a visitor: every other section requires a
    // session, so offering them only produces a bounce through /login.
    return [HOME_ITEM];
  }

  // The platform superadmin belongs to no gym: their whole portal is the list
  // of gyms and their own account.
  if (isPlatformAdmin) {
    return [GYMS_ITEM, ACCOUNT_ITEM];
  }

  // Home is deliberately absent for *every* signed-in user, staff included —
  // it is the landing page for people who arrive without logging in, and the
  // proxy redirects an authenticated visitor away from it.
  // Dashboard leads for everyone: it is where login lands, so the first tab and
  // the landing page are the same place. Presenze follows it for everyone too,
  // students included — check-in has to live where the lessons are listed, and
  // there is only one such list.
  const items: NavItem[] = [DASHBOARD_ITEM, PRESENZE_ITEM];
  if (canManageClasses) {
    items.push(CORSI_ITEM);
  }
  if (canViewRegistry) {
    // The eligibility queue is a summary line and a filter inside the
    // Registro, not a tab of its own: one list of people, not two.
    items.push(REGISTRO_ITEM);
  }
  items.push(ACCOUNT_ITEM);
  return items;
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function NavShell({
  children,
  isLoggedIn,
  canViewRegistry,
  canManageClasses,
  isPlatformAdmin,
  gymName,
  locale,
  labels,
}: {
  children: ReactNode;
  isLoggedIn: boolean;
  canViewRegistry: boolean;
  canManageClasses: boolean;
  isPlatformAdmin: boolean;
  gymName: string | null;
  locale: Locale;
  labels: NavLabels;
}) {
  const pathname = usePathname();
  const navItems = navItemsFor(isLoggedIn, canViewRegistry, canManageClasses, isPlatformAdmin);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5 sm:px-8 sm:py-4">
          {/* Signed in, the logo goes to the dashboard rather than to "/",
              which would only bounce through the proxy's redirect — except for
              the platform superadmin, whose dashboard is the list of gyms. */}
          <Link
            href={!isLoggedIn ? "/" : isPlatformAdmin ? "/gyms" : "/dashboard"}
            className="flex items-center gap-2"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary p-1.5">
              <Image
                src="/logo/faixabjj_only-removebg-preview.png"
                alt=""
                width={500}
                height={500}
                priority
                className="h-full w-full object-contain"
              />
            </span>
            {/* The brand, never translated and never retyped: SITE_NAME is the
                one definition the metadata and the sitemap also read. */}
            <span className="font-heading text-lg font-bold tracking-tight">
              {SITE_NAME}
            </span>
            {gymName ? (
              <span className="hidden max-w-[12rem] truncate border-l border-border pl-2 text-sm text-foreground/60 sm:inline">
                {gymName}
              </span>
            ) : null}
          </Link>
          <div className="flex items-center gap-2">
            <nav className="hidden gap-1 sm:flex">
              {navItems.map(({ href, key }) => (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    isActive(pathname, href)
                      ? "bg-foreground text-background"
                      : "text-foreground/70 hover:bg-muted"
                  }`}
                >
                  {labels[key]}
                </Link>
              ))}
            </nav>
            {isLoggedIn ? (
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="rounded-full px-3.5 py-1.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted"
                >
                  {labels.signOut}
                </button>
              </form>
            ) : (
              <Link
                href="/login"
                className="rounded-full px-3.5 py-1.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted"
              >
                {labels.signIn}
              </Link>
            )}
            <LanguageSwitcher locale={locale} label={labels.language} />
            <ThemeToggle toLight={labels.themeToLight} toDark={labels.themeToDark} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-4 sm:px-8 sm:pb-10 sm:pt-8">
        {children}
      </main>

      {/* One link, on every page: the privacy notice has to be reachable from
          anywhere, signed in or not, and a footer is where people look for it.
          Extra bottom padding on small screens so the mobile tab bar does not
          cover it. */}
      <footer className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-8 sm:pb-8">
        <div className="border-t border-border pt-4 text-xs text-foreground/55">
          <Link href="/privacy" className="hover:text-foreground">
            {labels.privacy}
          </Link>
        </div>
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur sm:hidden">
        <div className="flex items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
          {navItems.map(({ href, key, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  active ? "text-accent" : "text-foreground/55"
                }`}
              >
                <Icon className="h-5 w-5" />
                {labels[key]}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
